/**
 * Iteración 2-4 — Mapeo de errores del detalle/evidencia del episodio (S1/S4/S5).
 *
 * Mensajes en español (voseo, convención de transfer-errors.ts). El frontend
 * NUNCA expone el mensaje crudo del backend (PII / fugas de estado /
 * anti-enumeración SR#12): cada error se normaliza a copy de UI derivado de
 * los contratos REALES verificados:
 * - GET    /care-episodes/:id         → 404 (no revela existencia), 403 (solo
 *   taller del episodio o con acceso al vehículo) → backend traduce Forbidden
 *   a 404 en PERSONAL; 5xx genérico.
 * - POST   /care-episodes/:id/attachments → 401/403 (empleado / sin contexto /
 *   episodio owner), 404 (episodio ajeno), 409 (cerrado/verificado/not-open o
 *   techo 15), 413 (>5MB), 400/415 (MIME o phase faltante).
 * - DELETE /care-episodes/:id/attachments/:attachmentId → 400 (razón requerida),
 *   403 (sin derecho / owner→evidencia de taller), 404, 409 (frozen).
 */

export interface CareEpisodeApiError {
  status?: number;
  message?: string;
  code?: string;
}

/** Extrae el status HTTP de un error normalizado por `toApiError` (lib/api). */
export function careEpisodeErrorStatus(error: unknown): number | undefined {
  return (error as CareEpisodeApiError)?.status;
}

/** Extrae el mensaje crudo del backend (solo para clasificar internamente). */
export function careEpisodeErrorMessage(error: unknown): string | undefined {
  return (error as CareEpisodeApiError)?.message;
}

function isStatus(error: unknown, status: number): boolean {
  return careEpisodeErrorStatus(error) === status;
}

function lowerMessage(error: unknown): string {
  return (careEpisodeErrorMessage(error) ?? "").toLowerCase();
}

/** Copy genérico 5xx/red/desconocido. */
export const GENERIC_CARE_EPISODE_ERROR_MESSAGE =
  "No se pudo completar la acción. Intentalo nuevamente.";

/**
 * Mensaje de UI para la carga del detalle (GET /care-episodes/:id).
 * - 404 → "Servicio no encontrado" (el backend NO revela existencia en
 *   PERSONAL; el copy acompaña la pantalla terminal con Volver al vehículo).
 * - 403 → solo se alcanza en contextos sin acceso de lectura (WORKSHOP ajeno
 *   / falta de membresía); el backend traduce el resto a 404.
 * - resto (5xx/red) → genérico + Reintentar (refetch).
 */
export function resolveCareEpisodeDetailErrorMessage(error: unknown): string {
  if (isStatus(error, 404)) {
    return "Servicio no encontrado o ya no está disponible.";
  }
  if (isStatus(error, 403)) {
    return "No tenés permiso para ver este servicio.";
  }
  if (isStatus(error, 401)) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  return GENERIC_CARE_EPISODE_ERROR_MESSAGE;
}

/**
 * Mensaje de UI para subir evidencia (POST /:id/attachments). Distingue los
 * 409 del handler (estado congelado vs techo 15) por el texto crudo.
 */
export function resolveAttachmentUploadErrorMessage(error: unknown): string {
  if (isStatus(error, 401)) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  if (isStatus(error, 403)) {
    const text = lowerMessage(error);
    if (text.includes("propietario")) {
      return "Los servicios registrados por el propietario no admiten evidencia posterior.";
    }
    return "No tenés permiso para adjuntar evidencia a este servicio.";
  }
  if (isStatus(error, 404)) {
    return "El servicio o el vehículo ya no están disponibles.";
  }
  if (isStatus(error, 413)) {
    return "La imagen supera el tamaño máximo de 5MB.";
  }
  if (isStatus(error, 400) || isStatus(error, 415)) {
    return "El archivo no es una imagen válida (JPG, PNG, WebP o AVIF).";
  }
  if (isStatus(error, 409)) {
    const text = lowerMessage(error);
    if (text.includes("máximo de 15") || text.includes("maximo de 15")) {
      return "El servicio alcanzó el máximo de 15 imágenes de evidencia.";
    }
    return "El servicio está cerrado o verificado; no se pueden agregar evidencias.";
  }
  return GENERIC_CARE_EPISODE_ERROR_MESSAGE;
}

/**
 * Mensaje de UI para eliminar evidencia (DELETE /:id/attachments/:attachmentId).
 * - 400 → razón requerida (owner cleanup / workshop cleanup).
 * - 403 → sin derecho; el caso owner→evidencia de taller tiene copy específico.
 * - 409 → frozen (verified/cancelled) o doble void.
 */
export function resolveAttachmentDeleteErrorMessage(error: unknown): string {
  if (isStatus(error, 401)) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }
  if (isStatus(error, 400)) {
    return "Indicá el motivo por el que se elimina la imagen.";
  }
  if (isStatus(error, 403)) {
    const text = lowerMessage(error);
    if (text.includes("propietario")) {
      return "Como propietario no podés eliminar evidencias cargadas por el taller.";
    }
    return "No tenés permiso para eliminar esta imagen.";
  }
  if (isStatus(error, 404)) {
    return "La imagen o el servicio ya no existen.";
  }
  if (isStatus(error, 409)) {
    return "El servicio está cerrado o verificado; su evidencia no se puede modificar.";
  }
  return GENERIC_CARE_EPISODE_ERROR_MESSAGE;
}