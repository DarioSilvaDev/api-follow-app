"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useChangePassword } from "@/hooks/use-password-reset";
import { usersApi } from "@/lib/api";
import { resolveAliasErrorMessage } from "@/lib/transfer-errors";

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

// D-077/D-091: regex de contraseña NO aplica; alias = 3-30 chars
// [a-zA-Z0-9._-], normalizado a lowercase server-side. Empty/null elimina.
const aliasSchema = z.object({
  alias: z
    .string()
    .regex(
      /^[a-zA-Z0-9._-]{3,30}$/,
      "Solo letras, números, punto, guion y guion bajo (3 a 30 caracteres).",
    ),
});

type AliasForm = z.infer<typeof aliasSchema>;

function formatCooldownDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AliasCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-alias"],
    queryFn: () => usersApi.getMyAlias(),
  });

  const [deleting, setDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AliasForm>({
    resolver: zodResolver(aliasSchema),
    defaultValues: { alias: "" },
  });

  const updateAlias = useMutation({
    mutationFn: (alias: string | null) => usersApi.updateMyAlias(alias),
    onSuccess: (result) => {
      queryClient.setQueryData(["my-alias"], result);
      reset({ alias: "" });
      setActionFeedback({
        kind: "success",
        text: result.alias
          ? `Tu alias es @${result.alias}.`
          : "Eliminaste tu alias.",
      });
    },
    onError: (error: unknown) => {
      setActionFeedback({
        kind: "error",
        text: resolveAliasErrorMessage(error),
      });
    },
  });

  const onSubmit = (values: AliasForm) => {
    setActionFeedback(null);
    updateAlias.mutate(values.alias.trim().toLowerCase());
  };

  const onDelete = () => {
    setActionFeedback(null);
    setDeleting(true);
    updateAlias.mutate(null, {
      onSettled: () => setDeleting(false),
    });
  };

  const cooldownDate = formatCooldownDate(data?.nextChangeAllowedAt ?? null);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <AtSign className="h-4 w-4" />
          Mi alias
        </CardTitle>
        <CardDescription>
          Tu alias público lo ven otros usuarios al transferirte un vehículo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {actionFeedback && (
          <div
            role="alert"
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
              actionFeedback.kind === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {actionFeedback.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="grid gap-1">
            <Label>Alias actual</Label>
            <p className="text-sm">
              {data?.alias ? `@${data.alias}` : "No tenés alias configurado."}
            </p>
            {cooldownDate && (
              <p className="text-xs text-muted-foreground">
                Podés volver a cambiarlo el {cooldownDate}.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="alias">Nuevo alias</Label>
            <div className="flex items-center gap-2">
              <Input
                id="alias"
                placeholder="juan-2026"
                maxLength={30}
                disabled={isSubmitting}
                {...register("alias")}
              />
              <Button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
            {errors.alias && (
              <p className="text-sm text-destructive" role="alert">
                {errors.alias.message}
              </p>
            )}
          </div>
        </form>
      </CardContent>
      {data?.alias && (
        <CardFooter className="justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting || isSubmitting}
            onClick={onDelete}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Eliminar alias"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

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

      <AliasCard />

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
