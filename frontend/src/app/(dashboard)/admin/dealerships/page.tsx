"use client";

/**
 * Listado admin de concesionarias — /admin/dealerships
 * (feature "Onboarding administrado de concesionaria", decisiones PM cerradas).
 *
 * Fuente: GET /admin/dealerships?page&limit&status (permiso
 * admin.dealerships.list). Estados:
 * - pending_claim → Badge warning ámbar "Pendiente de claim" + texto
 *   secundario "Sin propietario aún" + acción "Reenviar invitación" (POST
 *   /admin/dealerships/:id/invitations, permiso admin.dealerships.manage).
 * - active → Badge success "Activa".
 *
 * Query key: ["admin-dealerships", page, statusFilter] → el filtro y la
 * paginación invalidan/refetchean la lista completa de ese prefijo.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Store } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

const PAGE_SIZE = 10;
const BANNER_DURATION_MS = 4000;

type StatusFilter = "all" | "pending_claim" | "active";

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

export default function AdminDealershipsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  // Gate defensivo por permiso de sección (UX; llegó por URL directa sin el
  // permiso admin.dealerships.list). Backend sigue siendo la authority.
  if (!can(user, "admin.dealerships.list")) {
    return <AdminNoAccessState />;
  }

  const items = dealershipsQuery.data?.data ?? [];
  const meta = dealershipsQuery.data?.meta;

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

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
          <Plus className="h-3.5 w-3.5" />
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
          <CardContentEmpty message={resolveAdminDealershipsListError()} />
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
                <Plus className="h-3.5 w-3.5" />
                Nueva concesionaria
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Listado de concesionarias de la plataforma
              </caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Concesionaria</th>
                  <th scope="col" className="px-4 py-3 font-medium">Dueño</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Miembros</th>
                  <th scope="col" className="px-4 py-3 font-medium">Invitación vence</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((dealership) => {
                  const isPending = dealership.status === "pending_claim";
                  const resending =
                    resendMutation.isPending &&
                    resendMutation.variables === dealership.id;
                  return (
                    <tr
                      key={dealership.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {dealership.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dealership.taxId || "Sin CUIT"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {dealership.owner ? (
                          <div>
                            <p className="text-foreground">
                              {dealership.owner.firstName}{" "}
                              {dealership.owner.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {dealership.owner.email}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">—</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPending ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge variant="warning">Pendiente de claim</Badge>
                            <span className="text-xs text-muted-foreground">
                              Sin propietario aún
                            </span>
                          </div>
                        ) : (
                          <Badge variant="success">Activa</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dealership.memberCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isPending && dealership.invitation
                          ? formatDate(dealership.invitation.expiresAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPending ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resending}
                            onClick={() =>
                              resendMutation.mutate(dealership.id)
                            }
                          >
                            {resending ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Reenviar invitación
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <AdminTablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              isFetching={dealershipsQuery.isFetching}
              onPageChange={(next) => setPage(next)}
            />
          )}
        </Card>
      )}
    </>
  );
}

function CardContentEmpty({ message }: { message: string }) {
  return (
    <CardHeader>
      <CardTitle className="text-base">No se pudieron cargar los datos</CardTitle>
      <CardDescription>{message}</CardDescription>
    </CardHeader>
  );
}