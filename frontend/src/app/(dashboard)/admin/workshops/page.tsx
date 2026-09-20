"use client";

/**
 * Listado admin de talleres — /admin/workshops (D-106, espejo de
 * concesionarias).
 *
 * Fuente: GET /admin/workshops?page&limit&status. Estados:
 * - isActive=false → Badge destructive "Deshabilitado" (SIEMPRE gana, incluso
 *   en pending_claim: un taller deshabilitado no puede operar aunque no haya
 *   sido reclamado).
 * - status pending_claim → Badge warning "Pendiente de claim" + texto
 *   secundario "Sin propietario aún" + acción "Reenviar invitación" (POST
 *   /admin/workshops/:id/invitations).
 * - status active → Badge success "Activo".
 *
 * Query key: ["admin-workshops", page, statusFilter]. Fila clickeable →
 * /admin/workshops/[id] (el nombre también es link accesible).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Wrench } from "lucide-react";
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
  resolveAdminWorkshopsListError,
  resolveResendWorkshopInvitationError,
} from "@/lib/admin-errors";
import { can } from "@/lib/admin-access";
import type { AdminWorkshopStatus } from "@/types/admin";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

const PAGE_SIZE = 10;
const BANNER_DURATION_MS = 4000;

type StatusFilter = "all" | AdminWorkshopStatus;

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

export default function AdminWorkshopsPage() {
  const router = useRouter();
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

  // Gate defensivo por permiso de sección (UX; llegó por URL directa sin el
  // permiso admin.workshops.list). Backend sigue siendo la authority.
  if (!can(user, "admin.workshops.list")) {
    return <AdminNoAccessState />;
  }

  const items = workshopsQuery.data?.data ?? [];
  const meta = workshopsQuery.data?.meta;

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

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
          <Plus className="h-3.5 w-3.5" />
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
          <CardContentEmpty message={resolveAdminWorkshopsListError()} />
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
                <Plus className="h-3.5 w-3.5" />
                Nuevo taller
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Listado de talleres de la plataforma</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Taller</th>
                  <th scope="col" className="px-4 py-3 font-medium">Dueño</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Miembros</th>
                  <th scope="col" className="px-4 py-3 font-medium">Sucursales</th>
                  <th scope="col" className="px-4 py-3 font-medium">Invitación vence</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((workshop) => {
                  const isPending = workshop.status === "pending_claim";
                  const isDisabled = !workshop.isActive;
                  const resending =
                    resendMutation.isPending &&
                    resendMutation.variables === workshop.id;
                  return (
                    <tr
                      key={workshop.id}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/30"
                      onClick={() =>
                        router.push(`/admin/workshops/${workshop.id}`)
                      }
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/workshops/${workshop.id}`}
                          className="font-medium text-foreground transition-colors hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {workshop.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {workshop.taxId || "Sin CUIT"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {workshop.owner ? (
                          <div>
                            <p className="text-foreground">
                              {workshop.owner.firstName}{" "}
                              {workshop.owner.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {workshop.owner.email}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {workshop.ownerEmail || "—"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isDisabled ? (
                          <Badge variant="destructive">Deshabilitado</Badge>
                        ) : isPending ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge variant="warning">Pendiente de claim</Badge>
                            <span className="text-xs text-muted-foreground">
                              Sin propietario aún
                            </span>
                          </div>
                        ) : (
                          <Badge variant="success">Activo</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {workshop.membersCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {workshop.branchesCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isPending && workshop.invitation
                          ? formatDate(workshop.invitation.expiresAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPending && !isDisabled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resending}
                            onClick={(e) => {
                              e.stopPropagation();
                              resendMutation.mutate(workshop.id);
                            }}
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
              isFetching={workshopsQuery.isFetching}
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