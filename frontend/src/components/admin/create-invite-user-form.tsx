"use client";

/**
 * Formulario de invitación de usuario de plataforma (admin panel) — D-106.
 *
 * POST /admin/users { email, roleType: 'admin' | 'support', firstName?,
 * lastName? }. Resultado del backend:
 * - Cuenta activa sin el rol → asigna rol directo (roleAssigned=true, sin
 *   wizard) y el sistema notifica por email.
 * - Cuenta pending o inexistente → crea invitación; el wizard público con
 *   `?kind=user` activa la cuenta (roleAssigned=false).
 * - 409 CONFLICT por cuenta desactivada/suspendida/rol ya asignado/
 *   invitación pendiente (copy clasificado por mensaje interno — ver
 *   src/lib/admin-errors.ts).
 *
 * Post-success: banner + invalidate ["admin-users"] + navegación al listado
 * (patrón de feedback inline del repo, sin toast).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { adminApi } from "@/lib/api";
import { resolveInvitePlatformUserError } from "@/lib/admin-errors";

const invitePlatformUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Ingresá un email válido.")
    .max(254, "El email no puede superar los 254 caracteres."),
  roleType: z.enum(["admin", "support"]),
  firstName: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(80, "El nombre no puede superar los 80 caracteres.")
    .optional()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .min(2, "El apellido debe tener al menos 2 caracteres.")
    .max(80, "El apellido no puede superar los 80 caracteres.")
    .optional()
    .or(z.literal("")),
});

type InvitePlatformUserValues = z.infer<typeof invitePlatformUserSchema>;

const SUCCESS_BANNER_DURATION_MS = 900;

export function CreateInviteUserForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // Redirect diferido para dejar ver el banner de éxito (patrón concesionarias).
  useEffect(() => {
    if (!pendingRedirect) return;
    const timer = setTimeout(() => {
      router.push("/admin/users");
    }, SUCCESS_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pendingRedirect, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitePlatformUserValues>({
    resolver: zodResolver(invitePlatformUserSchema),
    defaultValues: { email: "", roleType: "admin", firstName: "", lastName: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const result = await adminApi.inviteUser({
        email: values.email,
        roleType: values.roleType,
        firstName: values.firstName?.trim() || undefined,
        lastName: values.lastName?.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSuccessBanner(
        result.roleAssigned
          ? "Usuario activo. Se le asignó el rol y recibió la notificación por email."
          : "Invitación enviada. El usuario recibió el enlace para activar su cuenta.",
      );
      // Feedback visible breve → navegación al listado.
      setPendingRedirect(true);
    } catch (error) {
      setSubmitError(resolveInvitePlatformUserError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-user-email">
          Email <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="invite-user-email"
            type="email"
            autoComplete="email"
            placeholder="usuario@empresa.com"
            className="pl-10"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Si la cuenta aún no existe, el usuario recibirá un enlace para
          activarla. Si existe y no tiene el rol, se lo asignamos directo.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-user-role">
          Rol <span className="text-destructive">*</span>
        </Label>
        <Select
          id="invite-user-role"
          className="w-full sm:max-w-xs"
          {...register("roleType")}
        >
          <option value="admin">Administrador</option>
          <option value="support">Soporte</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          La invitación de super_admin y de usuarios finales se gestiona por
          otros canales.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-user-first-name">Nombre (opcional)</Label>
          <Input
            id="invite-user-first-name"
            type="text"
            autoComplete="given-name"
            placeholder="Ej. Ana"
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
          <Label htmlFor="invite-user-last-name">Apellido (opcional)</Label>
          <Input
            id="invite-user-last-name"
            type="text"
            autoComplete="family-name"
            placeholder="Ej. Gómez"
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

      {successBanner && (
        <p
          role="status"
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground"
        >
          {successBanner}
        </p>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || Boolean(successBanner)}
          onClick={() => router.push("/admin/users")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || Boolean(successBanner)}>
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Enviando..." : "Invitar usuario"}
        </Button>
      </div>
    </form>
  );
}