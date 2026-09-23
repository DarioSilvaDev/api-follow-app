"use client";

import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  REMOVAL_UNAUTHORIZED_TOOLTIP,
} from "@/lib/care-episode-permissions";
import { orderedAttachmentGroups } from "@/lib/attachments";
import type {
  CareEpisodeAttachment,
  CareEpisodeAttachmentGroups,
} from "@/types/care-episode";

/**
 * Iteración 2-4 (S1) — Galería de evidencia del episodio.
 *
 * Render de los grupos que ya vienen agrupados del backend, en el orden UX
 * Antes → Trabajo → Después → General (orderedAttachmentGroups omite vacíos).
 * Cada ítem es una imagen lista (el detalle se carga con signed=true, así que
 * `url` siempre está presente; si no, placeholder defensivo).
 *
 * Eliminación (S5):
 * - `canRemove` → botón ghost por ítem (abre RemoveAttachmentDialog).
 * - `!canRemove` → botón deshabilitado con tooltip nativo `title` (no existe
 *   primitiva Tooltip en components/ui — decisión FE-2026-024).
 */
export interface EvidenceGalleryProps {
  groups: CareEpisodeAttachmentGroups;
  /** canRemoveAttachment(ctx) — hint de UI, NO autorización. */
  canRemove: boolean;
  /** Abre el dialog con el adjunto seleccionado. */
  onRemoveRequest?: (attachment: CareEpisodeAttachment) => void;
}

export function EvidenceGallery({
  groups,
  canRemove,
  onRemoveRequest,
}: EvidenceGalleryProps) {
  const ordered = orderedAttachmentGroups(groups);

  if (ordered.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="Sin imágenes de evidencia"
        description="Cuando el taller o el propietario adjunten fotos, van a aparecer acá."
      />
    );
  }

  return (
    <div className="grid gap-6">
      {ordered.map((group) => (
        <section key={group.key} aria-label={`Fase ${group.label}`}>
          <h3 className="mb-2 text-sm font-medium text-foreground">
            {group.label}
            <span className="ml-2 text-xs text-muted-foreground">
              {group.attachments.length}
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.attachments.map((attachment) => {
              const alt =
                attachment.caption || "Evidencia de servicio";
              return (
                <figure
                  key={attachment.id}
                  className="group relative overflow-hidden rounded-lg border border-foreground/10"
                >
                  {attachment.url ? (
                    // eslint-disable-next-line @next/next/no-img-element — URL firmada del S3 (R2/B2), no remotePattern del dominio.
                    <img
                      src={attachment.url}
                      alt={alt}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <figcaption className="sr-only">{alt}</figcaption>

                  {canRemove && onRemoveRequest ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-2 top-2 h-7 w-7 bg-background/80 text-foreground backdrop-blur-sm transition-opacity hover:bg-background focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      aria-label={`Eliminar imagen ${alt}`}
                      onClick={() => onRemoveRequest(attachment)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span
                      title={REMOVAL_UNAUTHORIZED_TOOLTIP}
                      data-testid="remove-disabled"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-background/80 text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}