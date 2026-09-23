/**
 * Workspace admin — secciones concesionarias y talleres (features "Onboarding
 * administrado de concesionaria" y "Onboarding admin de taller" D-106).
 * Mapeo de errores de las operaciones admin.
 *
 * Shape del error consumido (src/lib/api.ts → `toApiError` normaliza
 * `error.data` de ky): `{ status, message?, code? }` — `message` y `code` en
 * el TOP-LEVEL del body HTTP. Este resolver lee `error.code` directo. Si el
 * backend anidara el code en otra posición, el shape NO coincide y hay que
 * coordinar el contrato antes de modificar nada (regla: no asumir).
 *
 * Contrato backend congelado:
 * - POST /api/admin/dealerships → 201; 409 CONFLICT por CUIT o nombre
 *   duplicado (el code es CONFLICT en ambos casos; el frontend distingue por
 *   el mensaje interno para dar copy específico — ver Backend Attention).
 * - POST /api/admin/dealerships/:id/invitations → 200 (reenvío).
 * - PATCH /api/admin/dealerships/:id → 200 (detalle actualizado);
 *   409 + code `DEALERSHIP_CUIT_LOCKED` cuando el CUIT no puede modificarse
 *   (concesionaria reclamada + CUIT distinto + actor NO super_admin — decisión
 *   PM D-A/D-B); los demás 409 (CUIT/nombre duplicado) NO usan ese code y se
 *   siguen clasificando por mensaje interno.
 * - POST /api/admin/workshops → 201 (espejo; 409 CONFLICT por CUIT/nombre).
 * - POST /api/admin/workshops/:id/invitations → 200 (reenvío; 404 si el
 *   taller no existe; 409 INVITATION_USED si ya fue reclamado; 409 CONFLICT
 *   si la invitación actual sigue vigente).
 * - PATCH /api/admin/workshops/:id/status { isActive } → 200 (vacío); 404 si
 *   el taller no existe.
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

/** Mensaje de UI para el detalle (GET /admin/dealerships/:id). */
export function resolveAdminDealershipDetailError(): string {
  return "No se pudieron cargar los datos de la concesionaria.";
}

/**
 * Mensaje de UI para editar identidad/contacto (PATCH /admin/dealerships/:id,
 * handoff PM P1). Clasifica 409 CONFLICT por mensaje interno (mismo code que
 * el alta — ver header); 409 + code DEALERSHIP_CUIT_LOCKED (decisión PM
 * D-A/D-B) se detecta PRIMERO por code para dar el copy específico de CUIT
 * reclamado antes del fallback genérico de duplicado. Endpoint comprometido,
 * pendiente de Fase 1 backend.
 */
export function resolveEditAdminDealershipError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  // D-A/D-B (decisión PM): CUIT bloqueado por concesionaria reclamada —
  // 409 + code DEALERSHIP_CUIT_LOCKED. Se evalúa ANTES del fallback de status
  // 409 (que clasifica duplicados) y NO depende del message interno. El
  // mensaje del backend nunca se muestra crudo.
  if (code === "DEALERSHIP_CUIT_LOCKED") {
    return "El CUIT no puede modificarse porque la concesionaria ya fue reclamada.";
  }

  if (status === 409 || code === "CONFLICT") {
    const message = adminErrorMessage(error);
    if (message.includes("cuit") || message.includes("taxid") || message.includes("tax_id")) {
      return "Ya existe otra concesionaria con ese CUIT.";
    }
    if (message.includes("nombre") || message.includes("name")) {
      return "Ya existe otra concesionaria con ese nombre.";
    }
    return "Ya existe una concesionaria registrada con esos datos.";
  }
  if (status === 404) {
    return "La concesionaria ya no existe o fue eliminada.";
  }
  if (status === 403) {
    return "No tenés permisos para editar concesionarias.";
  }
  if (status === 400) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (status === 422) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo guardar la concesionaria. Intentá nuevamente.";
}

/**
 * Mensaje de UI para habilitar/deshabilitar (PATCH /admin/dealerships/:id/
 * status, P2/P3). Espejo de resolveUpdateWorkshopStatusError. Endpoint
 * comprometido, pendiente de Fase 1 backend.
 */
export function resolveUpdateDealershipStatusError(error: unknown): string {
  const status = adminErrorStatus(error);

  if (status === 404) {
    return "La concesionaria ya no existe.";
  }
  if (status === 403) {
    return "No tenés permisos para gestionar concesionarias.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo actualizar el estado de la concesionaria.";
}

/* ------------------------------------------------------------------ */
/* Talleres (D-106) — espejo de concesionarias                          */
/* ------------------------------------------------------------------ */

/** Mensaje de UI para el alta (POST /admin/workshops). */
export function resolveCreateAdminWorkshopError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 409 || code === "CONFLICT") {
    const message = adminErrorMessage(error);
    if (message.includes("cuit") || message.includes("taxid") || message.includes("tax_id")) {
      return "Ya existe un taller con ese CUIT.";
    }
    if (message.includes("nombre") || message.includes("name")) {
      return "Ya existe un taller con ese nombre.";
    }
    return "Ya existe un taller registrado con esos datos.";
  }
  if (status === 403) {
    return "No tenés permisos para crear talleres.";
  }
  if (status === 400) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo crear el taller. Intentá nuevamente.";
}

