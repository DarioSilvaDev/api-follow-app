"use client";

/**
 * Fase 3 / D-079..D-088 — Aceptación de QR de transferencia presencial.
 *
 * Ruta pública de deep link: /transfer/qr/[token]. El backend genera el QR
 * con URL `${FRONTEND_URL}/transfer/qr/{token}` (D-080).
 *
 * Flujo:
 * 1. Requiere sesión (JwtAuth). Si el usuario no está autenticado, se lo
 *    manda a /login?next=... (AuthProvider bootstrap + redirect).
 * 2. Carga el preview (GET vehicles/transfer/qr/:token) → vehículo + emisor.
 * 3. Botón de confirmación explícita → POST .../accept (body confirmation:true).
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
import { useAuth } from "@/hooks/use-auth";
import { vehicleApi } from "@/lib/api";
import {
  resolveQrAcceptErrorMessage,
  resolveQrPreviewErrorMessage,
} from "@/lib/transfer-errors";
import type { TransferQrPreview } from "@/types/vehicle";

function UserName(user?: TransferQrPreview["fromUser"] | null): string {
  if (!user) return "Usuario";
  if (user.alias?.trim()) return `@${user.alias.trim()}`;
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Usuario";
}

export default function TransferQrAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const router = useRouter();
  const { status } = useAuth();

  const [preview, setPreview] = useState<TransferQrPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const started = useRef(false);

  // Unauthenticated → login preserving the QR deep link as `next`.
  useEffect(() => {
    if (status === "unauthenticated") {
      const next = token ? `/transfer/qr/${encodeURIComponent(token)}` : "/transferencias";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, token, router]);

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
      await vehicleApi.acceptTransferQr(token);
      setDone(true);
    } catch (err: unknown) {
      setActionError(resolveQrAcceptErrorMessage(err));
    } finally {
      setAccepting(false);
    }
  };

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
        title="¡Transferencia completada!"
        body="La transferencia se completó con éxito. Ya sos el titular del vehículo."
        action={
          <Link href="/vehiculos">
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

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-semibold">
              Transferencia de vehículo
            </CardTitle>
          </div>
          <CardDescription>
            {UserName(preview.fromUser)} te quiere transferir un vehículo
            presencialmente. Confirmá para aceptarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Car className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-lg font-semibold">{preview.vehicle.name}</p>
            <p className="text-sm text-muted-foreground">
              Patente: {preview.vehicle.licensePlate}
            </p>
          </div>
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
            disabled={accepting}
            onClick={handleAccept}
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aceptando…
              </>
            ) : (
              "Aceptar y recibir vehículo"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Al aceptar, el vehículo pasará a estar bajo tu titularidad.
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