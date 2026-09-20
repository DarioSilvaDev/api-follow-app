"use client";

/**
 * Paso 2 del wizard de invitación (concesionaria Y taller, D-106).
 * Componente único parametrizado por `kind`:
 *
 * - dealership: el nombre viene pre-cargado (read-only). Se completan los
 *   datos públicos: email de contacto, teléfono, website y descripción.
 * - workshop: el nombre es SOLO lectura (display + nota); el claim NO lo
 *   envía (el backend lo fija en el alta admin — D-106). El resto del
 *   formulario es idéntico.
 *
 * El submit dispara el POST claim (página) con estos datos (+ los del paso 1
 * cuando el flujo es registro).
 */
import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  invitationDealershipSchema,
  invitationWorkshopSchema,
  type InvitationEntityValues,
} from "@/lib/invitation-schema";
import type { InvitationKind } from "@/types/invitation";

export function InvitationStepEntity({
  kind,
  entityName,
  defaultEmail,
  submitError,
  onBack,
  onSubmit,
}: {
  kind: InvitationKind;
  entityName: string;
  defaultEmail: string;
  submitError?: string | null;
  onBack?: () => void;
  onSubmit: (values: InvitationEntityValues) => void | Promise<void>;
}) {
  const isWorkshop = kind === "workshop";
  // El resolver se elige por kind; ambos outputs encajan en
  // InvitationEntityValues (name opcional).
  const resolver = zodResolver(
    isWorkshop ? invitationWorkshopSchema : invitationDealershipSchema,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationEntityValues>({
    resolver,
    defaultValues: (isWorkshop
      ? { email: defaultEmail, phone: "", website: "", description: "" }
      : {
          name: entityName,
          email: defaultEmail,
          phone: "",
          website: "",
          description: "",
        }) as DefaultValues<InvitationEntityValues>,
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {isWorkshop ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-entity-name-readonly">Nombre</Label>
          <div
            id="wizard-entity-name-readonly"
            className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
          >
            {entityName}
          </div>
          <p className="text-xs text-muted-foreground">
            Tal como lo registró el administrador. No puede modificarse aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-entity-name">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-entity-name"
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
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-entity-email">
            Email de contacto <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-entity-email"
            type="email"
            placeholder="contacto@taller.com"
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
          <Label htmlFor="wizard-entity-phone">Teléfono (opcional)</Label>
          <Input
            id="wizard-entity-phone"
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
        <Label htmlFor="wizard-entity-website">Website (opcional)</Label>
        <Input
          id="wizard-entity-website"
          type="url"
          inputMode="url"
          placeholder="https://mitaller.com"
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
        <Label htmlFor="wizard-entity-description">
          Descripción (opcional)
        </Label>
        <Textarea
          id="wizard-entity-description"
          placeholder={
            isWorkshop
              ? "Contanos sobre tu taller..."
              : "Contanos sobre tu concesionaria..."
          }
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
          {isSubmitting
            ? "Activando..."
            : isWorkshop
              ? "Activar taller"
              : "Activar concesionaria"}
        </Button>
      </div>
    </form>
  );
}