/** Mensaje de UI para el reenvío de invitación (POST /admin/workshops/:id/invitations). */
export function resolveResendWorkshopInvitationError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 404) {
    return "El taller ya no existe o fue eliminado.";
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

/** Mensaje de UI para el listado (GET /admin/workshops). */
export function resolveAdminWorkshopsListError(): string {
  return "No se pudieron cargar los talleres. Intentá nuevamente.";
}

/** Mensaje de UI para el detalle (GET /admin/workshops/:id). */
export function resolveAdminWorkshopDetailError(): string {
  return "No se pudieron cargar los datos del taller.";
}

/** Mensaje de UI para habilitar/deshabilitar (PATCH /admin/workshops/:id/status). */
export function resolveUpdateWorkshopStatusError(error: unknown): string {
  const status = adminErrorStatus(error);

  if (status === 404) {
    return "El taller ya no existe.";
  }
  if (status === 403) {
    return "No tenés permisos para gestionar talleres.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo actualizar el estado del taller.";
}

/* ------------------------------------------------------------------ */
/* Usuarios de plataforma (D-106 users)                                */
/* ------------------------------------------------------------------ */

/**
 * Mensaje de UI para el alta/invitación (POST /admin/users).
 * 409 CONFLICT con variantes distinguidas por mensaje interno (mismo code).
 */
export function resolveInvitePlatformUserError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 409 || code === "CONFLICT") {
    const message = adminErrorMessage(error);
    // D-S3: email de cuenta desactivada (mismo code CONFLICT que el resto).
    if (message.includes("desactivad")) {
      return "Este email está asociado a una cuenta desactivada. Contactá a soporte.";
    }
    if (message.includes("suspend")) {
      return "La cuenta está suspendida.";
    }
    if (message.includes("ya tiene el rol")) {
      return "El usuario ya tiene este rol asignado.";
    }
    if (message.includes("invitación pendiente") || message.includes("invitacion pendiente")) {
      return "Ya existe una invitación pendiente para este email.";
    }
    return "No se pudo invitar al usuario. Intentá nuevamente.";
  }
  if (status === 403) {
    return "No tenés permisos para invitar usuarios de plataforma.";
  }
  if (status === 400) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  if (status === 404) {
    return "El rol seleccionado no existe.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo invitar al usuario. Intentá nuevamente.";
}

/** Mensaje de UI para el listado (GET /admin/users). */
export function resolveAdminUsersListError(): string {
  return "No se pudieron cargar los usuarios. Intentá nuevamente.";
}

/** Mensaje de UI para el detalle (GET /admin/users/:id). */
export function resolveAdminUserDetailError(): string {
  return "No se pudieron cargar los datos del usuario.";
}

/** Mensaje de UI para suspender/reactivar (PATCH /admin/users/:id/status). */
export function resolveUpdateUserStatusError(error: unknown): string {
  const status = adminErrorStatus(error);

  if (status === 404) {
    return "El usuario ya no existe.";
  }
  if (status === 403) {
    return "No tenés permisos para gestionar el estado de usuarios.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo actualizar el estado del usuario.";
}

/** Mensaje de UI para asignar rol (POST /admin/roles/assign). */
export function resolveAssignUserRoleError(error: unknown): string {
  const status = adminErrorStatus(error);
  const code = adminErrorCode(error);

  if (status === 409 || code === "CONFLICT") {
    return "El usuario ya tiene este rol asignado.";
  }
  if (status === 403) {
    return "No tenés permisos para asignar roles.";
  }
  if (status === 404) {
    return "El usuario o el rol ya no existen.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo asignar el rol. Intentá nuevamente.";
}

/** Mensaje de UI para quitar rol (DELETE /admin/roles/revoke). */
export function resolveRevokeUserRoleError(error: unknown): string {
  const status = adminErrorStatus(error);

  if (status === 403) {
    return "No tenés permisos para quitar roles.";
  }
  if (status === 404) {
    return "El usuario ya no tiene este rol asignado.";
  }
  if (status && status >= 500) {
    return "Error interno del servidor. Intentá más tarde.";
  }
  return "No se pudo quitar el rol. Intentá nuevamente.";
}

/** Mensaje de UI para el listado de roles (GET /admin/roles). */
export function resolveListAdminRolesError(): string {
  return "No se pudieron cargar los roles. Intentá nuevamente.";
}