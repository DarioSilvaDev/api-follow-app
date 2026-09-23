"use client";

/**
 * Detalle admin de concesionaria — /admin/dealerships/[id] (D-106, espejo de
 * /admin/workshops/[id]).
 *
 * Fuente: GET /admin/dealerships/:id (DealershipDetailAdminResponseDto). El
 * breadcrumb usa AdminBreadcrumb (Administración / Concesionarias / {nombre}).
 *
 * Secciones:
 * - Card identidad: nombre, razón social, CUIT, estado (Badge), dueño,
 *   miembros y botón "Reenviar invitación" cuando la invitación sigue vigente
 *   (POST /admin/dealerships/:id/invitations).
 * - Banner pending_claim (agotado): reenvía la invitación al dueño.
 * - Card miembros (solo lectura informativa).
 *
 * Habilitar/Deshabilitar (handoff PM Fase 3, P2/P3): trigger con dialog de
 * confirmación (AdminStatusChangeDialog) — PATCH /admin/dealerships/:id/status,
 * permiso admin.dealerships.manage. Endpoint comprometido en el handoff, Fase
 * 1 backend pendiente (404 hasta que se implemente).
 *
 * Estados de error (patrón RF-6): 404 → "Concesionaria no encontrada"; 403 →
 * "Acceso denegado"; genérico → reintentar.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, RefreshCw, Store } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { EntityNotFoundState } from "@/components/admin/entity-not-found-state";
import { AdminStatusChangeDialog } from "@/components/admin/admin-status-change-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { adminApi, isHTTPError } from "@/lib/api";
import { can } from "@/lib/admin-access";
import {
  resolveAdminDealershipDetailError,
  resolveResendInvitationError,
  resolveUpdateDealershipStatusError,
} from "@/lib/admin-errors";

function errorStatus(error: unknown): number | undefined {
  return isHTTPError(error)
    ? error.response.status
    : (error as { status?: number })?.status;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminDealershipDetailPage() {
  const params = useParams<{ id: string }>();
  const dealershipId = params?.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [banner, setBanner] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogError, setStatusDialogError] = useState<string | null>(
    null,
  );

  const dealershipQuery = useQuery({
    queryKey: ["admin-dealership", dealershipId],
    queryFn: () => adminApi.getDealership(dealershipId ?? ""),
    enabled: Boolean(dealershipId),
    retry: false,
  });

  const resendMutation = useMutation({
    mutationFn: () => adminApi.resendInvitation(dealershipId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-dealership", dealershipId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      setBanner("Invitación reenviada al dueño.");
    },
    onError: (error) => {
      setBanner(resolveResendInvitationError(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      adminApi.updateDealershipStatus(dealershipId ?? "", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-dealership", dealershipId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      setStatusDialogOpen(false);
      setStatusDialogError(null);
      setBanner("Estado de la concesionaria actualizado.");
    },
    onError: (error) => {
      // Error persistente DENTRO del dialog (role="alert") para reintento; el
      // dialog queda abierto (D6).
      setStatusDialogError(resolveUpdateDealershipStatusError(error));
    },
  });

  // Loading: ficha aún no disponible.
  if (dealershipQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Errores de carga (patrón RF-6). 404 usa EntityNotFoundState (copy
  // canónico); 403 y genérico → estado inline con reintentar.
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
                  No tenés permiso para ver esta concesionaria.
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
  const isDisabled = !dealership.isActive;
  const isPending = dealership.status === "pending_claim";
  const resending = resendMutation.isPending;

  const breadcrumbItems = [
    { label: "Administración", href: "/admin" },
    { label: "Concesionarias", href: "/admin/dealerships" },
    { label: dealership.name },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminBreadcrumb items={breadcrumbItems} />

      {banner && (
        <p
          role="status"
          className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          {banner}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{dealership.name}</CardTitle>
            <CardDescription className="mt-1.5">
              {dealership.taxId ? <>CUIT {dealership.taxId}</> : "Sin CUIT"} ·
              Alta {formatDate(dealership.createdAt)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isDisabled ? (
              <Badge variant="destructive">Deshabilitada</Badge>
            ) : isPending ? (
              <Badge variant="warning">Pendiente de claim</Badge>
            ) : (
              <Badge variant="success">Activa</Badge>
            )}
            {can(user, "admin.dealerships.manage") && (
              <Button
                variant="outline"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => {
                  setStatusDialogError(null);
                  setStatusDialogOpen(true);
                }}
              >
                {statusMutation.isPending && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                )}
                {isDisabled ? "Habilitar" : "Deshabilitar"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dueño
            </span>
            {dealership.owner ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {dealership.owner.firstName} {dealership.owner.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dealership.owner.email}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin propietario aún
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Miembros
            </span>
            <p className="text-sm font-medium text-foreground">
              {dealership.members.length}{" "}
              {dealership.members.length === 1 ? "miembro" : "miembros"}
            </p>
          </div>
          {dealership.legalName && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Razón social
              </span>
              <p className="text-sm font-medium text-foreground">
                {dealership.legalName}
              </p>
            </div>
          )}
          {dealership.phone && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Teléfono
              </span>
              <p className="text-sm font-medium text-foreground">
                {dealership.phone}
              </p>
            </div>
          )}
          {dealership.website && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Website
              </span>
              <p className="text-sm font-medium text-foreground">
                {dealership.website}
              </p>
            </div>
          )}
          {dealership.email && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email de contacto
              </span>
              <p className="text-sm font-medium text-foreground">
                {dealership.email}
              </p>
            </div>
          )}
          {dealership.description && (
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Descripción
              </span>
              <p className="text-sm text-foreground">{dealership.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* P2: disabled gana SIEMPRE — una deshabilitada no puede reclamarse ni
          reenviar invitación (espejo del listado: isActive && pending_claim).
          El badge "Deshabilitada" es la fuente visual del estado. */}
      {!isDisabled && isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitación pendiente</CardTitle>
            <CardDescription>
              Se envió una invitación al dueño por email. Si no la recibió,
              podés reenviarla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              disabled={resending}
              onClick={() => resendMutation.mutate()}
            >
              {resending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Reenviar invitación
            </Button>
          </CardContent>
        </Card>
      )}

      {dealership.members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Miembros</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Miembros de la concesionaria</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
                  <th scope="col" className="px-3 py-2 font-medium">Email</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rol</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {dealership.members.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {member.userName}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {member.userEmail}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary">{member.roleName}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatDate(member.joinedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {dealership.members.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Store className="h-4 w-4 shrink-0 text-primary" />
          La concesionaria se activará cuando el dueño complete el alta desde
          la invitación.
        </div>
      )}

      <AdminStatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialogOpen(false);
            setStatusDialogError(null);
          }
        }}
        title={
          isDisabled
            ? `¿Habilitar ${dealership.name}?`
            : `¿Deshabilitar ${dealership.name}?`
        }
        description={
          isDisabled
            ? "La concesionaria volverá a estar activa."
            : "La concesionaria quedará deshabilitada. El historial, vehículos, miembros y trazabilidad se conservan."
        }
        confirmLabel={isDisabled ? "Habilitar concesionaria" : "Deshabilitar concesionaria"}
        variant={isDisabled ? "default" : "destructive"}
        isPending={statusMutation.isPending}
        dialogError={statusDialogError}
        onConfirm={() => statusMutation.mutate(isDisabled)}
      />
    </div>
  );
}