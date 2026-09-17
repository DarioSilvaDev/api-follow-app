/**
 * Fase 1 / D-078 — Mapeo de errores del flujo de transferencias.
 *
 * Mensajes en español (voseo, validados por UX — spec §5.3) derivados de los
 * contratos REALES del backend verificado (src/modules/vehicles):
 * - POST vehicles/:id/transfer → 400 genérico anti-enumeración, 400 self,
 *   403 not owner, 404 vehicle.
 * - PATCH transfers/:id/accept|reject|cancel → 400 not pending / expired,
 *   403 no-dirigida / solo-requester, 404 transfer.
 *
 * El frontend NUNCA expone el mensaje crudo del backend (PII / fugas de
 * estado / anti-enumeración SR#12): cada error se normaliza a copy de UI.
 */

export type TransferAction = "accept" | "reject" | "cancel";

export interface TransferApiError {
  status?: number;
  message?: string;
  code?: string;
}

/** Extrae el status HTTP de un error normalizado por `toApiError` (lib/api). */
export function transferErrorStatus(error: unknown): number | undefined {
  return (error as TransferApiError)?.status;
}

/** Extrae el mensaje crudo del backend (solo para clasificar internamente). */
export function transferErrorMessage(error: unknown): string | undefined {
  return (error as TransferApiError)?.message;
}

function isStatus(error: unknown, status: number): boolean {
  return transferErrorStatus(error) === status;
}

function lowerMessage(error: unknown): string {
  return (transferErrorMessage(error) ?? "").toLowerCase();
}

/**
 * RF-6 / D-078: ya existe una transferencia pendiente para el vehículo.
 * El backend responde el mismo 400 que cualquier receptor inválido por
 * anti-enumeración, pero el flujo de UI lo distingue para sugerir el panel.
 */
export function isPendingTransferError(error: unknown): boolean {
  return (
    isStatus(error, 400) &&
    lowerMessage(error).includes("pending transfer for this vehicle")
  );
}

/** Copy de UI para el error 400 "pending" (RF-6): incluye link al panel. */
export const PENDING_TRANSFER_MESSAGE =
  "Ya existe una solicitud pendiente para este vehículo.";

/**
 * Fase 4 / §5.3 — 400 genérico de destinatario inexistente. MISMO copy para
 * email y alias (anti-enumeración SR#12: nunca revelar por qué canal falló).
 */
export const TRANSFER_RECIPIENT_NOT_FOUND_MESSAGE =
  "No se pudo enviar la solicitud. Verificá que el destinatario tenga una cuenta e intentá nuevamente.";

/** Fase 4 / §5.3 — 400 self (el destinatario es el propio usuario). */
export const TRANSFER_SELF_MESSAGE =
  "No podés transferir el vehículo a vos mismo. Ingresá el email o alias de otra persona.";

/** Copy de UI si el error es "400 pending" (null = no es ese error). */
export function pendingTransferMessage(error: unknown): string | null {
  return isPendingTransferError(error) ? PENDING_TRANSFER_MESSAGE : null;
}

/** Mensaje genérico de §5.3 (5xx / 409 / desconocido). */
export const GENERIC_TRANSFER_ERROR_MESSAGE =
  "No se pudo completar la acción. Intentá nuevamente.";

/**
 * Mensaje de UI para el alta de transferencia (POST vehicles/:id/transfer).
 * Nunca muestra el mensaje crudo del backend. §5.3.
 */
export function createTransferErrorMessage(error: unknown): string {
  if (isPendingTransferError(error)) {
    return PENDING_TRANSFER_MESSAGE;
  }
  if (isStatus(error, 400)) {
    const text = lowerMessage(error);
    if (text.includes("yourself")) {
      return TRANSFER_SELF_MESSAGE;
    }
    // 400 genérico (anti-enumeración): mismo copy para email o alias
    // inexistente — nunca revelar si el destinatario existe ni por qué canal.
    return TRANSFER_RECIPIENT_NOT_FOUND_MESSAGE;
  }
  if (isStatus(error, 403)) {
    return "Ya no sos el titular de este vehículo. La transferencia no se pudo realizar.";
  }
  if (isStatus(error, 404)) {
    return "El vehículo ya no existe o fue eliminado.";
  }
  // 409 (defensivo — §5.3) y cualquier otro (5xx, red) → genérico.
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}

/**
 * Mensaje de UI para las acciones del panel (accept/reject/cancel). Normaliza
 * los contratos del backend verificados (messages en inglés) a copy español
 * sin exponer PII ni el texto crudo. §5.3.
 */
