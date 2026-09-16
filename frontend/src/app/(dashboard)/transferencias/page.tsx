"use client";

/**
 * Fase 1 / D-078 — Panel de transferencias (/transferencias).
 *
 * Dos pestañas (Base UI Tabs, lazy por keepsMounted=false):
 * - Recibidas: transferencias dirigidas al usuario (Aceptar / Rechazar).
 * - Enviadas: transferencias iniciadas por el usuario (Cancelar).
 *
 * Contrato D-078 (objetivo): items con `vehicle` desnormalizado y
 * `fromUser`/`toUser` simétricos SIN email (PII). La UI nunca muestra el
 * email de la contraparte — siempre alias → nombre completo → "Usuario".
 *
 * Ajustes UX v2:
 * 1. Recomputo client-side de expirada (§6.5): pending + expiresAt pasado →
 *    effectiveStatus "expired" sin esperar persistencia del backend.
 * 2. En Enviadas, expirada conserva "Cancelar" (D-092, desbloquea el
 *    vehículo). En Recibidas, expirada = terminal, sin acciones (§6.4).
 * 4. Empty states (§6.7): Enviadas vacía con CTA "Transferir vehículo".
 * 5. Doble-submit deshabilitado: spinner "Aceptando…/Rechazando…/Cancelando…"
 *    y fila deshabilitada durante la mutación (§6.6).
 * 6. Feedback post-acción: banner transitorio inline (sin toast) + invalidar
 *    amabas listas Y ["vehicles"] post-aceptación (§6.2).
 * 7. Confirmación Cancelar: primario "Sí, cancelar solicitud" / cierre
 *    "Volver" (§6.4).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Car,
  Inbox,
  Loader2,
  RotateCw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransferDialog } from "@/components/transfer/transfer-dialog";
import { useAuth } from "@/hooks/use-auth";
import { vehicleApi } from "@/lib/api";
import {
  resolveTransferErrorMessage,
  type TransferAction,
} from "@/lib/transfer-errors";
import type {
  Vehicle,
  VehicleTransferListItem,
  VehicleTransferStatus,
  VehicleTransferUser,
} from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<VehicleTransferStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
  expired: "Expirada",
};

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const STATUS_VARIANT: Record<VehicleTransferStatus, BadgeVariant> = {
  pending: "warning",
  accepted: "success",
  rejected: "destructive",
  cancelled: "secondary",
  completed: "success",
  expired: "outline",
};

/** D-078: nunca muestra el email. Alias → nombre completo → "Usuario". */
export function transferUserLabel(
  user?: VehicleTransferUser | null,
): string {
  if (!user) return "Usuario no disponible";
  if (user.alias?.trim()) return user.alias.trim();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || "Usuario";
}

/**
 * Ajuste 1 UX (§6.5): recomputo client-side de expirada. El backend aún
 * devuelve "pending" con expiresAt pasado (expiración lazy, D-088); la UI
 * muestra "Expirada" desde el día 1 sin esperar sweeper.
 */
export function effectiveTransferStatus(
  transfer: Pick<VehicleTransferListItem, "status" | "expiresAt">,
): VehicleTransferStatus {
  if (
    transfer.status === "pending" &&
    transfer.expiresAt &&
    new Date(transfer.expiresAt).getTime() < Date.now()
  ) {
    return "expired";
  }
  return transfer.status;
}

