"use client";

/**
 * Alta administrada de concesionaria — /admin/dealerships/nueva
 * (feature "Onboarding administrado de concesionaria", decisión PM: página
 * dedicada, NO modal). Renderiza CreateAdminDealershipForm; post-success
 * invalida el listado admin y navega a /admin/dealerships.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { CreateAdminDealershipForm } from "@/components/admin/create-admin-dealership-form";

export default function NuevaAdminDealershipPage() {
  return (
    <>
      <Link
        href="/admin/dealerships"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "-ml-3 w-fit gap-1 px-2 text-muted-foreground",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>

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