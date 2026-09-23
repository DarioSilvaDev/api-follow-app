"use client";

/**
 * Paso de registro del wizard de USUARIO de plataforma (kind=user, D-106).
 *
 * Adaptación de InvitationStepRegister al claim de usuario: recopila SOLO los
 * campos que pide POST /users/wizard/claim (firstName, lastName, password).
 * El email se muestra read-only (lo fija la invitación — el claim NUNCA lo
 * envía) y NO se pide teléfono (opcional en el contrato backend).
 *
 * La cuenta se activa contra el claim del wizard; no se llama /auth/register.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  userWizardRegisterSchema,
  type UserWizardRegisterValues,
} from "@/lib/invitation-schema";

export function InvitationStepUserRegister({
  email,
  submitError,
  onSubmit,
}: {
  email: string;
  submitError?: string | null;
  onSubmit: (values: UserWizardRegisterValues) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserWizardRegisterValues>({
    resolver: zodResolver(userWizardRegisterSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
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
          <Label htmlFor="user-wizard-first-name">
            Nombre <span className="text-destructive">*</span>
          </Label>
          <Input
            id="user-wizard-first-name"
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
          <Label htmlFor="user-wizard-last-name">
            Apellido <span className="text-destructive">*</span>
          </Label>
          <Input
            id="user-wizard-last-name"
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
        <Label htmlFor="user-wizard-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="user-wizard-email"
          type="email"
          value={email}
          readOnly
          className="bg-muted/50 text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Este email es el de tu invitación y no puede cambiarse acá.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          id="user-wizard-password"
          label="Contraseña"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          error={errors.password?.message}
          register={register("password")}
        />
        <PasswordInput
          id="user-wizard-confirm-password"
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
        {isSubmitting ? "Activando..." : "Activar cuenta"}
      </Button>
    </form>
  );
}