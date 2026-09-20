"use client";

/**
 * Paso 1 (requiresRegister=false) del wizard de invitación de concesionaria.
 * Login con el email de la invitación (read-only) + contraseña. El submit lo
 * resuelve la página (authApi.login + refreshSession) y no navega — continúa
 * al paso 2 del wizard.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  invitationLoginSchema,
  type InvitationLoginValues,
} from "@/lib/invitation-schema";

export function InvitationStepLogin({
  email,
  submitError,
  onSubmit,
}: {
  email: string;
  submitError?: string | null;
  onSubmit: (values: InvitationLoginValues) => void | Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationLoginValues>({
    resolver: zodResolver(invitationLoginSchema),
    defaultValues: { password: "" },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wizard-login-email">Email</Label>
        <Input
          id="wizard-login-email"
          type="email"
          value={email}
          readOnly
          className="bg-muted/50 text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Este email es el de tu invitación y no puede cambiarse acá.
        </p>
      </div>

      <PasswordInput
        id="wizard-login-password"
        label="Contraseña"
        placeholder="Tu contraseña"
        autoComplete="current-password"
        error={errors.password?.message}
        register={register("password")}
      />

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
        {isSubmitting ? "Ingresando..." : "Continuar"}
      </Button>
    </form>
  );
}