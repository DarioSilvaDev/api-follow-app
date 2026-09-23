"use client";

/**
 * Listado admin de concesionarias — /admin/dealerships (Fase 2/3 handoff PM:
 * listado expandible Propuesta B).
 *
 * Fuente: GET /admin/dealerships?page&limit&status (permiso
 * admin.dealerships.list). Cada fila expande un panel con:
 * - Badge de estado efectivo (helper élnico src/lib/admin-status.ts — P2, D3).
 * - Datos: dueño, email de contacto, miembros, invitación vence, alta.
 * - Acciones: Reenviar invitación (pending_claim/expired_pending +
 *   admin.dealerships.manage), Editar (admin.dealerships.update), estado
 *   Habilitar/Deshabilitar (admin.dealerships.manage), Ver detalle.
 *
 * Interacción (acordeón):
 * - Una sola fila expandida (expandedId); se cierra al cambiar filtro o
 *   página (decisión UX; NO al refetch de fondo — preserva contexto tras
 *   mutaciones).
 * - Nombre NO navega: el detalle se abre por URL accesible desde la expansión.
 *
 * Query key: ["admin-dealerships", page, statusFilter]. Estado → Dialog
 * (AdminStatusChangeDialog); error persistente dentro del dialog para
 * reintento (D6). Endpoints PATCH /admin/dealerships/:id/status y
 * UpdateDealershipInput: comprometidos en handoff PM (Fase 1 backend pendiente).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw, Store } from "lucide-react";
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
  resolveAdminDealershipsListError,
  resolveResendInvitationError,
  resolveUpdateDealershipStatusError,
} from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import { formatAdminDate } from "@/lib/admin-status";
import { cn } from "cn";

const PAGE_SIZE = 10;
const BANNER_DURATION_MS = 4000;

type StatusFilter = "all" | "pending_claim" | "active";

export default function AdminDealershipsPage() {
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

  const dealershipsQuery = useQuery({
    queryKey: ["admin-dealerships", page, statusFilter],
    queryFn: () =>
      adminApi.listDealerships({
        page,
        limit: PAGE_SIZE,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
    retry: false,
  });

  const resendMutation = useMutation({
    mutationFn: (dealershipId: string) =>
      adminApi.resendInvitation(dealershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      setBanner("Invitación reenviada al dueño.");
    },
    onError: (error) => {
      setBanner(resolveResendInvitationError(error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updateDealershipStatus(id, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      queryClient.invalidateQueries({
        queryKey: ["admin-dealership", variables.id],
      });
      setStatusDialogId(null);
      setStatusDialogError(null);
      setBanner("Estado de la concesionaria actualizado.");
    },
    onError: (error) => {
      // Error persistente DENTRO del dialog (role="alert") para reintento;
      // el dialog queda abierto (D6).
      setStatusDialogError(resolveUpdateDealershipStatusError(error));
    },
  });

  // Gate defensivo por permiso de sección (UX; backend es la authority).
  if (!can(user, "admin.dealerships.list")) {
    return <AdminNoAccessState />;
  }

  const canManage = can(user, "admin.dealerships.manage");
  const canEdit = can(user, "admin.dealerships.update");
  const items = dealershipsQuery.data?.data ?? [];
  const meta = dealershipsQuery.data?.meta;

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
    // Cerrar la fila expandida al cambiar filtro o página (decisión UX; NO al
    // refetch de fondo — preserva contexto tras mutaciones).
    setExpandedId(null);
  };

  const statusDialogDealership =
    statusDialogId !== null
      ? items.find((item) => item.id === statusDialogId) ?? null
      : null;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concesionarias</h1>
          <p className="text-sm text-muted-foreground">
            Creá concesionarias desde la plataforma y gestioná la invitación al
            dueño.
          </p>
        </div>
        <Link
          href="/admin/dealerships/nueva"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Store className="h-3.5 w-3.5" />
          Nueva concesionaria
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="dealership-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Estado
          </label>
          <Select
            id="dealership-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="w-44"
          >
            <option value="all">Todas</option>
            <option value="pending_claim">Pendiente de claim</option>
            <option value="active">Activas</option>
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

      {dealershipsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : dealershipsQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              No se pudieron cargar los datos
            </CardTitle>
            <CardDescription>{resolveAdminDealershipsListError()}</CardDescription>
          </CardHeader>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title="No hay concesionarias"
            description={
              statusFilter === "all"
                ? "Creá la primera concesionaria para comenzar a gestionar el ecosistema."
                : "No hay concesionarias en este estado."
            }
            action={
              <Link
                href="/admin/dealerships/nueva"
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <Store className="h-3.5 w-3.5" />
                Nueva concesionaria
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <ul
            aria-busy={dealershipsQuery.isFetching}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            {items.map((dealership) => {
              const expanded = expandedId === dealership.id;
              const pendingForInvitation =
                dealership.status === "pending_claim";
              const resending =
                resendMutation.isPending &&
                resendMutation.variables === dealership.id;
              return (
                <li
                  key={dealership.id}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : dealership.id)
                      }
                      aria-expanded={expanded}
                      aria-controls={
                        expanded ? `dealership-panel-${dealership.id}` : undefined
                      }
                      className="flex min-h-12 w-full items-center gap-4 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {dealership.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {dealership.taxId ? `CUIT ${dealership.taxId}` : "Sin CUIT"}{" "}
                          ·{" "}
                          {dealership.owner
                            ? `${dealership.owner.firstName} ${dealership.owner.lastName}`
                            : "Sin propietario aún"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <AdminEntityStatusBadge
                          entityType="dealership"
                          entity={dealership}
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
                      id={`dealership-panel-${dealership.id}`}
                      className="border-t border-border bg-muted/30 px-4 py-4"
                    >
                      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Dueño
                          </dt>
                          <dd className="text-sm text-foreground">
                            {dealership.owner
                              ? `${dealership.owner.firstName} ${dealership.owner.lastName}`
                              : "Sin propietario aún"}
                          </dd>
                          {dealership.owner && (
                            <dd className="text-xs text-muted-foreground">
                              {dealership.owner.email}
                            </dd>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Email de contacto
                          </dt>
                          <dd className="text-sm text-foreground">
                            {dealership.email ?? "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Miembros
                          </dt>
                          <dd className="text-sm text-foreground">
                            {dealership.memberCount}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Invitación vence
                          </dt>
                          <dd className="text-sm text-foreground">
                            {pendingForInvitation && dealership.invitation
                              ? formatAdminDate(dealership.invitation.expiresAt)
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Alta
                          </dt>
                          <dd className="text-sm text-foreground">
                            {formatAdminDate(dealership.createdAt)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {dealership.isActive &&
                          dealership.status === "pending_claim" &&
                          canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={resending}
                              onClick={() =>
                                resendMutation.mutate(dealership.id)
                              }
                            >
                              {resending && (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              )}
                              Reenviar invitación
                            </Button>
                          )}
                        {canEdit && (
                          <Link
                            href={`/admin/dealerships/${dealership.id}/editar`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                            )}
                          >
                            Editar
                          </Link>
                        )}
                        {canManage && (
                          <Button
                            variant={dealership.isActive ? "destructive" : "default"}
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() => {
                              setStatusDialogError(null);
                              setStatusDialogId(dealership.id);
                            }}
                          >
                            {dealership.isActive
                              ? "Deshabilitar"
                              : "Habilitar"}
                          </Button>
                        )}
                        <Link
                          href={`/admin/dealerships/${dealership.id}`}
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
              isFetching={dealershipsQuery.isFetching}
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
          statusDialogDealership
            ? statusDialogDealership.isActive
              ? `¿Deshabilitar ${statusDialogDealership.name}?`
              : `¿Habilitar ${statusDialogDealership.name}?`
            : ""
        }
        description={
          statusDialogDealership
            ? statusDialogDealership.isActive
              ? "La concesionaria quedará deshabilitada. El historial, vehículos, miembros y trazabilidad se conservan."
              : "La concesionaria volverá a estar activa."
            : ""
        }
        confirmLabel={
          statusDialogDealership
            ? statusDialogDealership.isActive
              ? "Deshabilitar concesionaria"
              : "Habilitar concesionaria"
            : ""
        }
        variant={
          statusDialogDealership?.isActive ? "destructive" : "default"
        }
        isPending={statusMutation.isPending}
        dialogError={statusDialogError}
        onConfirm={() => {
          if (!statusDialogDealership) return;
          statusMutation.mutate({
            id: statusDialogDealership.id,
            isActive: !statusDialogDealership.isActive,
          });
        }}
      />
    </>
  );
}