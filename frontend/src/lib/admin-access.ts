import type { SessionUser } from "@/types/auth";

/**
 * GATES DE UX (NUNCA security boundary — AGENTS.md §22).
 *
 * Ambos helpers controlan navegación/visibilidad; el enforcement real vive en
 * el backend (permissions: admin.dashboard, admin.dealerships.*, ...).
 *
 * Contrato de sesión real (GET /auth/me → SessionUser):
 * - `roles[].type` es el SystemRoleType: "super_admin" | "admin" | "support" | "user".
 * - `roles[].permissions` solo se incluye cuando el backend lo puebla
 *   (RoleDto includePermissions=true); para super_admin es `["*"]`.
 */

/**
 * Gate de WORKSPACE: determina si el usuario puede ver el workspace admin en
 * su conjunto (/admin). Se mantiene como puerta única de entrada.
 */
export function hasAdminAccess(user: SessionUser | null | undefined): boolean {
  if (!user) return false;

  const roles = user.roles ?? [];
  if (
    roles.some(
      (role) => role.type === "super_admin" || role.type === "admin",
    )
  ) {
    return true;
  }

  const permissions = roles.flatMap((role) => role.permissions ?? []);
  return permissions.includes("*") || permissions.includes("admin.dashboard");
}

/**
 * Gate de SECCIÓN: evalúa un permiso puntual sobre la sesión del usuario.
 *
 * - `"*"` (super_admin según contrato /auth/me) habilita todo permiso.
 * - El role type "super_admin" también concede todo por defensa (si el
 *   backend alguna vez omitiera permissions en la sesión).
 * - Los permisos se aplanan sobre `roles[].permissions` (contrato real).
 *
 * Uso: ocultar/mostrar secciones del nav y acciones de UX por permiso.
 */
export function can(
  user: SessionUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;

  const roles = user.roles ?? [];
  if (roles.some((role) => role.type === "super_admin")) return true;

  const permissions = roles.flatMap((role) => role.permissions ?? []);
  return permissions.includes("*") || permissions.includes(permission);
}