export function resolveTransferErrorMessage(
  error: unknown,
  action: TransferAction,
): string {
  if (isStatus(error, 404)) {
    return "Esta solicitud ya no existe. La lista se actualizó.";
  }
  if (isStatus(error, 400)) {
    const text = lowerMessage(error);
    if (text.includes("expired")) {
      // La expiración lazy solo la dispara `accept` (§5.2 / D-088). Para
      // reject/cancel un hipotético "expired" cae en "ya no está pendiente".
      return action === "accept"
        ? "La solicitud venció y ya no puede aceptarse."
        : "Esta solicitud ya no está pendiente.";
    }
    // "Transfer is not pending" (carrera §6.6)
    return "Esta solicitud ya no está pendiente.";
  }
  if (isStatus(error, 403)) {
    return "No tenés permiso para realizar esta acción.";
  }
  // 409 (defensivo — §5.3) y cualquier otro (5xx, red) → genérico.
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Fase 3 — QR de transferencia (D-079..D-088). Copy en español/voseo derivado
// de los contratos REALES del backend (messages en español):
// - GET vehicles/transfer/qr/:token → 404 "QR inválido o expirado",
//   410 "Este QR ha sido revocado", 409 "Este QR ya fue utilizado".
// - POST .../accept → 400 "Debés confirmar la transferencia" /
//   "No podés aceptar tu propio QR", 409 coexistencia "pendiente".
// - POST vehicles/:id/qr → 403 not owner, 409 "Ya existe un QR...".
// - DELETE vehicles/:id/qr → idempotente.
// ---------------------------------------------------------------------------

export function resolveQrPreviewErrorMessage(error: unknown): string {
  if (isStatus(error, 404)) {
    return "El QR es inválido o ya expiró.";
  }
  if (isStatus(error, 410)) {
    return "Este QR fue revocado y ya no está vigente.";
  }
  if (isStatus(error, 409)) {
    return "Este QR ya fue utilizado.";
  }
  if (isStatus(error, 401) || isStatus(error, 403)) {
    return "Iniciá sesión para aceptar la transferencia.";
  }
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}

export function resolveQrAcceptErrorMessage(error: unknown): string {
  if (isStatus(error, 404)) {
    return "El QR es inválido o ya expiró.";
  }
  if (isStatus(error, 410)) {
    return "Este QR fue revocado y ya no está vigente.";
  }
  if (isStatus(error, 409)) {
    const text = lowerMessage(error);
    if (text.includes("pendiente")) {
      return "Ya existe una solicitud de transferencia pendiente para este vehículo.";
    }
    return "Este QR ya fue utilizado.";
  }
  if (isStatus(error, 400)) {
    const text = lowerMessage(error);
    if (text.includes("propio")) {
      return "No podés aceptar tu propio QR de transferencia.";
    }
    return "No se pudo completar la transferencia. Intentá nuevamente.";
  }
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}

export function resolveQrGenerateErrorMessage(error: unknown): string {
  if (isStatus(error, 409)) {
    const text = lowerMessage(error);
    if (text.includes("solicitud de transferencia pendiente")) {
      return PENDING_TRANSFER_MESSAGE;
    }
    return "Ya existe un QR de transferencia pendiente para este vehículo.";
  }
  if (isStatus(error, 403)) {
    return "Solo el titular del vehículo puede generar el QR.";
  }
  if (isStatus(error, 404)) {
    return "El vehículo ya no existe o fue eliminado.";
  }
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Fase 2 — Alias (D-077/D-091). Copy en español deriva de los contratos
// REALES del backend (messages en español):
// - PATCH /users/me/alias → 400 regex/validación, 409 cooldown
//   ("Solo podés cambiar tu alias cada 15 días..."), 409 transferencia
//   pendiente, 409 "El alias ya está en uso".
// ---------------------------------------------------------------------------

export const ALIAS_COOLDOWN_MESSAGE =
  "Solo podés cambiar tu alias cada 15 días.";

export function resolveAliasErrorMessage(error: unknown): string {
  if (isStatus(error, 409)) {
    const text = lowerMessage(error);
    if (text.includes("15 días") || text.includes("15 dias")) {
      return ALIAS_COOLDOWN_MESSAGE;
    }
    if (text.includes("transferencia pendiente")) {
      return "Tu alias no puede cambiarse mientras tengas una transferencia pendiente.";
    }
    if (text.includes("en uso")) {
      return "Ese alias ya está en uso. Elegí otro.";
    }
    return "No se pudo actualizar el alias. Intentá nuevamente.";
  }
  if (isStatus(error, 400)) {
    return "El alias debe tener entre 3 y 30 caracteres y solo puede contener letras, números, puntos, guiones y guiones bajos.";
  }
  return GENERIC_TRANSFER_ERROR_MESSAGE;
}