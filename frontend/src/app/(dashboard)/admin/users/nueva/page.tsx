"use client";

/**
 * Alta de usuario de plataforma — /admin/users/nueva (D-106).
 * Página dedicada (decisión PM), NO modal. Renderiza CreateInviteUserForm;
 * post-success invalida el listado admin y navega a /admin/users.
 */
import { AdminBackLink } from "@/components/admin/admin-back-link";
import { CreateInviteUserForm } from "@/components/admin/create-invite-user-form";

export default function NuevaAdminUserPage() {
  return (
    <>
      <AdminBackLink href="/admin/users" label="Volver a usuarios" />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitar usuario</h1>
        <p className="text-sm text-muted-foreground">
          Incorporá un usuario de plataforma con rol de administrador o de
          soporte. Si la cuenta ya existe, el rol se asigna directamente.
        </p>
      </div>

      <CreateInviteUserForm />
    </>
  );
}