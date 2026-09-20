/**
 * Workspace admin — sección concesionarias (feature "Onboarding administrado
 * de concesionaria"). Mapeo de errores de las operaciones admin.
 *
 * Contrato backend congelado:
 * - POST /api/admin/dealerships → 201; 409 CONFLICT por CUIT o nombre
 *   duplicado (el code es CONFLICT en ambos casos; el frontend distingue por
 *   el mensaje interno para dar copy específico — ver Backend Attention).
 * - POST /api/admin/dealerships/:id/invitations → 200 (reenvío).
 *
 * El frontend NUNCA muestra el mensaje crudo del backend (patrón
 * src/lib/transfer-errors.ts / invitation-errors.ts).
 */

export interface AdminApiError {
  status?: number;
  message?: string;
  code?: string;
}

function adminErrorStatus(error: unknown): number | undefined {
  return (error as AdminApiError)?.status;
}

function adminErrorCode(error: unknown): string | undefined {
  return (error as AdminApiError)?.code;
}

function adminErrorMessage(error: unknown): string {
  return ((error as AdminApiError)?.message ?? "").toLowerCase();
}

/** Mensaje de UI para el alta (POST /admin/dealerships). */
export function resolveCreateAdminDealershipError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 409 || code === "CONFLICT") {
    const message = adminErrorMessage(error);
    if (message.includes("cuit") || message.includes("taxid") || message.includes("tax_id")) {
      return "Ya existe una concesionaria con ese CUIT.";
    }
    if (message.includes("nombre") || message.includes("name")) {
      return "Ya existe una concesionaria con ese nombre.";
    }
    return "Ya existe una concesionaria registrada con esos datos.";
  }
  if (status === 403) {
    return "No tenés permisos para crear concesionarias.";
  }
  if (status === 400) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo crear la concesionaria. Intentá nuevamente.";
}

/** Mensaje de UI para el reenvío de invitación (POST /admin/dealerships/:id/invitations). */
export function resolveResendInvitationError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 404) {
    return "La concesionaria ya no existe o fue eliminada.";
  }
  if (status === 409 && (code === "INVITATION_USED" || code === "INVITATION_CANCELLED")) {
    return "La invitación actual ya no está vigente. No se pudo reenviar.";
  }
  if (status === 409) {
    return "La invitación actual sigue vigente. No se reenvió una nueva.";
  }
  if (status === 403) {
    return "No tenés permisos para reenviar invitaciones.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo reenviar la invitación. Intentá nuevamente.";
}

/** Mensaje de UI para el listado (GET /admin/dealerships). */
export function resolveAdminDealershipsListError(): string {
  return "No se pudieron cargar las concesionarias. Intentá nuevamente.";
}