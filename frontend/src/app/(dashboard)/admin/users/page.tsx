"use client";

/**
 * Listado admin de usuarios de plataforma — /admin/users (Fase 2/3 handoff
 * PM: listado expandible Propuesta B).
 *
 * Fuente: GET /admin/users?page&limit&q&status (permiso admin.users.list).
 * Búsqueda por q con debounce 300ms; filtro por estado UserStatus
 * (pending/active/suspended).
 *
 * - Badge de estado efectivo SOLO por status de cuenta (P6: sin expiración de
 *   invitaciones en usuarios — el helper admin-status.ts lo garantiza).
 * - Expansión (Propuesta B): email, roles y alta + acción "Ver detalle".
 *
 * Interacción (acordeón): una sola fila expandida; se cierra al cambiar
 * filtro, búsqueda o página (decidido para dealerships/talleres y aplicado
 * igual acá por consistencia). Nombre NO navega.
 *
 * Query key: ["admin-users", page, status, q].
 */
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Search, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { AdminEntityStatusBadge } from "@/components/admin/admin-entity-status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import { adminApi } from "@/lib/api";
import { resolveAdminUsersListError } from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import { formatAdminDate } from "@/lib/admin-status";
import { cn } from "cn";
import type { AdminUserStatus } from "@/types/admin";

const PAGE_SIZE = 10;

type StatusFilter = "all" | AdminUserStatus;

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const usersQuery = useQuery({
    queryKey: ["admin-users", page, statusFilter, debouncedSearch],
    queryFn: () =>
      adminApi.listUsers({
        page,
        limit: PAGE_SIZE,
        q: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
    retry: false,
  });

  // Gate defensivo por permiso de sección (UX; llegó por URL directa sin el
  // permiso admin.users.list). Backend sigue siendo la authority. Los hooks ya
  // corrieron (rules-of-hooks).
  if (!can(user, "admin.users.list")) {
    return <AdminNoAccessState />;
  }

  const items = usersQuery.data?.data ?? [];
  const meta = usersQuery.data?.meta;

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
    // Cerrar la fila expandida al cambiar filtro, búsqueda o página
    // (consistente con dealerships/talleres; NO al refetch de fondo).
    setExpandedId(null);
  };

  const isEmpty = meta?.total === 0 && !debouncedSearch.trim();

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná los usuarios de la plataforma, sus roles y su estado.
          </p>
        </div>
        <Link
          href="/admin/users/nueva"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Plus className="h-3.5 w-3.5" />
          Invitar usuario
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1 sm:max-w-xs">
          <label
            htmlFor="admin-users-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Buscar
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="admin-users-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                setExpandedId(null);
              }}
              placeholder="Nombre o email"
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="admin-users-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Estado
          </label>
          <Select
            id="admin-users-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="w-44"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
          </Select>
        </div>
        <p className="pb-1 text-xs text-muted-foreground">
          Orden: pendientes primero (server-side)
        </p>
      </div>

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              No se pudieron cargar los datos
            </CardTitle>
            <CardDescription>{resolveAdminUsersListError()}</CardDescription>
          </CardHeader>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title="No hay usuarios para mostrar"
            description={
              isEmpty
                ? "Todavía no hay usuarios en la plataforma. Invitá al primer administrador para empezar a gestionar."
                : "Ningún usuario coincide con la búsqueda o el filtro actual."
            }
            action={
              <Link
                href="/admin/users/nueva"
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <Plus className="h-3.5 w-3.5" />
                Invitar usuario
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <ul
            aria-busy={usersQuery.isFetching}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            {items.map((userItem) => {
              const expanded = expandedId === userItem.id;
              const displayName =
                [userItem.firstName, userItem.lastName]
                  .filter(Boolean)
                  .join(" ") || userItem.email;
              return (
                <li
                  key={userItem.id}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : userItem.id)}
                      aria-expanded={expanded}
                      aria-controls={
                        expanded ? `user-panel-${userItem.id}` : undefined
                      }
                      className="flex min-h-12 w-full items-center gap-4 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {userItem.email}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <AdminEntityStatusBadge
                          entityType="user"
                          entity={userItem}
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
                      id={`user-panel-${userItem.id}`}
                      className="border-t border-border bg-muted/30 px-4 py-4"
                    >
                      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Email
                          </dt>
                          <dd className="text-sm text-foreground">
                            {userItem.email}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Roles
                          </dt>
                          <dd className="text-sm text-foreground">
                            {userItem.roles.length > 0
                              ? userItem.roles.map((role) => role.name).join(", ")
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Alta
                          </dt>
                          <dd className="text-sm text-foreground">
                            {formatAdminDate(userItem.createdAt)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/users/${userItem.id}`}
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
              isFetching={usersQuery.isFetching}
              onPageChange={(next) => {
                setPage(next);
                setExpandedId(null);
              }}
            />
          )}
        </>
      )}
    </>
  );
}