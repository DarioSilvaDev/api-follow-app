"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Car,
  Gauge,
  Loader2,
  RotateCw,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AttachmentsUploader } from "@/components/care-episode/attachments-uploader";
import { EvidenceGallery } from "@/components/care-episode/evidence-gallery";
import { RemoveAttachmentDialog } from "@/components/care-episode/remove-attachment-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import { careEpisodeApi } from "@/lib/api";
import {
  resolveAttachmentDeleteErrorMessage,
  resolveCareEpisodeDetailErrorMessage,
} from "@/lib/care-episode-errors";
import {
  canRemoveAttachment,
  removalReasonRequired,
} from "@/lib/care-episode-permissions";
import type {
  CareEpisodeAttachment,
  RemovedAttachmentReason,
} from "@/types/care-episode";

// ---------------------------------------------------------------------------
// Iteración 2-4 (S1/S4/S5/S6) — Detalle del servicio (deep-linkable).
// Ruta: /vehicles/[id]/servicios/[servicioId]
// - GET   /care-episodes/:id (?signed=true) → proyección por actor (S1).
// - POST  /:id/attachments / DELETE /:id/attachments/:attachmentId → S4/S5.
// - La via de acceso 403 del backend se traduce a 404 (sin revelación); la
//   página maneja ambas terminales con Reintentar o Volver al vehículo.
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<CareEpisodeDetailStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: "Abierto", variant: "info" },
  delivered: { label: "Entregado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

type CareEpisodeDetailStatus = "open" | "delivered" | "cancelled";
type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

export default function CareEpisodeDetailPage() {
  const params = useParams<{ id: string; servicioId: string }>();
  const vehicleId = params.id;
  const servicioId = params.servicioId;

  const { user } = useAuth();
  const activeContext = useActiveContext();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["care-episode", servicioId] });

  const detailQuery = useQuery({
    queryKey: ["care-episode", servicioId],
    queryFn: () =>
      careEpisodeApi.getCareEpisodeDetail(servicioId, { signed: true }),
    retry: false,
  });

  const [attachmentToRemove, setAttachmentToRemove] =
    useState<CareEpisodeAttachment | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removeMutation = useMutation({
    mutationFn: ({
      attachmentId,
      removedReason,
    }: {
      attachmentId: string;
      removedReason?: RemovedAttachmentReason;
    }) =>
      careEpisodeApi.deleteAttachment(
        servicioId,
        attachmentId,
        removedReason ? { removedReason } : {},
      ),
    onSuccess: () => {
      setAttachmentToRemove(null);
      setRemoveError(null);
      invalidate();
    },
    onError: (error) => {
      setRemoveError(resolveAttachmentDeleteErrorMessage(error));
    },
  });

  const activeWorkshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;

  // ── Estados base ──
  if (detailQuery.isLoading) {
    return (
      <div
        role="status"
        aria-label="Cargando servicio"
        className="flex flex-col items-center justify-center gap-3 py-24"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Cargando servicio...</p>
      </div>
    );
  }

  // El guard también cubre un data ausente sin `isError` (mismo patrón que
  // `vehicles/[id]/page.tsx` RF-6): evita que `detail` quede `undefined`
  // más abajo en el render.
  if (detailQuery.isError || !detailQuery.data) {
    const message = resolveCareEpisodeDetailErrorMessage(detailQuery.error);
    const isNotFound = (detailQuery.error as { status?: number } | undefined)?.status === 404;
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="rounded-full bg-muted p-3">
          <Wrench className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="grid gap-1">
          <h1 className="text-base font-semibold">
            {isNotFound ? "Servicio no encontrado" : "No se pudo cargar el servicio"}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex items-center gap-2">
          {isNotFound ? (
            <Link
              href={`/vehicles/${vehicleId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al vehículo
            </Link>
          ) : (
            <Button variant="outline" onClick={() => detailQuery.refetch()}>
              <RotateCw className="h-4 w-4" />
              Reintentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  const detail = detailQuery.data;

  // ── Permisos de evidencia (hint de UI; la autoridad es el backend) ──
  const permissionCtx = {
    currentUserId: user?.id ?? null,
    activeWorkshopId,
    isVehicleOwner: user?.isVehicleOwner ?? false,
    episodeWorkshopId: detail.workshopId,
  };
  const canRemove = canRemoveAttachment(permissionCtx);
  const reasonRequired = removalReasonRequired(permissionCtx);

  // ── Zona de subida S4 (espejo de assertWritableState del handler) ──
  const canUpload =
    detail.source === "workshop" &&
    activeWorkshopId === detail.workshopId &&
    detail.status === "open" &&
    detail.verification === "unverified";

  const statusLabel = STATUS_LABELS[detail.status];
  const vehicleName = [detail.vehicle.brand, detail.vehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href={`/vehicles/${vehicleId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al vehículo
      </Link>

      {/* ── Encabezado + metadatos ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex-1 min-w-0">
              {detail.title || "Servicio"}
            </CardTitle>
            <Badge variant={statusLabel.variant}>{statusLabel.label}</Badge>
            {detail.source === "owner" && (
              <Badge variant="outline">
                {detail.verification === "verified"
                  ? "Verificado"
                  : "Registrado por el propietario"}
              </Badge>
            )}
          </div>
          <CardDescription>
            {detail.vehicle.licensePlate}
            {vehicleName ? ` · ${vehicleName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <MetaRow
            icon={CalendarDays}
            label="Fecha del servicio"
            value={formatDate(detail.serviceDate)}
          />
          <MetaRow
            icon={Car}
            label="Vehículo"
            value={[
              detail.vehicle.licensePlate,
              detail.vehicle.manufactureYear ?? null,
            ]
              .filter((part): part is string | number => Boolean(part))
              .join(" · ") || "—"}
          />
          <MetaRow
            icon={Building2}
            label="Taller"
            value={detail.workshopName || "—"}
          />
          <MetaRow
            icon={Gauge}
            label="Kilometraje"
            value={
              detail.mileageIn !== null && detail.mileageIn !== undefined
                ? `${detail.mileageIn.toLocaleString("es-AR")} km`
                : "—"
            }
          />

          {detail.customerComplaint ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Reclamo del cliente</p>
              <p className="font-medium whitespace-pre-wrap">
                {detail.customerComplaint}
              </p>
            </div>
          ) : null}

          {detail.customerNotes ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Notas del cliente</p>
              <p className="font-medium whitespace-pre-wrap">
                {detail.customerNotes}
              </p>
            </div>
          ) : null}

          {/* Solo el taller del episodio recibe internalNotes (proyección). */}
          {detail.internalNotes ? (
            <div className="sm:col-span-2 rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">Notas internas</p>
              <p className="font-medium whitespace-pre-wrap">
                {detail.internalNotes}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Evidencia ── */}
      <Card>
        <CardHeader>
          <CardTitle>
            Evidencia
            {detail.attachmentCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {detail.attachmentCount}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Fotos antes, durante y después del servicio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {canUpload && (
            <div className="rounded-lg border border-dashed border-foreground/20 p-4">
              <AttachmentsUploader
                episodeId={servicioId}
                defaultPhase="after"
                existingCount={detail.attachmentCount}
                onUploaded={invalidate}
              />
            </div>
          )}

          <EvidenceGallery
            groups={detail.attachments}
            canRemove={canRemove}
            onRemoveRequest={(attachment) => {
              setRemoveError(null);
              setAttachmentToRemove(attachment);
            }}
          />
        </CardContent>
      </Card>

      {/* ── Confirmación de eliminación (S5) ── */}
      <RemoveAttachmentDialog
        open={attachmentToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAttachmentToRemove(null);
        }}
        attachment={attachmentToRemove}
        requiresReason={reasonRequired}
        isSubmitting={removeMutation.isPending}
        errorMessage={removeError}
        onConfirm={(removedReason) => {
          if (!attachmentToRemove) return;
          removeMutation.mutate({
            attachmentId: attachmentToRemove.id,
            removedReason,
          });
        }}
      />
    </div>
  );
}