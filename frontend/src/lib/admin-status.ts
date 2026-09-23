/**
 * Helper único de estado efectivo para los listados admin (Fase 2/3 handoff
 * PM — Propuesta B de listados expandibles).
 *
 * Unifica la precedencia de estados de concesionarias, talleres y usuarios de
 * plataforma en un solo lugar (DRY): el Badge, los triggers de acciones y los
 * listados consumen exclusivamente estos getters.
 *
 * Precedencia (decisión PM P2):
 *   1. `isActive === false` → "disabled" SIEMPRE gana, incluso con invitación
 *      vencida (una entidad deshabilitada no puede operar ni reclamarse).
 *   2. `status === "active"` → "active".
 *   3. Pendiente (pending_claim / pending) → si `invitation.status ===
 *      "pending"` y `invitation.expiresAt < now` → "expired_pending"
 *      (decisión client-side D3; el contrato no trae un flag de expiración).
 *      Caso contrario → "pending_claim" / "pending".
 *   4. Usuarios (P6): SOLO status de cuenta. Sin lógica de expiración ni
 *      invitaciones — "suspended" mapea a su propio estado.
 *
 * `formatAdminDate` centraliza el formato es-AR (dd mmm yyyy) para captions
 * e información de invitaciones.
 */
export type AdminEntityStatusState =
  | "disabled"
  | "expired_pending"
  | "pending_claim"
  | "pending"
  | "active"
  | "suspended";

/** Shape mínimo de invitación (listados concesionarias/talleres). */
export interface AdminInvitationStatusShape {
  status?: string | null;
  expiresAt?: string | null;
}

/** Shape mínimo de entidad (listados concesionarias/talleres/usuarios). */
export interface AdminEntityStatusShape {
  isActive?: boolean;
  status?: string;
  invitation?: AdminInvitationStatusShape | null;
}

/** Fecha corta es-AR (dd mmm yyyy); inputs inválidos/missing → "—". */
export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isInvitationExpired(
  invitation: AdminInvitationStatusShape | null | undefined,
  now: number,
): boolean {
  if (!invitation) return false;
  // Solo una invitación vigente puede vencer (status "pending"). Una
  // invitación usada/cancelada NO es "expirada" (D3).
  if (invitation.status !== "pending") return false;
  if (!invitation.expiresAt) return false;
  const expiresAt = Date.parse(invitation.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt < now;
}

/** Estado efectivo de CONCESIONARIA (contrato: isActive + status + invitation). */
export function getAdminDealershipStatusState(
  entity: AdminEntityStatusShape,
  now: number = Date.now(),
): AdminEntityStatusState {
  if (entity.isActive === false) return "disabled";
  if (entity.status === "active") return "active";
  // Único status restante en el contrato: pending_claim.
  return isInvitationExpired(entity.invitation, now)
    ? "expired_pending"
    : "pending_claim";
}

/** Estado efectivo de TALLER (espejo de concesionarias). */
export function getAdminWorkshopStatusState(
  entity: AdminEntityStatusShape,
  now: number = Date.now(),
): AdminEntityStatusState {
  return getAdminDealershipStatusState(entity, now);
}

/**
 * Estado efectivo de USUARIO de plataforma (P6): solo status de cuenta. La
 * cuenta manda; no hay expiración de invitaciones en el listado de usuarios.
 */
export function getAdminUserStatusState(
  entity: AdminEntityStatusShape,
): AdminEntityStatusState {
  if (entity.status === "active") return "active";
  if (entity.status === "suspended") return "suspended";
  return "pending";
}