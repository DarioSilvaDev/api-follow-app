"use client";

/**
 * Paso 1 (requiresRegister=true) del wizard de invitación de concesionaria.
 *
 * Registro COMPLETO: nombre, apellido, email (read-only pre-cargado desde la
 * invitación), teléfono (obligatorio acá — /auth/register NO lo acepta) y
 * contraseña. Los datos NO se envían a /auth/register: viajan dentro del POST
 * claim en el paso 2 (decisión backend congelada).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  invitationRegisterSchema,
  type InvitationRegisterValues,
} from "@/lib/invitation-schema";

export function InvitationStepRegister({
  email,
  submitError,
  onSubmit,
}: {
  email: string;
  submitError?: string | null;
  onSubmit: (values: InvitationRegisterValues) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationRegisterValues>({
    resolver: zodResolver(invitationRegisterSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email,
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-first-name">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-first-name"
            type="text"
            autoComplete="given-name"
            placeholder="Ej. Juan"
            aria-invalid={Boolean(errors.firstName)}
            {...register("firstName")}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive" role="alert">
              {errors.firstName.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wizard-last-name">
            Apellido <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-last-name"
            type="text"
            autoComplete="family-name"
            placeholder="Ej. Pérez"
            aria-invalid={Boolean(errors.lastName)}
            {...register("lastName")}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive" role="alert">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="wizard-email"
          type="email"
          readOnly
          className="bg-muted/50 text-muted-foreground"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Este email es el de tu invitación y no puede cambiarse acá.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-phone">
          Teléfono <span className="text-destructive">*</span>
        </Label>
        <Input
          id="wizard-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          id="wizard-password"
          label="Contraseña"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          error={errors.password?.message}
          register={register("password")}
        />
        <PasswordInput
          id="wizard-confirm-password"
          label="Confirmar contraseña"
          placeholder="Repetí tu contraseña"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          register={register("confirmPassword")}
        />
      </div>

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Continuar
      </Button>
    </form>
  );
}