function vehicleMeta(transfer: VehicleTransferListItem): string {
  const years = [transfer.vehicle.manufactureYear, transfer.vehicle.modelYear]
    .filter((year): year is number => typeof year === "number" && Number.isFinite(year))
    .join(" · ");
  return [years, transfer.vehicle.color].filter(Boolean).join(" — ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mismo mecanismo que listado/detalle (D-039 / RF-1): owner = ownership activa. */
function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------

interface TransferItemCardProps {
  transfer: VehicleTransferListItem;
  /** "incoming" → muestra emisor; "outgoing" → muestra receptor. */
  direction: "incoming" | "outgoing";
  /** Error de la última acción (por item). */
  errorMessage?: string | null;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}

function TransferItemCard({
  transfer,
  direction,
  errorMessage,
  busy,
  onAccept,
  onReject,
  onCancel,
}: TransferItemCardProps) {
  const counterpart =
    direction === "incoming" ? transfer.fromUser : transfer.toUser;
  const status = effectiveTransferStatus(transfer);
  const isPending = status === "pending";
  // Ajuste 2 UX (§6.4/D-092): en Enviadas, expirada conserva "Cancelar"
  // (desbloquea el vehículo). En Recibidas, expirada = terminal (sin acciones).
  const canCancel =
    direction === "outgoing" && status !== "cancelled" && (isPending || status === "expired");

  return (
    <Card size="sm">
      <CardContent
        className="flex flex-col gap-3"
        aria-busy={busy || undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/vehicles/${transfer.vehicle.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
            >
              <Car className="h-3.5 w-3.5 text-muted-foreground" />
              {transfer.vehicle.licensePlate}
            </Link>
            <p className="text-xs text-muted-foreground">
              {vehicleMeta(transfer) || "Datos incompletos"}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[status]}>
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {direction === "incoming" ? (
            <>
              De{" "}
              <span className="font-medium text-foreground">
                {transferUserLabel(counterpart)}
              </span>
            </>
          ) : (
            <>
              Para{" "}
              <span className="font-medium text-foreground">
                {transferUserLabel(counterpart)}
              </span>
            </>
          )}
        </p>

        <p className="text-xs text-muted-foreground">
          Pedido el {formatDateTime(transfer.requestedAt)}
        </p>

        {/* Ajuste 1 UX (§6.5): copy de vencimiento por dirección. */}
        {status === "expired" && transfer.expiresAt && (
          <p className="text-xs text-muted-foreground">
            {direction === "incoming"
              ? "La solicitud venció el "
              : "Vencía el "}
            {formatDateTime(transfer.expiresAt)}
          </p>
        )}

        {transfer.notes && (
          <p className="text-sm italic text-muted-foreground">
            “{transfer.notes}”
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        {(isPending || canCancel) && (onAccept || onReject || onCancel) && (
          <div
            className="flex flex-wrap gap-2 pt-1"
            data-busy={busy || undefined}
          >
            {direction === "incoming" && isPending && onAccept && (
              <Button variant="default" size="sm" onClick={onAccept} disabled={busy}>
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Aceptar
              </Button>
            )}
            {direction === "incoming" && isPending && onReject && (
              <Button variant="outline" size="sm" onClick={onReject} disabled={busy}>
                Rechazar
              </Button>
            )}
            {direction === "outgoing" && canCancel && onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
                Cancelar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// List states (loading / error / empty / items)
// ---------------------------------------------------------------------------

function TransfersSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        >
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

interface TransfersListProps {
  items: VehicleTransferListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  direction: "incoming" | "outgoing";
  emptyTitle: string;
  emptyDescription: string;
  /** Ajuste 4 UX (§6.7): Enviadas vacía lleva CTA "Transferir vehículo". */
  emptyAction?: React.ReactNode;
  busyId?: string | null;
  itemError?: { transferId: string; message: string } | null;
  onAccept?: (transfer: VehicleTransferListItem) => void;
  onReject?: (transfer: VehicleTransferListItem) => void;
  onCancel?: (transfer: VehicleTransferListItem) => void;
}

function TransfersList({
  items,
  isLoading,
  isError,
  refetch,
  direction,
  emptyTitle,
  emptyDescription,
  emptyAction,
  busyId,
  itemError,
  onAccept,
  onReject,
  onCancel,
}: TransfersListProps) {
  if (isLoading) {
    return <TransfersSkeleton />;
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No se pudieron cargar las transferencias{" "}
            {direction === "incoming" ? "recibidas" : "enviadas"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ocurrió un error al consultar el servidor. Intentalo nuevamente.
          </p>
          <Button className="mt-4" onClick={refetch}>
            <RotateCw className="h-3.5 w-3.5" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((transfer) => (
        <TransferItemCard
          key={transfer.id}
          transfer={transfer}
          direction={direction}
          errorMessage={
            itemError?.transferId === transfer.id ? itemError.message : null
          }
          busy={busyId === transfer.id}
          onAccept={onAccept ? () => onAccept(transfer) : undefined}
          onReject={onReject ? () => onReject(transfer) : undefined}
          onCancel={onCancel ? () => onCancel(transfer) : undefined}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ConfirmState {
  transfer: VehicleTransferListItem;
  action: TransferAction;
}

const CONFIRM_TITLE: Record<TransferAction, string> = {
  accept: "Aceptar transferencia",
  reject: "Rechazar transferencia",
  cancel: "Cancelar transferencia",
};

const CONFIRM_DESCRIPTION: Record<TransferAction, string> = {
  accept:
    "Al aceptar, la titularidad del vehículo pasa a vos y la transferencia se registra en el historial.",
  reject:
    "Al rechazar, la solicitud queda registrada en el historial y no vas a poder reutilizarla.",
  cancel:
    "Al cancelar, la solicitud queda anulada. La podés registrar en el historial del vehículo.",
};

/** Ajuste 7 UX (§6.4): primario de cancelar evita colisión con el label "Cancelar". */
const CONFIRM_LABEL: Record<TransferAction, string> = {
  accept: "Aceptar",
  reject: "Rechazar",
  cancel: "Sí, cancelar solicitud",
};

/** Ajuste 5 UX (§6.6): spinner con verbo en gerundio durante la mutación. */
const CONFIRM_BUSY_LABEL: Record<TransferAction, string> = {
  accept: "Aceptando…",
  reject: "Rechazando…",
  cancel: "Cancelando…",
};

/** Ajuste 6 UX (§6.2): feedback post-acción (banner inline, sin toast). */
const ACTION_SUCCESS_MESSAGE: Record<TransferAction, string> = {
  accept: "Transferencia aceptada. El vehículo ahora es tuyo.",
  reject: "Transferencia rechazada.",
  cancel: "Transferencia cancelada.",
};

const BANNER_DURATION_MS = 4000;

export default function TransferenciasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [transferOpen, setTransferOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [itemError, setItemError] = useState<{
    transferId: string;
    message: string;
  } | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Ajuste 3b UX (§5.3/RF-4): "Ver solicitud" navega al panel en la pestaña
  // Enviadas vía hash (#enviadas). Lectura controlada; sin useSearchParams
  // (evita el Suspense boundary en el prerender estático de la página).
  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">(() =>
    typeof window !== "undefined" && window.location.hash === "#enviadas"
      ? "outgoing"
      : "incoming",
  );

  // Ajuste 6 UX: banner transitorio — se auto-oculta tras BANNER_DURATION_MS.
  useEffect(() => {
    if (!successBanner) return;
    const timer = setTimeout(() => setSuccessBanner(null), BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [successBanner]);

  // Listas (D-078). staleTime: al switchear pestañas el tab no montado se
  // desmonta (keepMounted=false); el cache evita refetchs innecesarios.
  const incomingQuery = useQuery({
    queryKey: ["transfers", "incoming"],
    queryFn: () => vehicleApi.listIncomingTransfers(),
    retry: false,
    staleTime: 30_000,
  });

  const outgoingQuery = useQuery({
    queryKey: ["transfers", "outgoing"],
    queryFn: () => vehicleApi.listOutgoingTransfers(),
    retry: false,
    staleTime: 30_000,
  });

  // Vehículos propios para el CTA "Transferir vehículo" (selector D-084).
  const ownedQuery = useQuery({
    queryKey: ["vehicles", "transfers", "owned"],
    queryFn: () => vehicleApi.listVehicles({ page: 1, limit: 100 }),
    retry: false,
    staleTime: 60_000,
  });

  const ownedVehicles = (ownedQuery.data?.data ?? []).filter((v) =>
    isVehicleOwner(v, user?.id),
  );

  const actionMutation = useMutation({
    mutationFn: ({ transfer, action }: ConfirmState) => {
      if (action === "accept") return vehicleApi.acceptTransfer(transfer.id);
      if (action === "reject") return vehicleApi.rejectTransfer(transfer.id);
      return vehicleApi.cancelTransfer(transfer.id);
    },
    onSuccess: (_data, variables) => {
      // Ajuste 6 UX (§6.2): invalidar AMBAS listas (incoming y outgoing — la
      // contraparte ve el cambio) y ["vehicles"] (post-aceptación el vehículo
      // aparece en "Mis vehículos" de inmediato). El prefijo ["vehicles"]
      // cubre también la query de candidatos ["vehicles","transfers","owned"].
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setSuccessBanner(ACTION_SUCCESS_MESSAGE[variables.action]);
      setConfirming(null);
    },
    onError: (error, variables) => {
      setItemError({
        transferId: variables.transfer.id,
        message: resolveTransferErrorMessage(error, variables.action),
      });
      setConfirming(null);
      // Estado desactualizado (expiró / ya no está pendiente) → refetch.
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
  });

  const handleConfirm = () => {
    if (!confirming) return;
    actionMutation.mutate(confirming);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Transferencias
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestioná los cambios de titularidad de tus vehículos.
          </p>
        </div>
        <Button onClick={() => setTransferOpen(true)}>
          <Send className="h-3.5 w-3.5" />
          Transferir vehículo
        </Button>
      </div>

      {successBanner && (
        <div
          role="status"
          className="rounded-lg border border-success bg-success/10 px-3 py-2 text-sm text-success-foreground"
        >
          {successBanner}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "incoming" | "outgoing")
        }
      >
        <TabsList>
          <TabsTrigger value="incoming">Recibidas</TabsTrigger>
          <TabsTrigger value="outgoing">Enviadas</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          <TransfersList
            items={incomingQuery.data}
            isLoading={incomingQuery.isLoading}
            isError={incomingQuery.isError}
            refetch={() => incomingQuery.refetch()}
            direction="incoming"
            emptyTitle="Sin transferencias recibidas"
            emptyDescription="Si alguien te transfiere un vehículo, la solicitud va a aparecer acá."
            busyId={actionMutation.isPending ? confirming?.transfer.id : null}
            itemError={itemError}
            onAccept={(t) => setConfirming({ transfer: t, action: "accept" })}
            onReject={(t) => setConfirming({ transfer: t, action: "reject" })}
          />
        </TabsContent>

        <TabsContent value="outgoing">
          <TransfersList
            items={outgoingQuery.data}
            isLoading={outgoingQuery.isLoading}
            isError={outgoingQuery.isError}
            refetch={() => outgoingQuery.refetch()}
            direction="outgoing"
            emptyTitle="Sin transferencias enviadas"
            emptyDescription="Cuando transfieras un vehículo, vas a poder seguir el estado desde acá."
            emptyAction={
              <Button
                variant="outline"
                onClick={() => setTransferOpen(true)}
              >
                <Send className="h-3.5 w-3.5" />
                Transferir vehículo
              </Button>
            }
            busyId={actionMutation.isPending ? confirming?.transfer.id : null}
            itemError={itemError}
            onCancel={(t) => setConfirming({ transfer: t, action: "cancel" })}
          />
        </TabsContent>
      </Tabs>

      {/* Confirmación de acción (Aceptar / Rechazar / Cancelar) */}
      <Dialog
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <DialogPopup className="sm:max-w-md">
          <DialogTitle>
            {confirming ? CONFIRM_TITLE[confirming.action] : ""}
          </DialogTitle>
          <DialogDescription>
            {confirming ? CONFIRM_DESCRIPTION[confirming.action] : ""}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            {confirming && (
              <>
                Vehículo{" "}
                <span className="font-medium text-foreground">
                  {confirming.transfer.vehicle.licensePlate}
                </span>
              </>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(null)}
              disabled={actionMutation.isPending}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant={
                confirming?.action === "accept" ? "default" : "destructive"
              }
              onClick={handleConfirm}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {confirming
                ? actionMutation.isPending
                  ? CONFIRM_BUSY_LABEL[confirming.action]
                  : CONFIRM_LABEL[confirming.action]
                : ""}
            </Button>
          </div>
        </DialogPopup>
      </Dialog>

      {/* Alta de transferencia (selector de vehículos propios, D-084) */}
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        vehicles={ownedVehicles}
      />
    </div>
  );
}