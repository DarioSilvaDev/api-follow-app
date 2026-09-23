"use client";

/**
 * Dialog de confirmación de cambio de estado — Habilitar/Deshabilitar para
 * concesionarias y talleres admin (Fase 2/3 handoff PM).
 *
 * Componente PRESENTACIONAL (contrato workshop-detalle existente + mejoras):
 * recibe copy completo, `isPending`, `dialogError` y `onConfirm`; el padre
 * decide apertura/cierre, éxito (banner) y error persistente para reintento
 * dentro del dialog (role="alert" — queda abierto; D6).
 *
 * - Acciones deshabilitadas mientras `isPending` (sin doble submit).
 * - A11y: título/descripción del Dialog + alert de error, Base UI primitives.
 */
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export interface AdminStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título: "¿Deshabilitar {nombre}?" */
  title: string;
  description: string;
  /** Copy del botón confirmar (p. ej. "Deshabilitar taller"). */
  confirmLabel: string;
  cancelLabel?: string;
  /** Variante del botón confirmar ("destructive" deshabilita; "default" habilita). */
  variant?: "default" | "destructive";
  isPending: boolean;
  /** Error persistente para reintento (se muestra dentro del dialog). */
  dialogError?: string | null;
  onConfirm: () => void;
}

export function AdminStatusChangeDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "default",
  isPending,
  dialogError = null,
  onConfirm,
}: AdminStatusChangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        {dialogError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {dialogError}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            variant={variant}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}