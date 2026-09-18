"use client";

/**
 * Fase 3 / D-079..D-088 — Aceptación de QR de transferencia presencial.
 *
 * Milestone consignación (D-104/D-105, spec §8-§9): la misma ruta pública
 * ramifica la UI por `purpose` del preview (resolución PM §3.3):
 * - "transfer" (default): flujo clásico persona→persona (D-080).
 * - "take": QR de TOMA — un miembro autenticado de una concesionaria lo
 *   escanea en representación (contexto DEALERSHIP, D-TL-12). Exige
 *   seleccionar la concesionaria receptora antes de confirmar.
 * - "sale": QR de VENTA — la concesionaria (fromDealership) transfiere al
 *   comprador; se conserva el flujo de confirmación D-082/D-083.
 * - "return": QR inverso de DEVOLUCIÓN — el vendedor original recupera la
 *   titularidad.
 *
 * Ruta pública de deep link: /transfer/qr/[token]. El backend genera el QR
 * con URL `${FRONTEND_URL}/transfer/qr/{token}` (D-080).
 *
 * Flujo:
 * 1. Requiere sesión (JwtAuth). Si el usuario no está autenticado, se lo
 *    manda a /login?next=... (AuthProvider bootstrap + redirect).
 * 2. Carga el preview (GET vehicles/transfer/qr/:token) → vehículo + emisor
 *    (+ purpose + fromDealership cuando aplica).
 * 3. Confirmación explícita → POST .../accept (body confirmation:true). En
 *    "take" el contexto DEALERSHIP se setea antes de aceptar para que el
 *    cliente API inyecte X-Context-Type/Id.
 * 4. One-shot: 410 revocado / 409 consumido / 400 self / 404 expirado.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { selectDealership } from "@/lib/active-context";
import { vehicleApi } from "@/lib/api";
import { resolveQrPurpose } from "@/lib/consignment";
import {
  resolveQrAcceptErrorMessage,
  resolveQrPreviewErrorMessage,
} from "@/lib/transfer-errors";
import type {
  TransferQrPreview,
  TransferQrPurpose,
} from "@/types/vehicle";

function UserName(user?: TransferQrPreview["fromUser"] | null): string {
  if (!user) return "Usuario";
  if (user.alias?.trim()) return `@${user.alias.trim()}`;
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Usuario";
}

const PURPOSE_ICONS: Record<TransferQrPurpose, React.ComponentType<{ className?: string }>> = {
  take: Store,
  sale: Car,
  return: Car,
  transfer: ShieldCheck,
};

function purposeTitle(purpose: TransferQrPurpose): string {
  switch (purpose) {
    case "take":
      return "Recibo del vehículo en consignación";
    case "sale":
      return "Compra de vehículo";
    case "return":
      return "Devolución de vehículo";
    default:
      return "Transferencia de vehículo";
  }
}

function purposeDescription(preview: TransferQrPreview, purpose: TransferQrPurpose): string {
  switch (purpose) {
    case "take":
      return `${UserName(preview.fromUser)} quiere entregar este vehículo a tu concesionaria. Elegíla y confirmá la recepción en su representación.`;
    case "sale":
      return preview.fromDealership
        ? `La concesionaria ${preview.fromDealership.name} te transfiere este vehículo. Confirmá para aceptarlo.`
        : `${UserName(preview.fromUser)} te transfiere el vehículo. Confirmá para aceptarlo.`;
    case "return":
      return preview.fromDealership
        ? `La concesionaria ${preview.fromDealership.name} te devuelve este vehículo. Confirmá para recuperar la titularidad.`
        : `${UserName(preview.fromUser)} te devuelve este vehículo. Confirmá para recuperar la titularidad.`;
    default:
      return `${UserName(preview.fromUser)} te quiere transferir un vehículo presencialmente. Confirmá para aceptarlo.`;
  }
}

function purposeButtonLabel(purpose: TransferQrPurpose): string {
  switch (purpose) {
    case "take":
      return "Confirmar recepción";
    case "return":
      return "Aceptar devolución";
    default:
      return "Aceptar y recibir vehículo";
  }
}

function purposeFooterText(purpose: TransferQrPurpose, dealershipName?: string): string {
  switch (purpose) {
    case "take":
      return dealershipName
        ? `Al confirmar, ${dealershipName} asume la responsabilidad del vehículo hasta la venta o devolución.`
        : "Al confirmar, la concesionaria asume la responsabilidad del vehículo hasta la venta o devolución.";
    case "return":
      return "Al aceptar, recuperás la titularidad del vehículo.";
    default:
      return "Al aceptar, el vehículo pasará a estar bajo tu titularidad.";
  }
}

function purposeDoneText(purpose: TransferQrPurpose, dealershipName?: string): string {
  switch (purpose) {
    case "take":
      return dealershipName
        ? `El vehículo quedó en consignación en ${dealershipName}.`
        : "El vehículo quedó en consignación en la concesionaria.";
    case "return":
      return "Recuperaste la titularidad del vehículo.";
    default:
      return "La transferencia se completó con éxito. Ya sos el titular del vehículo.";
  }
}

export default function TransferQrAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const router = useRouter();
  const { status, user } = useAuth();
  const activeContext = useActiveContext();

  const [preview, setPreview] = useState<TransferQrPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dealershipId, setDealershipId] = useState<string>("");
  const started = useRef(false);

  // Unauthenticated → login preserving the QR deep link as `next`.
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = token ? `/transfer/qr/${encodeURIComponent(token)}` : "/transferencias";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, token, router]);

  // Pre-select the active DEALERSHIP context when the page opens (take flow).
  useEffect(() => {
    if (activeContext?.type === "DEALERSHIP") {
      setDealershipId(activeContext.dealershipId);
    }
  }, [activeContext]);

  // Load preview once (authenticated + token present).
  useEffect(() => {
    if (status !== "authenticated" || !token || started.current) return;
    started.current = true;

    vehicleApi
      .previewTransferQr(token)
      .then((data) => setPreview(data))
      .catch((err: unknown) =>
        setPreviewError(resolveQrPreviewErrorMessage(err)),
      )
      .finally(() => setLoading(false));
  }, [status, token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setActionError(null);
    try {
      // Milestone consignación (D-TL-12/D-TL-14): la toma se confirma en
      // representación — setea el contexto DEALERSHIP para que el cliente API
      // inyecte X-Context-Type/Id (el backend valida la membresía, RB-02).
      if (resolveQrPurpose(preview) === "take") {
        if (!dealershipId) {
          setActionError("Seleccioná la concesionaria que va a recibir el vehículo.");
          setAccepting(false);
          return;
        }
        selectDealership(dealershipId);
      }
      await vehicleApi.acceptTransferQr(token);
      setDone(true);
    } catch (err: unknown) {
      setActionError(resolveQrAcceptErrorMessage(err));
    } finally {
      setAccepting(false);
    }
  };

  const purpose = resolveQrPurpose(preview);
  const dealershipMemberships = user?.dealershipMemberships ?? [];
  const selectedDealership = dealershipMemberships.find(
    (m) => m.dealershipId === dealershipId,
  );
  const PurposeIcon = PURPOSE_ICONS[purpose];
  const noDealershipToReceive =
    purpose === "take" && dealershipMemberships.length === 0;

  if (!token) {
    return (
      <CenteredCard
        icon={<AlertCircle className="h-10 w-10 text-destructive" />}
        title="QR inválido"
        body="El enlace no contiene un QR válido. Escaneá el QR de transferencia nuevamente."
        action={
          <Link href="/transferencias">
            <Button variant="outline" className="w-full">
              Ir a transferencias
            </Button>
          </Link>
        }
      />
    );
  }

  if (done) {
    return (
      <CenteredCard
        icon={<CheckCircle2 className="h-10 w-10 text-green-600" />}
        title={purpose === "take" ? "¡Recepción confirmada!" : "¡Transferencia completada!"}
        body={purposeDoneText(purpose, selectedDealership?.dealershipName)}
        action={
          <Link href="/vehicles">
            <Button className="w-full">Ver mis vehículos</Button>
          </Link>
        }
      />
    );
  }

  if (loading) {
    return (
      <CenteredCard
        icon={<Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />}
        title="Cargando QR…"
        body="Estamos validando el QR de transferencia."
      />
    );
  }

  if (previewError) {
    return (
      <CenteredCard
        icon={<AlertCircle className="h-10 w-10 text-destructive" />}
        title="No se pudo abrir el QR"
        body={previewError}
        action={
          <Link href="/transferencias">
            <Button variant="outline" className="w-full">
              Ir a transferencias
            </Button>
          </Link>
        }
      />
    );
  }

  if (!preview) {
    return null;
  }

  if (noDealershipToReceive) {
    return (
      <CenteredCard
        icon={<AlertCircle className="h-10 w-10 text-destructive" />}
        title="Necesitás una concesionaria"
        body="Este QR es una toma de consignación. Para recibirlo, primero tenés que crear o unirte a una concesionaria."
        action={
          <Link href="/dealerships">
            <Button className="w-full">Ver concesionarias</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PurposeIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-semibold">
              {purposeTitle(purpose)}
            </CardTitle>
          </div>
          <CardDescription>
            {purposeDescription(preview, purpose)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Car className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-lg font-semibold">{preview.vehicle.name}</p>
            <p className="text-sm text-muted-foreground">
              Patente: {preview.vehicle.licensePlate}
            </p>
          </div>

          {purpose === "take" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qr-take-dealership">
                Concesionaria que recibe el vehículo
              </Label>
              <Select
                id="qr-take-dealership"
                value={dealershipId}
                onChange={(e) => setDealershipId(e.target.value)}
              >
                <option value="">Seleccioná una concesionaria…</option>
                {dealershipMemberships.map((membership) => (
                  <option
                    key={membership.dealershipId}
                    value={membership.dealershipId}
                  >
                    {membership.dealershipName}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Confirmás la recepción en representación de esta concesionaria.
              </p>
            </div>
          )}

          {actionError && (
            <p
              role="alert"
              className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {actionError}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            className="w-full"
            disabled={accepting || (purpose === "take" && !dealershipId)}
            onClick={handleAccept}
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aceptando…
              </>
            ) : (
              purposeButtonLabel(purpose)
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {purposeFooterText(purpose, selectedDealership?.dealershipName)}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

function CenteredCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">{icon}</div>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {body}
        </CardContent>
        {action && <CardFooter className="flex flex-col gap-2">{action}</CardFooter>}
      </Card>
    </div>
  );
}