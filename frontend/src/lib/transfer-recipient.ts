import { z } from "zod";
import type { TransferRecipient } from "@/types/vehicle";

/**
 * Fase 4 — parseo del destinatario de una transferencia por email o alias.
 *
 * El input del usuario es un único campo libre:
 * - `titular@ejemplo.com` → `{ type: "email", value }`.
 * - `@juan` o `juan` → `{ type: "alias", value: "juan" }` (sin "@", lowercase).
 *
 * Helper puro (sin React ni red) para poder testearlo aislado y reutilizarlo
 * tanto en el schema zod del formulario como en el submit.
 *
 * Los mensajes de error son copy de UI (voseo) y se lanzan vía
 * `TransferRecipientError` para que el schema los muestre tal cual.
 */

/** Mismo patrón que el alta/cambio de alias (D-077/D-091). */
export const TRANSFER_ALIAS_PATTERN = /^[a-z0-9._-]{3,30}$/;

export const TRANSFER_RECIPIENT_EMPTY_MESSAGE =
  "Ingresá el email o el @alias del destinatario.";
export const TRANSFER_RECIPIENT_EMAIL_MESSAGE = "Ingresá un email válido.";
export const TRANSFER_RECIPIENT_ALIAS_MESSAGE =
  "El alias debe tener entre 3 y 30 caracteres y solo puede contener letras, números, puntos, guiones y guiones bajos.";

export class TransferRecipientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferRecipientError";
  }
}

const emailSchema = z.email();

function parseAlias(rawAlias: string): TransferRecipient {
  const value = rawAlias.trim().toLowerCase();
  if (!TRANSFER_ALIAS_PATTERN.test(value)) {
    throw new TransferRecipientError(TRANSFER_RECIPIENT_ALIAS_MESSAGE);
  }
  return { type: "alias", value };
}

/**
 * Normaliza el input crudo del usuario a un `TransferRecipient`.
 * @throws {TransferRecipientError} con mensaje de UI listo para mostrar.
 */
export function parseTransferRecipient(raw: string): TransferRecipient {
  const value = raw.trim();

  if (!value) {
    throw new TransferRecipientError(TRANSFER_RECIPIENT_EMPTY_MESSAGE);
  }

  // "@alias" explícito.
  if (value.startsWith("@")) {
    return parseAlias(value.slice(1));
  }

  // Contiene "@" (no inicial) → se interpreta como email.
  if (value.includes("@")) {
    if (!emailSchema.safeParse(value).success) {
      throw new TransferRecipientError(TRANSFER_RECIPIENT_EMAIL_MESSAGE);
    }
    return { type: "email", value };
  }

  // Sin "@" → alias.
  return parseAlias(value);
}
