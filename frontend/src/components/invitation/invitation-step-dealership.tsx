"use client";

/**
 * Paso 2 del wizard de invitación de concesionaria.
 * El nombre viene pre-cargado (read-only). Se completan los datos públicos de
 * la concesionaria: email de contacto, teléfono, website y descripción.
 * El submit dispara el POST claim (página) con estos datos (+ los del paso 1
 * cuando el flujo es registro).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  invitationDealershipSchema,
  type InvitationDealershipValues,
} from "@/lib/invitation-schema";

export function InvitationStepDealership({
  dealershipName,
  defaultEmail,
  submitError,
  onBack,
  onSubmit,
}: {
  dealershipName: string;
  defaultEmail: string;
  submitError?: string | null;
  onBack?: () => void;
  onSubmit: (values: InvitationDealershipValues) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationDealershipValues>({
    resolver: zodResolver(invitationDealershipSchema),
    defaultValues: {
      name: dealershipName,
      email: defaultEmail,
      phone: "",
      website: "",
      description: "",
    },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-dealership-name">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="wizard-dealership-name"
          type="text"
          readOnly
          className="bg-muted/50 text-muted-foreground"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-dealership-email">
            Email de contacto <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-dealership-email"
            type="email"
            placeholder="contacto@miagencia.com"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-dealership-phone">Teléfono (opcional)</Label>
          <Input
            id="wizard-dealership-phone"
            type="tel"
            inputMode="tel"
            placeholder="Ej. 11 5555 1234"
            aria-invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          {errors.phone && (
            <p className="text-xs text-destructive" role="alert">
              {errors.phone.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-dealership-website">Website (opcional)</Label>
        <Input
          id="wizard-dealership-website"
          type="url"
          inputMode="url"
          placeholder="https://miagencia.com"
          aria-invalid={Boolean(errors.website)}
          {...register("website")}
        />
        {errors.website && (
          <p className="text-xs text-destructive" role="alert">
            {errors.website.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-dealership-description">
          Descripción (opcional)
        </Label>
        <Textarea
          id="wizard-dealership-description"
          placeholder="Contanos sobre tu concesionaria..."
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Estos datos quedan visibles para tus clientes.
      </p>

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>
            Volver
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Activando..." : "Activar concesionaria"}
        </Button>
      </div>
    </form>
  );
}