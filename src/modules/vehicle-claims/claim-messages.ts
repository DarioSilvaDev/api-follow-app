/**
 * Copy de los errores de la API pública de reclamo.
 *
 * Fuente de verdad: `docs/specs/vehicle-claim-copy.md` (P-2 aprobado).
 * El mensaje de verificación es ÚNICO a propósito (anti-enumeración, §6.6):
 * patente ajena, VIN incorrecto, rango incorrecto y factor faltante devuelven
 * exactamente el mismo texto.
 */

/** 404 para cualquier token que no exista (no distingue formato ni estado). */
export const CLAIM_LINK_INVALID_MESSAGE = 'El link no es válido.';

/** 400 único de verificación fallida (§1.6). No agregar detalle. */
export const CLAIM_VERIFY_FAILED_MESSAGE =
  'No pudimos verificar los datos del vehículo. Revisá la patente y los datos ingresados.';

/** 409 de lock temporal por intentos (§1.7). */
export const CLAIM_LOCKED_MESSAGE =
  'Demasiados intentos. Por seguridad, bloqueamos la verificación por 30 minutos. Podés volver a intentar más tarde o contactar al taller.';

/** 410 de link vencido (§1.11). */
export const CLAIM_EXPIRED_MESSAGE =
  'Este link ya no está vigente. Pedile al taller que te genere uno nuevo.';

/** 410 de link revocado (§1.11). */
export const CLAIM_REVOKED_MESSAGE =
  'El taller o Autentia revocó este link. Contactá al taller para solicitar uno nuevo.';

/** 409 de link ya consumido o bloqueado, sin datos del titular (§6.5). */
export const CLAIM_UNAVAILABLE_MESSAGE = 'El reclamo ya no está disponible.';

/** 409 del commit cuando el vehículo ya tiene titular (§1.11 claim_blocked). */
export const CLAIM_BLOCKED_MESSAGE =
  'El vehículo ya tiene un titular registrado. Si creés que es un error, contactá al taller.';

/**
 * 409 del alta de invite cuando el vehículo ya tiene titular activo o ya fue
 * reclamado (copy §2.6). El `reason` viaja en `errors.reason` porque el
 * envelope global (D-025) no admite campos de primer nivel.
 */
export const CLAIM_ACTIVE_OWNER_MESSAGE =
  'Este vehículo ya tiene titular; no se envió invitación.';

/** 404 de scoping del panel: invite inexistente o de otro taller (§2.14). */
export const CLAIM_NOT_FOUND_MESSAGE = 'No pudimos encontrar este reclamo.';

/** 409 del approve cuando el invite no tiene cuenta vinculada (T11). */
export const CLAIM_ACCOUNT_REQUIRED_MESSAGE =
  'Todavía no hay una cuenta vinculada a este reclamo.';

/**
 * 409 del revoke sobre `manual_review`: ese estado se cierra con `reject`
 * (T12), que emite `manual_review_rejected` y avisa al reclamante. Revocarlo
 * como `by_workshop` dejaría el rechazo sin notificación (§2.8 del copy).
 */
export const CLAIM_MANUAL_REVIEW_REJECT_MESSAGE =
  'Este reclamo está en revisión manual. Para rechazarlo, usá Rechazar.';
