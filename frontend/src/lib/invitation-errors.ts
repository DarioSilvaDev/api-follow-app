/**
 * Feature "Onboarding administrado de concesionaria" — mapeo de errores del
 * wizard público de invitación (contrato backend congelado).
 *
 * Errores del GET preview y del POST claim, por `code` (patrón
 * src/lib/transfer-errors.ts):
 * - INVITATION_INVALID  (404)
 * - INVITATION_EXPIRED  (400)
 * - INVITATION_USED     (409)
 * - INVITATION_CANCELLED (409)
 * - Claim: PERMISSION_DENIED (403), AUTH_REQUIRED (401), VALIDATION_ERROR
 *   (400), CONFLICT (409).
 *
 * El 409 CONFLICT del claim tiene DOS variantes que el backend distingue solo
 * por el mensaje (mismo code CONFLICT, sin code dedicado — D-S3):
 * - email con cuenta soft-deleted → "Este email está asociado a una cuenta
 *   desactivada. Contactá a soporte." (se clasifica por el mensaje).
 * - email con cuenta activa/duplicada (P2002) → "Ya existe una cuenta con
 *   este email".
 *
 * El frontend NUNCA muestra el mensaje crudo del backend: cada error se
 * normaliza a copy de UI en español (voseo, consistente con el resto del repo).
 */

export type InvitationErrorKind =
  | "invalid"
  | "expired"
  | "used"
  | "cancelled"
  | "generic";

export interface InvitationApiError {
  status?: number;
  message?: string;
  code?: string;
}

/** Extrae el status HTTP de un error normalizado por `toApiError` (lib/api). */
export function invitationErrorStatus(error: unknown): number | undefined {
  return (error as InvitationApiError)?.status;
}

/** Extrae el code del backend (solo para clasificar internamente). */
export function invitationErrorCode(error: unknown): string | undefined {
  return (error as InvitationApiError)?.code;
}

/**
 * Clasifica el error en un estado terminal del wizard. Prioriza `code`
 * (contrato) y cae a status HTTP como defensa SOLO cuando NO hay `code`
 * (404 → invalid, 400 → expired, 409 → used).
 *
 * IMPORTANTE: con un code distinto de INVITATION_* (p. ej. CONFLICT 409 o
 * VALIDATION_ERROR 400 del POST claim) NO se aplica el fallback por status —
 * devuelve "generic" para que el caller los trate como error inline y no
 * como pantalla terminal de invitación.
 */
export function invitationErrorKind(error: unknown): InvitationErrorKind {
  const code = invitationErrorCode(error);
  if (code === "INVITATION_INVALID") return "invalid";
  if (code === "INVITATION_EXPIRED") return "expired";
  if (code === "INVITATION_USED") return "used";
  if (code === "INVITATION_CANCELLED") return "cancelled";

  if (code === undefined) {
    const status = invitationErrorStatus(error);
    if (status === 404) return "invalid";
    if (status === 400) return "expired";
    if (status === 409) return "used";
  }

  return "generic";
}

// ---------------------------------------------------------------------------
// Copy de UI por estado terminal (pantalla de error SIN formulario — el
// reenvío solo existe desde el panel admin, decisión PM D-B).
// ---------------------------------------------------------------------------

export const INVITATION_KIND_TITLES: Record<InvitationErrorKind, string> = {
  invalid: "Invitación inválida",
  expired: "La invitación venció",
  used: "Invitación ya utilizada",
  cancelled: "Invitación cancelada",
  generic: "No pudimos validar el enlace",
};

export const INVITATION_KIND_BODIES: Record<InvitationErrorKind, string> = {
  invalid:
    "El enlace de invitación es inválido. Verificá que hayas copiado el enlace completo del email que te envió el administrador.",
  expired:
    "La invitación venció y ya no puede utilizarse. Contactá al administrador de la plataforma para solicitar una nueva.",
  used:
    "Esta invitación ya fue utilizada. Si no pudiste completar el trámite, contactá al administrador para que te ayude.",
  cancelled:
    "La invitación fue cancelada por el administrador. Contactá a administración para solicitar una nueva invitación.",
  generic:
    "Ocurrió un error al validar el enlace. Intentá nuevamente y, si el problema persiste, contactá al administrador.",
};

/** Copy de UI para una pantalla de error terminal. */
export function invitationErrorMessage(
  kind: InvitationErrorKind,
): { title: string; body: string } {
  return {
    title: INVITATION_KIND_TITLES[kind],
    body: INVITATION_KIND_BODIES[kind],
  };
}

// ---------------------------------------------------------------------------
// POST claim — resolución de errores (paso 2 del wizard).
// ---------------------------------------------------------------------------

/**
 * Detecta el 409 del claim por "cuenta desactivada" (soft-deleted, D-S3).
 *
 * El backend devuelve code CONFLICT — el mismo del P2002 duplicado — así que
 * NO hay code dedicado: la clasificación es por el mensaje y SOLO dentro de
 * un 409 del claim (nunca se aplica a otros status). El matcher cubre
 * "desactivada"/"desactivado" del copy backend actual.
 */
