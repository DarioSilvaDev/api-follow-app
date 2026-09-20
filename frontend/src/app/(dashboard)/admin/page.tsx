"use client";

/**
 * Landing del workspace admin de plataforma (hub de navegación).
 *
 * Secciones activas: Concesionarias y Talleres (features "Onboarding
 * administrado de concesionaria" y "Onboarding admin de taller" D-106).
 * NO implementa métricas (decisión PM: post-MVP).
 *
 * Cada card se renderiza solo si el usuario tiene el permiso de la sección
 * (UX pura — el backend enforcea cada endpoint /admin). Si no hay secciones
 * visibles, muestra AdminNoAccessState.
 */
import Link from "next/link";
import { Store, Wrench } from "lucide-react";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/admin-access";

export default function AdminPage() {
  const { user } = useAuth();

  const canViewDealerships = can(user, "admin.dealerships.list");
  const canViewWorkshops = can(user, "admin.workshops.list");
  const hasAnySection = canViewDealerships || canViewWorkshops;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
        <p className="text-sm text-muted-foreground">
          Panel administrativo de la plataforma.
        </p>
      </div>

      {!hasAnySection ? (
        <AdminNoAccessState />
      ) : (
        <>
          {canViewDealerships && (
            <Link
              href="/admin/dealerships"
              className="transition-opacity hover:opacity-80"
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Concesionarias</CardTitle>
                      <CardDescription>
                        Crear concesionarias, enviar invitaciones al dueño y
                        monitorear el estado de claim.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          )}

          {canViewWorkshops && (
            <Link
              href="/admin/workshops"
              className="transition-opacity hover:opacity-80"
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Talleres</CardTitle>
                      <CardDescription>
                        Crear talleres, enviar invitaciones al dueño y
                        monitorear el estado de claim.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          )}
        </>
      )}
    </>
  );
}