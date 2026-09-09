"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { useChangePassword } from "@/hooks/use-password-reset";

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "La contraseña actual es requerida"),
    newPassword: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(100, "La contraseña no puede exceder 100 caracteres"),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "La nueva contraseña debe ser diferente a la actual",
    path: ["newPassword"],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const changePassword = useChangePassword();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordForm) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setSuccess(true);
      reset();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 401) {
        // Invalid current password — handled via mutation error state
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona tu información personal y seguridad.
        </p>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Cambiar contraseña
          </CardTitle>
          <CardDescription>
            Actualiza tu contraseña para mantener tu cuenta segura.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="grid gap-4">
            {success && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Contraseña actualizada exitosamente.
              </div>
            )}

            <PasswordInput
              id="currentPassword"
              label="Contraseña actual"
              placeholder="Ingresa tu contraseña actual"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              register={register("currentPassword")}
            />

            <PasswordInput
              id="newPassword"
              label="Nueva contraseña"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              register={register("newPassword")}
            />

            <PasswordInput
              id="confirmNewPassword"
              label="Confirmar nueva contraseña"
              placeholder="Repite tu nueva contraseña"
              autoComplete="new-password"
              error={errors.confirmNewPassword?.message}
              register={register("confirmNewPassword")}
            />

            {changePassword.isError && (
              <p className="text-sm text-destructive" role="alert">
                {(changePassword.error as { status?: number; message?: string })
                  ?.status === 401
                  ? "La contraseña actual es incorrecta."
                  : (changePassword.error as { message?: string })?.message ||
                    "Error al cambiar la contraseña."}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Actualizar contraseña"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
