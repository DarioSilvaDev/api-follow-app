"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Car, Loader2, Mail, QrCode, Send, Store } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { vehicleApi } from "@/lib/api";
import {
  createTransferErrorMessage,
  pendingTransferMessage,
  transferErrorStatus,
} from "@/lib/transfer-errors";
import {
  parseTransferRecipient,
  TransferRecipientError,
  TRANSFER_RECIPIENT_EMPTY_MESSAGE,
} from "@/lib/transfer-recipient";
import type { TransferRecipient, Vehicle } from "@/types/vehicle";
import { cn } from "cn";
import { QrTransferPanel } from "@/components/transfer/qr-transfer-panel";

// ---------------------------------------------------------------------------
// Fase 1 / D-084: diálogo compartido de transferencia.
//
// Dos modos de entrada:
// - `vehicle` (fijo): desde el detalle del vehículo — sin selector, el
//   vehículo es el de la ficha.
// - `vehicles` (selector): desde el panel de transferencias — lista de
//   vehículos de propiedad del usuario actual (filtrada con isVehicleOwner).
//
// Fase 4: el destinatario se identifica por email O alias en un único campo
// (`parseTransferRecipient`). Sin autocomplete/búsqueda de usuarios
// (anti-enumeración SR#12, fuera de alcance). El toggle email ↔ QR vive
// fuera del condicional, por lo que ambos modos son siempre alcanzables.
//
// Errores: nunca se muestra el mensaje crudo del backend (anti-enumeración /
// PII). Casos §5.3:
// - destinatario propio (email o alias) → error inline (client-side contra la
//   sesión + 400 self del backend), diálogo abierto con datos intactos.
// - ya hay una transferencia pendiente (RF-6) → error inline + CTA
//   "Ver solicitud" que navega al panel.
// - ya no sos owner (raza) → error inline + invalidación de queries.
//
// Ajuste 4 UX (§6.7): en modo panel sin vehículos propios mostra un estado
// guiado "No tenés vehículos para transferir" con link a /vehicles/new.
// ---------------------------------------------------------------------------

export const transferFormSchema = z.object({
  vehicleId: z.string().min(1, "Seleccioná un vehículo."),
  recipient: z
    .string()
    .trim()
    .min(1, TRANSFER_RECIPIENT_EMPTY_MESSAGE)
    .superRefine((value, ctx) => {
      // El min ya cubre el vacío; acá se valida el formato email/alias.
      if (!value) return;
      try {
        parseTransferRecipient(value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message:
            error instanceof TransferRecipientError
              ? error.message
              : "Ingresá un email o alias válido.",
        });
      }
    }),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar los 500 caracteres.")
    .optional(),
});

export type TransferFormValues = z.infer<typeof transferFormSchema>;

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modo detalle: vehículo fijo (solo id + placa). */
  vehicle?: { id: string; licensePlate: string } | null;
  /** Modo panel: vehículos de propiedad del usuario (selector). */
  vehicles?: Vehicle[];
  /** Callback post-éxito (refetch de listas del llamador). */
  onSuccess?: () => void;
}

function transferVehicleLabel(vehicle: Vehicle): string {
  const years = [vehicle.manufactureYear, vehicle.modelYear]
    .filter((year): year is number => typeof year === "number")
    .join(" · ");
  return [vehicle.licensePlate, years, vehicle.color].filter(Boolean).join(" — ");
}

