"use client";

/**
 * Alta administrada de concesionaria — /admin/dealerships/nueva
 * (feature "Onboarding administrado de concesionaria", decisión PM: página
 * dedicada, NO modal). Renderiza CreateAdminDealershipForm; post-success
 * invalida el listado admin y navega a /admin/dealerships.
 */
import { AdminBackLink } from "@/components/admin/admin-back-link";
import { CreateAdminDealershipForm } from "@/components/admin/create-admin-dealership-form";

export default function NuevaAdminDealershipPage() {
  return (
    <>
      <AdminBackLink
        href="/admin/dealerships"
        label="Volver a concesionarias"
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Nueva concesionaria
        </h1>
        <p className="text-sm text-muted-foreground">
          Creá la concesionaria y enviá una invitación al dueño. Él completará
          el alta desde el enlace que recibe por email.
        </p>
      </div>

      <CreateAdminDealershipForm />
    </>
  );
}