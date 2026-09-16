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
      return "No podés transferir el vehículo a vos mismo. Ingresá el email de otra persona.";
    }
    // 400 genérico (anti-enumeración): no revelar si el email existe.
    return "No se pudo enviar la solicitud. Verificá que el destinatario tenga una cuenta e intentá nuevamente.";
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