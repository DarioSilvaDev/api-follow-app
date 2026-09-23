/**
 * Iteración 2-4 — Hint de UI para eliminar evidencia (S5).
 *
 * IMPORTANTE: esto es SOLO orientación de UI (visibilidad de botones,
 * selector de razón obligatorio). La autorización real vive en el backend
 * (RemoveCareEpisodeAttachmentHandler — GATES 0-2) y NUNCA se reemplaza por
 * la UI (AGENTS.md §22 / frontend-tech-lead §13).
 *
 * Contexto derivado de la sesión + contexto activo + detalle del episodio:
 * - `currentUserId`     → user.id (PERSONAL) o null en WORKSHOP (la identidad
 *   del attach es memberId; el dueño se resuelve por ownership del vehículo).
 * - `activeWorkshopId`  → taller del contexto activo (null = PERSONAL).
 * - `isVehicleOwner`    → ownership activa del usuario sobre el vehículo.
 * - `episodeWorkshopId` → workshopId del episodio (detalle).
 */
export interface CareEpisodePermissionContext {
  currentUserId: string | null;
  activeWorkshopId: string | null;
  isVehicleOwner: boolean;
  episodeWorkshopId: string | null;
}

/**
 * ¿Mostrar el botón de eliminación? Caminos que el backend autoriza (S5):
 * - taller del episodio (contexto WORKSHOP == workshopId del episodio);
 * - propietario vigente (puede intentar; el backend distingue uploader-self,
 *   current_owner y 403 para evidencia del taller);
 * - super_admin (sin UI especial — el backend lo resuelve por rol).
 */
export function canRemoveAttachment(
  ctx: CareEpisodePermissionContext,
): boolean {
  if (
    ctx.episodeWorkshopId !== null &&
    ctx.activeWorkshopId === ctx.episodeWorkshopId
  ) {
    return true;
  }
  if (ctx.isVehicleOwner) {
    return true;
  }
  return false;
}

/**
 * ¿La eliminación exige selector de motivo obligatorio? Espejo del audit path
 * `current_owner` del backend (S5 — 400 "removedReason es requerido").
 *
 * Regla de UI: el propietario actuando FUERA del contexto del taller del
 * episodio siempre ve el selector (el backend puede resolver a
 * uploader-self — sin razón — pero la UI no puede distinguirlo de forma
 * confiable; mandar la razón nunca rompe el path existente).
 */
export function removalReasonRequired(
  ctx: CareEpisodePermissionContext,
): boolean {
  if (!canRemoveAttachment(ctx)) {
    return false;
  }
  if (ctx.episodeWorkshopId !== null && ctx.activeWorkshopId === ctx.episodeWorkshopId) {
    // Miembro del taller del episodio: self-removal / cleanup no exige razón.
    return false;
  }
  return ctx.isVehicleOwner;
}

/** Tooltip nativo (title) para actores NO autorizados a eliminar. */
export const REMOVAL_UNAUTHORIZED_TOOLTIP =
  "Solo el taller del servicio o el propietario pueden eliminar evidencia.";

/** Labels del selector de motivo (S5 — labels UX aprobados). */
export const REMOVAL_REASON_LABELS: Record<
  "duplicada" | "sin_valor" | "privacidad" | "otro",
  string
> = {
  duplicada: "Imagen duplicada",
  sin_valor: "Sin valor documental",
  privacidad: "Privacidad",
  otro: "Otro",
};

export type RemovalReasonOptions = keyof typeof REMOVAL_REASON_LABELS;