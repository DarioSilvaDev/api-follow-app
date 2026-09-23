"use client";

/**
 * Listado admin de talleres — /admin/workshops (Fase 2/3 handoff PM: listado
 * expandible Propuesta B; espejo de concesionarias).
 *
 * Fuente: GET /admin/workshops?page&limit&status (permiso
 * admin.workshops.list). Cada fila expande un panel con:
 * - Badge de estado efectivo (helper único src/lib/admin-status.ts — P2, D3).
 * - Datos: dueño, email de contacto, sucursales, miembros, invitación vence,
 *   alta.
 * - Acciones: Reenviar invitación (pending + admin.workshops.manage),
 *   Habilitar/Deshabilitar (admin.workshops.manage, PATCH existente
 *   /admin/workshops/:id/status), Ver detalle. SIN Editar (no existe ruta
 *   /admin/workshops/[id]/editar — fuera de alcance).
 *
 * Interacción (acordeón): una sola fila expandida; se cierra al cambiar
 * filtro o página (NO al refetch de fondo). Nombre NO navega.
 *
 * Query key: ["admin-workshops", page, statusFilter].
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw, Wrench } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { AdminEntityStatusBadge } from "@/components/admin/admin-entity-status-badge";
import { AdminStatusChangeDialog } from "@/components/admin/admin-status-change-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { adminApi } from "@/lib/api";
import {
  resolveAdminWorkshopsListError,
  resolveResendWorkshopInvitationError,
  resolveUpdateWorkshopStatusError,
} from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import { formatAdminDate } from "@/lib/admin-status";
import { cn } from "cn";
import type { AdminWorkshopStatus } from "@/types/admin";

const PAGE_SIZE = 10;
const BANNER_DURATION_MS = 4000;

type StatusFilter = "all" | AdminWorkshopStatus;

export default function AdminWorkshopsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusDialogId, setStatusDialogId] = useState<string | null>(null);
  const [statusDialogError, setStatusDialogError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Banner transitorio inline (sin toast, patrón paneles del repo).
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  const workshopsQuery = useQuery({
    queryKey: ["admin-workshops", page, statusFilter],
    queryFn: () =>
      adminApi.listWorkshops({
        page,
        limit: PAGE_SIZE,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
    retry: false,
  });

  const resendMutation = useMutation({
    mutationFn: (workshopId: string) =>
      adminApi.resendWorkshopInvitation(workshopId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-workshops"] });
      setBanner("Invitación reenviada al dueño.");
    },
    onError: (error) => {
      setBanner(resolveResendWorkshopInvitationError(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updateWorkshopStatus(id, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-workshops"] });
      queryClient.invalidateQueries({
        queryKey: ["admin-workshop", variables.id],
      });
      setStatusDialogId(null);
      setStatusDialogError(null);
      setBanner("Estado del taller actualizado.");
    },
    onError: (error) => {
      // Error persistente DENTRO del dialog (role="alert") para reintento; el
      // dialog queda abierto (D6).
      setStatusDialogError(resolveUpdateWorkshopStatusError(error));
    },
  });

  // Gate defensivo por permiso de sección (UX; backend es la authority).
  if (!can(user, "admin.workshops.list")) {
    return <AdminNoAccessState />;
  }

  const canManage = can(user, "admin.workshops.manage");
  const items = workshopsQuery.data?.data ?? [];
  const meta = workshopsQuery.data?.meta;

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
    // Cerrar la fila expandida al cambiar filtro o página (decisión UX; NO al
    // refetch de fondo — preserva contexto tras mutaciones).
    setExpandedId(null);
  };

  const statusDialogWorkshop =
    statusDialogId !== null
      ? items.find((item) => item.id === statusDialogId) ?? null
      : null;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Talleres</h1>
          <p className="text-sm text-muted-foreground">
            Creá talleres desde la plataforma y gestioná la invitación al
            dueño.
          </p>
        </div>
        <Link
          href="/admin/workshops/nueva"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Wrench className="h-3.5 w-3.5" />
          Nuevo taller
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="workshop-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Estado
          </label>
          <Select
            id="workshop-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="w-44"
          >
            <option value="all">Todos</option>
            <option value="pending_claim">Pendiente de claim</option>
            <option value="active">Activos</option>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Orden: pendientes primero (server-side)
        </p>
      </div>

      {banner && (
        <p
          role="status"
          className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          {banner}
        </p>
      )}

      {workshopsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : workshopsQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              No se pudieron cargar los datos
            </CardTitle>
            <CardDescription>{resolveAdminWorkshopsListError()}</CardDescription>
          </CardHeader>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title="No hay talleres registrados"
            description={
              statusFilter === "all"
                ? "Los talleres se suman cuando se registran en la plataforma."
                : "No hay talleres en este estado."
            }
            action={
              <Link
                href="/admin/workshops/nueva"
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <Wrench className="h-3.5 w-3.5" />
                Nuevo taller
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <ul
            aria-busy={workshopsQuery.isFetching}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            {items.map((workshop) => {
              const expanded = expandedId === workshop.id;
              const pendingForInvitation =
                workshop.status === "pending_claim";
              const resending =
                resendMutation.isPending &&
                resendMutation.variables === workshop.id;
              return (
                <li
                  key={workshop.id}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : workshop.id)}
                      aria-expanded={expanded}
                      aria-controls={
                        expanded ? `workshop-panel-${workshop.id}` : undefined
                      }
                      className="flex min-h-12 w-full items-center gap-4 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {workshop.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {workshop.taxId ? `CUIT ${workshop.taxId}` : "Sin CUIT"}{" "}
                          ·{" "}
                          {workshop.owner
                            ? `${workshop.owner.firstName} ${workshop.owner.lastName}`
                            : workshop.ownerEmail ?? "Sin propietario aún"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <AdminEntityStatusBadge
                          entityType="workshop"
                          entity={workshop}
                        />
                      </div>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>
                  </div>

                  {expanded && (
                    <div
                      id={`workshop-panel-${workshop.id}`}
                      className="border-t border-border bg-muted/30 px-4 py-4"
                    >
                      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Dueño
                          </dt>
                          <dd className="text-sm text-foreground">
                            {workshop.owner
                              ? `${workshop.owner.firstName} ${workshop.owner.lastName}`
                              : workshop.ownerEmail ?? "Sin propietario aún"}
                          </dd>
                          {workshop.owner && (
                            <dd className="text-xs text-muted-foreground">
                              {workshop.owner.email}
                            </dd>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Email de contacto
                          </dt>
                          <dd className="text-sm text-foreground">
                            {workshop.email ?? "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Sucursales
                          </dt>
                          <dd className="text-sm text-foreground">
                            {workshop.branchesCount}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Miembros
                          </dt>
                          <dd className="text-sm text-foreground">
                            {workshop.membersCount}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Invitación vence
                          </dt>
                          <dd className="text-sm text-foreground">
                            {pendingForInvitation && workshop.invitation
                              ? formatAdminDate(workshop.invitation.expiresAt)
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Alta
                          </dt>
                          <dd className="text-sm text-foreground">
                            {formatAdminDate(workshop.createdAt)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {workshop.isActive &&
                          workshop.status === "pending_claim" &&
                          canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={resending}
                              onClick={() =>
                                resendMutation.mutate(workshop.id)
                              }
                            >
                              {resending && (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              )}
                              Reenviar invitación
                            </Button>
                          )}
                        {canManage && (
                          <Button
                            variant={workshop.isActive ? "destructive" : "default"}
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() => {
                              setStatusDialogError(null);
                              setStatusDialogId(workshop.id);
                            }}
                          >
                            {workshop.isActive ? "Deshabilitar" : "Habilitar"}
                          </Button>
                        )}
                        <Link
                          href={`/admin/workshops/${workshop.id}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "gap-1",
                          )}
                        >
                          Ver detalle
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {meta && meta.totalPages > 1 && (
            <AdminTablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              isFetching={workshopsQuery.isFetching}
              onPageChange={(next) => {
                setPage(next);
                setExpandedId(null);
              }}
            />
          )}
        </>
      )}

      <AdminStatusChangeDialog
        open={statusDialogId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialogId(null);
            setStatusDialogError(null);
          }
        }}
        title={
          statusDialogWorkshop
            ? statusDialogWorkshop.isActive
              ? `¿Deshabilitar ${statusDialogWorkshop.name}?`
              : `¿Habilitar ${statusDialogWorkshop.name}?`
            : ""
        }
        description={
          statusDialogWorkshop
            ? statusDialogWorkshop.isActive
              ? "Los miembros no podrán operar desde este taller. Su historial y sus vehículos se conservan."
              : "Los miembros podrán volver a operar desde este taller. El historial y los vehículos se conservan."
            : ""
        }
        confirmLabel={
          statusDialogWorkshop
            ? statusDialogWorkshop.isActive
              ? "Deshabilitar taller"
              : "Habilitar taller"
            : ""
        }
        variant={statusDialogWorkshop?.isActive ? "destructive" : "default"}
        isPending={statusMutation.isPending}
        dialogError={statusDialogError}
        onConfirm={() => {
          if (!statusDialogWorkshop) return;
          statusMutation.mutate({
            id: statusDialogWorkshop.id,
            isActive: !statusDialogWorkshop.isActive,
          });
        }}
      />
    </>
  );
}