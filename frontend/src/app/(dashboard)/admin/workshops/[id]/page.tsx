"use client";

/**
 * Detalle admin de taller — /admin/workshops/[id] (D-106, espejo de
 * concesionarias).
 *
 * Fuente: GET /admin/workshops/:id. El breadcrumb usa AdminBreadcrumb
 * (Administración / Talleres / {taller}).
 *
 * Secciones:
 * - Card identidad: nombre, CUIT, estado (Badge), dueño, membresías/sucursales
 *   y botón Habilitar/Deshabilitar según `isActive`. La acción de cambio de
 *   estado usa un Dialog de confirmación (PATCH /admin/workshops/:id/status).
 * - Banner pending_claim (agotado): reenvía la invitación (POST
 *   /admin/workshops/:id/invitations).
 * - Card miembros y Card sucursales (solo lectura informativa).
 *
 * Estados de error (patrón RF-6): 404 → "Taller no encontrado"; 403 →
 * "Acceso denegado"; genérico → reintentar.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, RefreshCw, Store } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { EntityNotFoundState } from "@/components/admin/entity-not-found-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { adminApi, isHTTPError } from "@/lib/api";
import {
  resolveAdminWorkshopDetailError,
  resolveResendWorkshopInvitationError,
  resolveUpdateWorkshopStatusError,
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

export default function AdminWorkshopDetailPage() {
  const params = useParams<{ id: string }>();
  const workshopId = params?.id;
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const workshopQuery = useQuery({
    queryKey: ["admin-workshop", workshopId],
    queryFn: () => adminApi.getWorkshop(workshopId ?? ""),
    enabled: Boolean(workshopId),
    retry: false,
  });

  const resendMutation = useMutation({
    mutationFn: () => adminApi.resendWorkshopInvitation(workshopId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-workshop", workshopId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-workshops"] });
      setBanner("Invitación reenviada al dueño.");
    },
    onError: (error) => {
      setBanner(resolveResendWorkshopInvitationError(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      adminApi.updateWorkshopStatus(workshopId ?? "", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-workshop", workshopId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-workshops"] });
      setBanner("Estado del taller actualizado.");
    },
    onError: (error) => {
      setBanner(resolveUpdateWorkshopStatusError(error));
    },
  });

  // Loading: ficha aún no disponible.
  if (workshopQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Errores de carga (patrón RF-6). 404 usa EntityNotFoundState (copy
  // canónico); 403 y genérico → estado inline con reintentar.
  if (workshopQuery.isError || !workshopQuery.data) {
    const status = errorStatus(workshopQuery.error);
    if (status === 404) {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <EntityNotFoundState
            title="Taller no encontrado"
            description="El taller que buscás no existe o fue eliminado."
            backHref="/admin/workshops"
            backLabel="Volver a talleres"
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
                  No tenés permiso para ver este taller.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el taller
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolveAdminWorkshopDetailError()}
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/admin/workshops">
                <Button variant="outline">Volver a talleres</Button>
              </Link>
              {status !== 403 && (
                <Button onClick={() => workshopQuery.refetch()}>
                  Reintentar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const workshop = workshopQuery.data;
  // El detalle admin no expone `owner`/`invitation` (solo listado) — el dueño
  // se deriva de members (roleCode "owner") cuando el taller fue reclamado.
  const owner = workshop.members.find((m) => m.roleCode === "owner") ?? null;
  const isDisabled = !workshop.isActive;
  const isPending = workshop.status === "pending_claim";
  const resending = resendMutation.isPending;
  const statusChanging = statusMutation.isPending;

  const breadcrumbItems = [
    { label: "Administración", href: "/admin" },
    { label: "Talleres", href: "/admin/workshops" },
    { label: workshop.name },
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
            <CardTitle className="text-xl">{workshop.name}</CardTitle>
            <CardDescription className="mt-1.5">
              {workshop.taxId ? <>CUIT {workshop.taxId}</> : "Sin CUIT"} · Alta{" "}
              {formatDate(workshop.createdAt)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isDisabled ? (
              <Badge variant="destructive">Deshabilitado</Badge>
            ) : isPending ? (
              <Badge variant="warning">Pendiente de claim</Badge>
            ) : (
              <Badge variant="success">Activo</Badge>
            )}
            <Dialog>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm" disabled={statusChanging} />
                }
              >
                {statusChanging && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                )}
                {isDisabled ? "Habilitar" : "Deshabilitar"}
              </DialogTrigger>
              <DialogPopup>
                <DialogTitle>
                  {isDisabled
                    ? `¿Habilitar ${workshop.name}?`
                    : `¿Deshabilitar ${workshop.name}?`}
                </DialogTitle>
                <DialogDescription>
                  {isDisabled
                    ? "Los miembros podrán volver a operar desde este taller. El historial y los vehículos se conservan."
                    : "Los miembros no podrán operar desde este taller. Su historial y sus vehículos se conservan."}
                </DialogDescription>
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose render={<Button variant="outline" />}>
                    Cancelar
                  </DialogClose>
                  <DialogClose
                    render={
                      <Button
                        variant={isDisabled ? "default" : "destructive"}
                        onClick={() => statusMutation.mutate(isDisabled)}
                      />
                    }
                  >
                    {isDisabled ? "Habilitar taller" : "Deshabilitar taller"}
                  </DialogClose>
                </div>
              </DialogPopup>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dueño
            </span>
            {owner ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {owner.userName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {owner.userEmail}
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
              {workshop.members.length} {workshop.members.length === 1 ? "miembro" : "miembros"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sucursales
            </span>
            <p className="text-sm font-medium text-foreground">
              {workshop.branches.length}{" "}
              {workshop.branches.length === 1 ? "sucursal" : "sucursales"}
            </p>
          </div>
          {workshop.phone && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Teléfono
              </span>
              <p className="text-sm font-medium text-foreground">
                {workshop.phone}
              </p>
            </div>
          )}
          {workshop.website && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Website
              </span>
              <p className="text-sm font-medium text-foreground">
                {workshop.website}
              </p>
            </div>
          )}
          {workshop.email && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email de contacto
              </span>
              <p className="text-sm font-medium text-foreground">
                {workshop.email}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isPending && (
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

      {workshop.members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Miembros</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Miembros del taller</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
                  <th scope="col" className="px-3 py-2 font-medium">Email</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rol</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {workshop.members.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-b-0">
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

      {workshop.branches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sucursales</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Sucursales del taller</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
                  <th scope="col" className="px-3 py-2 font-medium">Dirección</th>
                  <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {workshop.branches.map((branch) => (
                  <tr key={branch.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {branch.name}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {[branch.street, branch.streetNumber, branch.city, branch.state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {branch.isHeadquarters ? (
                        <Badge variant="info">Casa central</Badge>
                      ) : (
                        <span className="text-muted-foreground">Sucursal</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {branch.isActive ? (
                        <Badge variant="success">Activa</Badge>
                      ) : (
                        <Badge variant="destructive">Inactiva</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {workshop.branches.length === 0 && workshop.members.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Store className="h-4 w-4 shrink-0 text-primary" />
          El taller se activará cuando el dueño complete el alta desde la
          invitación.
        </div>
      )}
    </div>
  );
}