export function invitationErrorIsSoftDeletedAccount(error: unknown): boolean {
  const status = invitationErrorStatus(error);
  if (status !== 409) return false;
  const message = ((error as InvitationApiError)?.message ?? "").toLowerCase();
  return message.includes("desactivad");
}

/**
 * Mensaje de UI para el claim (POST /dealerships/wizard/claim).
 * Si el error es un estado terminal de la invitación (INVITATION_*) el caller
 * debe transicionar a la pantalla de error (no mostrar inline); acá se devuelve
 * el copy correspondiente. Para el resto se mapea por status a copy de UI.
 */
export function resolveInvitationClaimErrorMessage(error: unknown): string {
  const kind = invitationErrorKind(error);
  if (kind === "invalid") return INVITATION_KIND_BODIES.invalid;
  if (kind === "expired") return INVITATION_KIND_BODIES.expired;
  if (kind === "used") return INVITATION_KIND_BODIES.used;
  if (kind === "cancelled") return INVITATION_KIND_BODIES.cancelled;

  const status = invitationErrorStatus(error);
  if (status === 401) {
    return "Necesitás iniciar sesión para continuar. Volvé al paso anterior e intentá nuevamente.";
  }
  if (status === 403) {
    return "No tenés permisos para reclamar esta concesionaria.";
  }
  if (status === 409) {
    if (invitationErrorIsSoftDeletedAccount(error)) {
      return "Este email está asociado a una cuenta desactivada. Si creés que es un error, escribinos a soporte.";
    }
    return "Ya existe una cuenta con ese email. Iniciá sesión e intentá nuevamente.";
  }
  if (status === 400) {
    return "Revisá los datos ingresados e intentá nuevamente.";
  }
  // 5xx / red / desconocido → genérico (patrón transfer-errors.ts).
  return "No se pudo completar el trámite. Intentá nuevamente.";
}

/**
 * Mensaje de UI para el login del wizard (paso 1 con requiresRegister=false).
 * El login usa POST /auth/login existente: 401 credenciales, 429 throttle.
 */
export function resolveWizardLoginErrorMessage(error: unknown): string {
  const status = invitationErrorStatus(error);
  if (status === 401) return "Email o contraseña incorrectos.";
  if (status === 429) return "Demasiados intentos. Intentá más tarde.";
  return "No se pudo iniciar sesión. Intentá nuevamente.";
}

// ---------------------------------------------------------------------------
// POST /users/wizard/claim — resolución de errores del wizard de usuario de
// plataforma (D-106). El claim SIEMPRE exige firstName/lastName/password
// (el backend produce 400 VALIDATION_ERROR si faltan) y rechaza con 409
// CONFLICT: cuenta soft-deleted (D-S3), cuenta activa, cuenta suspendida.
// ---------------------------------------------------------------------------

/**
 * Mensaje de UI para el claim de usuario de plataforma
 * (POST /users/wizard/claim). Los estados terminales de la invitación
 * (INVITATION_*) los debe transicionar el caller a la pantalla de error; acá
 * se devuelve el copy correspondiente. Para el resto se mapea por status/code.
 */
export function resolveUserWizardClaimErrorMessage(error: unknown): string {
  const kind = invitationErrorKind(error);
  if (kind === "invalid") return INVITATION_KIND_BODIES.invalid;
  if (kind === "expired") return INVITATION_KIND_BODIES.expired;
  if (kind === "used") return INVITATION_KIND_BODIES.used;
  if (kind === "cancelled") return INVITATION_KIND_BODIES.cancelled;

  const status = invitationErrorStatus(error);
  const code = invitationErrorCode(error);

  if (status === 409 || code === "CONFLICT") {
    // D-S3: cuenta soft-deleted (mismo code CONFLICT que el resto; solo el
    // mensaje distingue la variante — matcher por "desactivad").
    if (invitationErrorIsSoftDeletedAccount(error)) {
      return "Este email está asociado a una cuenta desactivada. Si creés que es un error, escribinos a soporte.";
    }
    const message = ((error as InvitationApiError)?.message ?? "").toLowerCase();
    if (message.includes("activa")) {
      return "Ya existe una cuenta activa con ese email. Si te olvidaste la contraseña, usá la recuperación de cuenta.";
    }
    if (message.includes("suspend")) {
      return "La cuenta está suspendida. Contactá a un administrador de la plataforma.";
    }
    return "Ya existe una cuenta con ese email. Iniciá sesión e intentá nuevamente.";
  }
  if (status === 400 || code === "VALIDATION_ERROR") {
    return "Completá nombre, apellido y contraseña para activar tu cuenta.";
  }
  if (status === 401) {
    return "Necesitás iniciar sesión para continuar. Volvé e intentá nuevamente.";
  }
  if (status === 403) {
    return "No tenés permisos para reclamar esta invitación.";
  }
  // 5xx / red / desconocido → genérico (patrón transfer-errors.ts).
  return "No se pudo completar el trámite. Intentá nuevamente.";
}