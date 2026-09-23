"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  REMOVAL_REASON_LABELS,
  type RemovalReasonOptions,
} from "@/lib/care-episode-permissions";
import type {
  CareEpisodeAttachment,
  RemovedAttachmentReason,
} from "@/types/care-episode";

/**
 * Iteración 2-4 (S5) — Confirmación de eliminación de evidencia.
 *
 * Copy EXACTO aprobado: "Se eliminará de la historia del vehículo. Esta
 * acción no se puede deshacer."
 *
 * `requiresReason` (owner cleanup del backend): muestra el Select de motivo
 * OBLIGATORIO; el Submit queda deshabilitado hasta elegir una razón.
 * Errores de la mutación inline (role="alert"), convención del repo.
 */
export interface RemoveAttachmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: CareEpisodeAttachment | null;
  /** Owner actuando fuera del taller del episodio → motivo obligatorio (S5). */
  requiresReason?: boolean;
  isSubmitting?: boolean;
  /** Error de la mutación del caller (inline). */
  errorMessage?: string | null;
  onConfirm: (removedReason?: RemovedAttachmentReason) => void;
}

export function RemoveAttachmentDialog({
  open,
  onOpenChange,
  attachment,
  requiresReason = false,
  isSubmitting = false,
  errorMessage = null,
  onConfirm,
}: RemoveAttachmentDialogProps) {
  const [reason, setReason] = useState<RemovalReasonOptions | "">("");

  // Reset al abrir (evita que un motivo previo quede seleccionado).
  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  const submitDisabled =
    isSubmitting || (requiresReason && reason === "");

  return (
    <Dialog
      open={open && attachment !== null}
      onOpenChange={(next) => {
        if (isSubmitting && next) return;
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogTitle>Eliminar imagen</DialogTitle>
        <DialogDescription>
          {attachment && (
            <span className="block truncate italic text-foreground/70">
              {attachment.caption || attachment.originalName}
            </span>
          )}
          Se eliminará de la historia del vehículo. Esta acción no se puede
          deshacer.
        </DialogDescription>

        <div className="grid gap-3">
          {requiresReason && (
            <div className="grid gap-1.5">
              <Label htmlFor="remove-reason">Motivo</Label>
              <Select
                id="remove-reason"
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as RemovalReasonOptions | "")
                }
                disabled={isSubmitting}
                aria-invalid={isSubmitting ? undefined : reason === ""}
              >
                <option value="">Seleccioná un motivo</option>
                {(
                  Object.keys(REMOVAL_REASON_LABELS) as RemovalReasonOptions[]
                ).map((key) => (
                  <option key={key} value={key}>
                    {REMOVAL_REASON_LABELS[key]}
                  </option>
                ))}
              </Select>
              {reason === "" && (
                <p className="text-xs text-muted-foreground">
                  Indicá el motivo por el que se elimina la imagen.
                </p>
              )}
            </div>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" disabled={isSubmitting} />}>
            Cancelar
          </DialogClose>
          <Button
            variant="destructive"
            disabled={submitDisabled}
            onClick={() =>
              onConfirm(requiresReason ? (reason as RemovedAttachmentReason) : undefined)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Eliminando...
              </>
            ) : (
              "Eliminar"
            )}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}