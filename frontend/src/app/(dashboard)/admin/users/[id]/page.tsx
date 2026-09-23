"use client";

/**
 * Detalle admin de usuario de plataforma — /admin/users/[id] (D-106).
 *
 * Fuente: GET /admin/users/:id (UserDetailAdminResponseDto) + GET /admin/roles
 * (SystemRoleResponseDto[] — resuelve roleType → roleId; assign/revoke usan
 * UUID, NUNCA roleType).
 *
 * Secciones:
 * - Card identidad: nombre, email, badges de estado, rol(es) y acción
 *   Suspender/Reactivar con Dialog de confirmación (PATCH
 *   /admin/users/:id/status { status: UserStatus }).
 * - Card roles: roles actuales + Select de roles asignables (Admin | Soporte;
 *   super_admin y usuario final quedan fuera de la UI) + botones Asignar
 *   (POST /admin/roles/assign) y Quitar (DELETE /admin/roles/revoke).
 *
 * Protecciones UX (el enforcement real es del backend):
 * - El propio usuario logueado NO puede suspenderse ni quitarse roles.
 * - El rol super_admin NO puede quitarse desde la UI.
 *
 * Estados de error (patrón RF-6): 404 → "Usuario no encontrado"; 403 →
 * "Acceso denegado"; genérico → reintentar.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { adminApi, isHTTPError } from "@/lib/api";
import {
  resolveAdminUserDetailError,
  resolveAssignUserRoleError,
  resolveListAdminRolesError,
  resolveRevokeUserRoleError,
  resolveUpdateUserStatusError,
} from "@/lib/admin-errors";

const BANNER_DURATION_MS = 4000;

type Banner = { tone: "success" | "error"; text: string } | null;

function errorStatus(error: unknown): number | undefined {
  return isHTTPError(error)
    ? error.response.status
    : (error as { status?: number })?.status;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const { user: sessionUser } = useAuth();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<Banner>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  // Banner transitorio inline (sin toast, patrón paneles del repo).
  const showBanner = (tone: NonNullable<Banner>["tone"], text: string) => {
    setBanner({ tone, text });
    window.setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  };

  const userQuery = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => adminApi.getUser(userId ?? ""),
    enabled: Boolean(userId),
    retry: false,
  });

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => adminApi.listRoles(),
    enabled: Boolean(userId),
    retry: false,
  });

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      adminApi.updateUserStatus(userId ?? "", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showBanner("success", "Estado del usuario actualizado.");
    },
    onError: (error) => {
      showBanner("error", resolveUpdateUserStatusError(error));
    },
  });

  const assignMutation = useMutation({
    mutationFn: (roleId: string) =>
      adminApi.assignUserRole({ userId: userId ?? "", roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelectedRoleId("");
      showBanner("success", "Rol asignado al usuario.");
    },
    onError: (error) => {
      showBanner("error", resolveAssignUserRoleError(error));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (roleId: string) =>
      adminApi.revokeUserRole({ userId: userId ?? "", roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showBanner("success", "Rol quitado al usuario.");
    },
    onError: (error) => {
      showBanner("error", resolveRevokeUserRoleError(error));
    },
  });

  // Loading: ficha aún no disponible.
  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Errores de carga (patrón RF-6).
  if (userQuery.isError || !userQuery.data) {
    const status = errorStatus(userQuery.error);
    if (status === 404) {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <EntityNotFoundState
            title="Usuario no encontrado"
            description="El usuario que buscás no existe o fue eliminado."
            backHref="/admin/users"
            backLabel="Volver a usuarios"
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
                  No tenés permiso para ver este usuario.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el usuario
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolveAdminUserDetailError()}
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/admin/users">
                <Button variant="outline">Volver a usuarios</Button>
              </Link>
              {status !== 403 && (
                <Button onClick={() => userQuery.refetch()}>Reintentar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const detailUser = userQuery.data;
  const isSelf = sessionUser?.id === detailUser.id;
  const displayName =
    [detailUser.firstName, detailUser.lastName].filter(Boolean).join(" ") ||
    detailUser.email;

  // Roles asignables desde la UI: Admin | Soporte (nunca super_admin ni el rol
  // usuario final), y nunca los que el usuario ya tiene.
  console.log("🚀 ~ AdminUserDetailPage ~ rolesQuery:", rolesQuery)
  const assignableRoles = (rolesQuery.data ?? []).filter(
    (role) =>
      role.type !== "super_admin" &&
      role.type !== "user" &&
      !detailUser.roles.some((assigned) => assigned.id === role.id),
  );

  const breadcrumbItems = [
    { label: "Administración", href: "/admin" },
    { label: "Usuarios", href: "/admin/users" },
    { label: displayName },
  ];

  const isSuspended = detailUser.status === "suspended";
  const isPending = detailUser.status === "pending";
  const isBusy =
    statusMutation.isPending || assignMutation.isPending || revokeMutation.isPending;

  const renderStatusBadge = () => {
    if (isSuspended) return <Badge variant="destructive">Suspendido</Badge>;
    if (isPending) return <Badge variant="warning">Pendiente</Badge>;
    return <Badge variant="success">Activo</Badge>;
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminBreadcrumb items={breadcrumbItems} />

      {banner && (
        <p
          role="status"
          className={`w-full rounded-lg border px-3 py-2 text-sm ${
            banner.tone === "success"
              ? "border-success/40 bg-success/10 text-success-foreground"
              : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {banner.text}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{displayName}</CardTitle>
            <CardDescription className="mt-1.5">{detailUser.email}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {renderStatusBadge()}
              {!isSelf && (
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button variant="outline" size="sm" disabled={isBusy} />
                    }
                  >
                    {statusMutation.isPending && (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {isSuspended ? "Reactivar" : "Suspender"}
                  </DialogTrigger>
                  <DialogPopup>
                    <DialogTitle>
                      {isSuspended
                        ? `¿Reactivar a ${displayName}?`
                        : `¿Suspender a ${displayName}?`}
                    </DialogTitle>
                    <DialogDescription>
                      {isSuspended
                        ? "El usuario volverá a poder iniciar sesión con su cuenta."
                        : "El usuario no podrá iniciar sesión hasta que lo reactives. Sus vehículos y su historial se conservan."}
                    </DialogDescription>
                    <div className="mt-4 flex justify-end gap-2">
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <DialogClose
                        render={
                          <Button
                            variant={isSuspended ? "default" : "destructive"}
                            onClick={() =>
                              statusMutation.mutate(isSuspended ? "active" : "suspended")
                            }
                          />
                        }
                      >
                        {isSuspended ? "Reactivar usuario" : "Suspender usuario"}
                      </DialogClose>
                    </div>
                  </DialogPopup>
                </Dialog>
              )}
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                No podés modificar tu propia cuenta desde este panel.
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Roles
            </span>
            <div className="flex flex-wrap gap-1.5">
              {detailUser.roles.length > 0 ? (
                detailUser.roles.map((role) => (
                  <Badge key={role.id} variant="secondary">
                    {role.name}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin roles de plataforma
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Último acceso
            </span>
            <p className="text-sm font-medium text-foreground">
              {detailUser.lastLoginAt
                ? new Date(detailUser.lastLoginAt).toLocaleString("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "Nunca"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Alta
            </span>
            <p className="text-sm font-medium text-foreground">
              {new Date(detailUser.createdAt).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          {detailUser.phone && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Teléfono
              </span>
              <p className="text-sm font-medium text-foreground">{detailUser.phone}</p>
            </div>
          )}
          {detailUser.emailVerifiedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email verificado
              </span>
              <p className="text-sm font-medium text-foreground">
                {new Date(detailUser.emailVerifiedAt).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles de plataforma</CardTitle>
          <CardDescription>
            Asigná o quitá roles de administración y soporte. El rol super_admin
            no se gestiona desde este panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rolesQuery.isError && (
            <p className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {resolveListAdminRolesError()}
            </p>
          )}

          {detailUser.roles.length > 0 && (
            <ul className="flex flex-col gap-2">
              {detailUser.roles.map((role) => {
                const isSuperAdmin = role.type === "super_admin";
                const canRevoke = !isSelf && !isSuperAdmin;
                return (
                  <li
                    key={role.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        {role.name}
                      </span>
                      {isSuperAdmin && (
                        <Badge variant="info">Super admin</Badge>
                      )}
                    </div>
                    {canRevoke ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(role.id)}
                      >
                        {revokeMutation.isPending &&
                        revokeMutation.variables === role.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Quitar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {isSuperAdmin ? "No se puede quitar" : "Tu propio rol"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {assignableRoles.length > 0 && !isSelf && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-44 flex-1 flex-col gap-1 sm:max-w-xs">
                <label
                  htmlFor="assign-role-select"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Asignar rol
                </label>
                <Select
                  id="assign-role-select"
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                >
                  <option value="" disabled>
                    Elegí un rol…
                  </option>
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                disabled={!selectedRoleId || assignMutation.isPending}
                onClick={() =>
                  selectedRoleId && assignMutation.mutate(selectedRoleId)
                }
              >
                {assignMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Asignar rol
              </Button>
            </div>
          )}

          {isSelf && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              Este es tu propio usuario: no podés quitarte roles desde este
              panel.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}