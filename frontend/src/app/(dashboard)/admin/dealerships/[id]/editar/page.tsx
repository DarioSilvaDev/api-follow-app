"use client";

/**
 * Edición admin de concesionaria — /admin/dealerships/[id]/editar (Fase 3
 * handoff PM, P1).
 *
 * Gate de UX: permiso `admin.dealerships.update` (AdminNoAccessState; el
 * backend sigue siendo la authority — PermissionsGuard enforcea el endpoint).
 *
 * Fuente: GET /admin/dealerships/:id (misma query key que el detalle → cache
 * compartida). El query se deshabilita cuando el usuario no tiene el permiso
 * de edición (evita fetching innecesario; los hooks respetan rules-of-hooks).
 *
 * Estados de error (patrón RF-6): 404 → "Concesionaria no encontrada"; 403 →
 * "Acceso denegado"; genérico → reintentar.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { EntityNotFoundState } from "@/components/admin/entity-not-found-state";
import { EditAdminDealershipForm } from "@/components/admin/edit-admin-dealership-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { adminApi, isHTTPError } from "@/lib/api";
import { resolveAdminDealershipDetailError } from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";

function errorStatus(error: unknown): number | undefined {
  return isHTTPError(error)
    ? error.response.status
    : (error as { status?: number })?.status;
}

export default function EditAdminDealershipPage() {
  const params = useParams<{ id: string }>();
  const dealershipId = params?.id;
  const { user } = useAuth();
  const canEdit = can(user, "admin.dealerships.update");

  const dealershipQuery = useQuery({
    queryKey: ["admin-dealership", dealershipId],
    queryFn: () => adminApi.getDealership(dealershipId ?? ""),
    enabled: Boolean(dealershipId) && canEdit,
    retry: false,
  });

  // Gate defensivo de UX por permiso de edición (backends: authority).
  if (!canEdit) {
    return <AdminNoAccessState />;
  }

  if (dealershipQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dealershipQuery.isError || !dealershipQuery.data) {
    const status = errorStatus(dealershipQuery.error);
    if (status === 404) {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <EntityNotFoundState
            title="Concesionaria no encontrada"
            description="La concesionaria que buscás no existe o fue eliminada."
            backHref="/admin/dealerships"
            backLabel="Volver a concesionarias"
          />
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 403 ? (
              <>
                <p className="text-lg font-semibold">Acceso denegado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No tenés permiso para editar esta concesionaria.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar la concesionaria
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolveAdminDealershipDetailError()}
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/admin/dealerships">
                <Button variant="outline">Volver a concesionarias</Button>
              </Link>
              {status !== 403 && (
                <Button onClick={() => dealershipQuery.refetch()}>
                  Reintentar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dealership = dealershipQuery.data;

  const breadcrumbItems = [
    { label: "Administración", href: "/admin" },
    { label: "Concesionarias", href: "/admin/dealerships" },
    { label: dealership.name, href: `/admin/dealerships/${dealership.id}` },
    { label: "Editar" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <AdminBreadcrumb items={breadcrumbItems} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Editar concesionaria
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo podés modificar la identidad y los medios de contacto.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EditAdminDealershipForm dealership={dealership} />
        </CardContent>
      </Card>
    </div>
  );
}