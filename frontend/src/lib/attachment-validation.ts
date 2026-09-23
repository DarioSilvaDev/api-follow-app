/**
 * Iteración 2-4 — Validación cliente de la evidencia del episodio (S4/S6).
 *
 * Espejo de los límites reales del backend (multer + handler, src/modules/
 * care-episodes): JPG/PNG/WebP/AVIF por MIME, ≤ 5MB por archivo, lote ≤ 5,
 * total de activos ≤ 15 por episodio. La validación UX es la primera línea
 * (feedback inmediato); el backend sigue siendo la autoridad final.
 *
 * Función pura → testable sin DOM.
 */
import { CARE_EPISODE_ATTACHMENT_LIMITS } from "@/types/care-episode";

/** MIME types aceptados por `evidenceFileFilter` del backend (S4). */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AttachmentValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

/** Copy de validación (español/voseo, convención repo). */
export const ATTACHMENT_VALIDATION_MESSAGES = {
  type: "Solo se admiten imágenes JPG, PNG, WebP o AVIF.",
  size: "Cada imagen debe pesar menos de 5MB.",
  batch: "Podés adjuntar hasta 5 imágenes por vez.",
  total:
    "El servicio admite hasta 15 imágenes de evidencia en total. Eliminá alguna antes de subir más.",
} as const;

function isAllowedMimeType(type: string): boolean {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Valida un lote de archivos contra los límites del backend.
 *
 * @param files         Archivos seleccionados (File[]).
 * @param existingCount Adjuntos activos actuales del episodio (para el tope 15).
 *
 * Orden de chequeo (primera falla gana): tipo → tamaño → lote → total.
 * En `ok: true` devuelve el mismo array (no clona).
 */
export function validateAttachmentFiles(
  files: File[],
  existingCount = 0,
): AttachmentValidationResult {
  for (const file of files) {
    if (!isAllowedMimeType(file.type)) {
      return { ok: false, message: ATTACHMENT_VALIDATION_MESSAGES.type };
    }
    if (file.size > CARE_EPISODE_ATTACHMENT_LIMITS.maxFileSizeBytes) {
      return { ok: false, message: ATTACHMENT_VALIDATION_MESSAGES.size };
    }
  }

  if (files.length > CARE_EPISODE_ATTACHMENT_LIMITS.maxBatch) {
    return { ok: false, message: ATTACHMENT_VALIDATION_MESSAGES.batch };
  }

  if (
    existingCount + files.length > CARE_EPISODE_ATTACHMENT_LIMITS.maxTotal
  ) {
    return { ok: false, message: ATTACHMENT_VALIDATION_MESSAGES.total };
  }

  return { ok: true, files };
}