export function TransferDialog({
  open,
  onOpenChange,
  vehicle,
  vehicles,
  onSuccess,
}: TransferDialogProps) {
  const isPanelMode = Boolean(vehicles);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          Transferir vehículo
        </DialogTitle>
        <DialogDescription>
          {isPanelMode
            ? "Seleccioná el vehículo y el email o alias de la persona que recibirá la titularidad."
            : vehicle
              ? `Transferí la titularidad de ${vehicle.licensePlate} a otro usuario de Autentia.`
              : "Transferí la titularidad de tu vehículo a otro usuario de Autentia."}
        </DialogDescription>

        <TransferDialogForm
          vehicle={vehicle}
          vehicles={vehicles}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Formulario interno. Se monta cada vez que se abre el diálogo (el Popup de
 * Base UI monta su contenido solo cuando `open` es true), por lo que `useForm`
 * se inicializa con los defaults del contexto actual sin necesidad de
 * resetear con efectos.
 */
function TransferDialogForm({
  vehicle,
  vehicles,
  onOpenChange,
  onSuccess,
}: Pick<TransferDialogProps, "vehicle" | "vehicles" | "onOpenChange" | "onSuccess">) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [mode, setMode] = useState<"email" | "qr" | "consignment">("email");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      vehicleId: vehicle?.id ?? vehicles?.[0]?.id ?? "",
      recipient: "",
      notes: "",
    },
  });

  const isPanelMode = Boolean(vehicles);

  // Ajuste 3a/4 UX (§6.7): sin vehículos propios el form no aplica → estado
  // guiado con link a /vehicles/new. (Los hooks ya corrieron arriba.)
  if (isPanelMode && (!vehicles || vehicles.length === 0)) {
    return (
      <EmptyState
        icon={Car}
        title="No tenés vehículos para transferir"
        description="Registrá un vehículo primero para poder transferir su titularidad."
        action={
          <Link
            href="/vehicles/new"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Registrar un vehículo
          </Link>
        }
      />
    );
  }

  // Selector del vehículo (modo panel) — compartido por ambos modos.
  const vehicleSelector = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="transfer-vehicle">Vehículo</Label>
      <Select
        id="transfer-vehicle"
        aria-invalid={Boolean(errors.vehicleId)}
        {...register("vehicleId")}
      >
        {vehicles?.map((v) => (
          <option key={v.id} value={v.id}>
            {transferVehicleLabel(v)}
          </option>
        ))}
      </Select>
      {errors.vehicleId && (
        <p className="text-xs text-destructive" role="alert">
          {errors.vehicleId.message}
        </p>
      )}
    </div>
  );

  const modeToggle = (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => setMode("email")}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          mode === "email"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "email"}
      >
        <Mail className="h-3.5 w-3.5" />
        Email o alias
      </button>
      <button
        type="button"
        onClick={() => setMode("qr")}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          mode === "qr"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "qr"}
      >
        <QrCode className="h-3.5 w-3.5" />
        QR
      </button>
      {/* Milestone consignación (§9 spec): "Entregar a concesionaria" genera
          el QR de TOMA (purpose: take, D-104). Un miembro de la concesionaria
          lo escanea y la concesionaria pasa a ser titular intermedia. */}
      <button
        type="button"
        onClick={() => setMode("consignment")}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          mode === "consignment"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={mode === "consignment"}
      >
        <Store className="h-3.5 w-3.5" />
        Concesionaria
      </button>
    </div>
  );

  // Vehículo activo del modo QR (detalle: fijo; panel: el seleccionado).
  const watchedVehicleId =
    vehicle?.id ?? (isPanelMode ? watch("vehicleId") : undefined);
  const qrVehicle =
    vehicle ?? vehicles?.find((v) => v.id === watchedVehicleId) ?? null;

  const pendingMessage = submitError
    ? pendingTransferMessage(submitError)
    : null;
  const errorMessage = submitError
    ? createTransferErrorMessage(submitError)
    : null;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    // El schema ya validó el formato; se parsea de nuevo de forma defensiva
    // para obtener el `TransferRecipient` normalizado (alias sin "@").
    let recipient: TransferRecipient;
    try {
      recipient = parseTransferRecipient(values.recipient);
    } catch (error) {
      setSubmitError({
        status: 400,
        message:
          error instanceof TransferRecipientError
            ? error.message
            : "Invalid recipient",
      });
      return;
    }

    // Ajuste 3a UX (ampliado Fase 4): destinatario propio detectado
    // client-side (email o alias) sin round-trip. El backend también
    // responde 400 self; el mapper cubre ambos.
    const ownEmail = user?.email?.trim().toLowerCase();
    const ownAlias = user?.alias?.trim().toLowerCase();
    const isSelf =
      recipient.type === "email"
        ? Boolean(ownEmail && recipient.value.trim().toLowerCase() === ownEmail)
        : Boolean(ownAlias && recipient.value.toLowerCase() === ownAlias);

    if (isSelf) {
      setSubmitError({
        status: 400,
        message: "Cannot transfer vehicle to yourself",
      });
      return;
    }

    try {
      await vehicleApi.transferVehicle(values.vehicleId, {
        recipient,
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
      });
      // Refresca listas del panel + timeline del detalle (la nueva
      // transferencia pendiente aparece en el historial del vehículo).
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error);
      // Ajuste 3c UX: ya no sos owner (raza) → invalidar para que el CTA y
      // la lista de vehículos propios se resincronicen.
      if (transferErrorStatus(error) === 403) {
        queryClient.invalidateQueries({ queryKey: ["vehicle"] });
        queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      }
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Ajuste UX: el toggle vive fuera del condicional — ambos modos
          (email ↔ QR) son alcanzables en todo momento. */}
      {modeToggle}
      {isPanelMode && vehicleSelector}

      {mode === "qr" ? (
        <QrTransferPanel
          key={`qr-${qrVehicle?.id ?? "no-vehicle"}`}
          vehicle={qrVehicle}
          onMutationEnd={() => {
            queryClient.invalidateQueries({ queryKey: ["vehicle"] });
            queryClient.invalidateQueries({ queryKey: ["vehicles"] });
            onSuccess?.();
          }}
        />
      ) : mode === "consignment" ? (
        <div className="flex flex-col gap-3">
          {/* Milestone consignación (D-104): QR de TOMA. Lo escanea un miembro
              de la concesionaria en representación (contexto DEALERSHIP). */}
          <QrTransferPanel
            key={`take-${qrVehicle?.id ?? "no-vehicle"}`}
            vehicle={qrVehicle}
            purpose="take"
            onMutationEnd={() => {
              queryClient.invalidateQueries({ queryKey: ["vehicle"] });
              queryClient.invalidateQueries({ queryKey: ["vehicles"] });
              onSuccess?.();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Al escanear este QR, la concesionaria pasa a ser titular
            intermedia del vehículo hasta la venta o devolución.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-recipient">
              Email o alias del nuevo titular
            </Label>
            <Input
              id="transfer-recipient"
              type="text"
              autoComplete="off"
              placeholder="titular@ejemplo.com o @alias"
              aria-invalid={Boolean(errors.recipient)}
              aria-describedby="transfer-recipient-helper"
              {...register("recipient")}
            />
            {/* Ajuste 8 UX (§6.1): helper pre-submit validado por UX. */}
            <p
              id="transfer-recipient-helper"
              className="text-xs text-muted-foreground"
            >
              El destinatario debe tener una cuenta en Autentia. Podés
              identificarlo por su email o por su alias (por ej. @juan).
            </p>
            {errors.recipient && (
              <p className="text-xs text-destructive" role="alert">
                {errors.recipient.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-notes">Notas (opcional)</Label>
            <Textarea
              id="transfer-notes"
              placeholder="Detalle de la entrega, kilometraje, etc."
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-xs text-destructive" role="alert">
                {errors.notes.message}
              </p>
            )}
          </div>

          {pendingMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
            >
              <p>{pendingMessage}</p>
              {/* Ajuste 3b UX (§5.3/RF-4): CTA "Ver solicitud" → panel Enviadas. */}
              <Link
                href="/transferencias#enviadas"
                className="mt-1 inline-block font-medium underline underline-offset-4"
              >
                Ver solicitud
              </Link>
            </div>
          ) : errorMessage ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {isSubmitting ? "Enviando..." : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}