import type { SessionUser } from "@/types/auth";

/**
 * GATE DE UX (NUNCA security boundary — AGENTS.md §22).
 *
 * Determina si el usuario actual puede ver el workspace admin. Solo controla
 * navegación/visibilidad; el enforcement real vive en el backend
 * (permissions: admin.dashboard, admin.dealerships.*).
 *
 * Contrato de sesión real (GET /auth/me → SessionUser):
 * - `roles[].type` es el SystemRoleType: "super_admin" | "admin" | "support" | "user".
 * - `roles[].permissions` solo se incluye cuando el backend lo puebla
 *   (RoleDto includePermissions=true); para super_admin es `["*"]`.
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