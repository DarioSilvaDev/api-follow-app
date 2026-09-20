"use client";

/**
 * Alta administrada de taller — /admin/workshops/nueva (D-106, espejo de
 * concesionarias). Página dedicada (decisión PM), NO modal. Renderiza
 * CreateAdminWorkshopForm; post-success invalida el listado admin y navega a
 * /admin/workshops.
 */
import { AdminBackLink } from "@/components/admin/admin-back-link";
import { CreateAdminWorkshopForm } from "@/components/admin/create-admin-workshop-form";

export default function NuevaAdminWorkshopPage() {
  return (
    <>
      <AdminBackLink href="/admin/workshops" label="Volver a talleres" />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo taller</h1>
        <p className="text-sm text-muted-foreground">
          Creá el taller y enviá una invitación al dueño. Él completará el alta
          desde el enlace que recibe por email.
        </p>
      </div>

      <CreateAdminWorkshopForm />
    </>
  );
}