/**
 * Tests de `parseTransferRecipient` (Fase 4 — transferencia por email o alias).
 *
 * Helper puro: normaliza el input libre del usuario a `TransferRecipient`.
 * - email → `{ type: "email", value }`
 * - alias (`@juan` o `juan`) → `{ type: "alias", value: "juan" }` (sin "@",
 *   lowercase, patrón 3-30 `[a-z0-9._-]`).
 * Los errores son `TransferRecipientError` con copy de UI listo para mostrar.
 */
import { describe, it, expect } from "vitest";
import {
  parseTransferRecipient,
  TransferRecipientError,
  TRANSFER_RECIPIENT_ALIAS_MESSAGE,
  TRANSFER_RECIPIENT_EMAIL_MESSAGE,
  TRANSFER_RECIPIENT_EMPTY_MESSAGE,
} from "@/lib/transfer-recipient";

describe("parseTransferRecipient — email", () => {
  it("email válido → { type: 'email', value } (trim aplicado)", () => {
    expect(parseTransferRecipient("  ana@test.com  ")).toEqual({
      type: "email",
      value: "ana@test.com",
    });
  });

  it("email inválido (con @ pero sin TLD) → error de email", () => {
    expect(() => parseTransferRecipient("juan@ejemplo")).toThrow(
      TRANSFER_RECIPIENT_EMAIL_MESSAGE,
    );
  });

  it("email inválido ('juan@') → error de email", () => {
    expect(() => parseTransferRecipient("juan@")).toThrow(
      TRANSFER_RECIPIENT_EMAIL_MESSAGE,
    );
  });
});

describe("parseTransferRecipient — alias", () => {
  it("'@juan' → alias sin '@'", () => {
    expect(parseTransferRecipient("@juan")).toEqual({
      type: "alias",
      value: "juan",
    });
  });

  it("sin '@' se interpreta como alias", () => {
    expect(parseTransferRecipient("juan.perez_2026")).toEqual({
      type: "alias",
      value: "juan.perez_2026",
    });
  });

  it("normaliza a lowercase y recorta espacios", () => {
    expect(parseTransferRecipient("  @JuanPerez  ")).toEqual({
      type: "alias",
      value: "juanperez",
    });
  });

  it("alias demasiado corto ('ab' / '@ab') → error de alias", () => {
    expect(() => parseTransferRecipient("ab")).toThrow(
      TRANSFER_RECIPIENT_ALIAS_MESSAGE,
    );
    expect(() => parseTransferRecipient("@ab")).toThrow(
      TRANSFER_RECIPIENT_ALIAS_MESSAGE,
    );
  });

  it("alias con caracteres inválidos (espacios / símbolos) → error de alias", () => {
    expect(() => parseTransferRecipient("juan perez")).toThrow(
      TRANSFER_RECIPIENT_ALIAS_MESSAGE,
    );
    expect(() => parseTransferRecipient("@juan!")).toThrow(
      TRANSFER_RECIPIENT_ALIAS_MESSAGE,
    );
  });

  it("'@' solo → error de alias", () => {
    expect(() => parseTransferRecipient("@")).toThrow(
      TRANSFER_RECIPIENT_ALIAS_MESSAGE,
    );
  });
});

describe("parseTransferRecipient — vacío y error tipado", () => {
  it("vacío / solo espacios → mensaje de campo requerido", () => {
    expect(() => parseTransferRecipient("")).toThrow(
      TRANSFER_RECIPIENT_EMPTY_MESSAGE,
    );
    expect(() => parseTransferRecipient("   ")).toThrow(
      TRANSFER_RECIPIENT_EMPTY_MESSAGE,
    );
  });

  it("lanza TransferRecipientError (permite al schema mostrar el mensaje)", () => {
    try {
      parseTransferRecipient("@ab");
      throw new Error("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(TransferRecipientError);
      expect((error as TransferRecipientError).message).toBe(
        TRANSFER_RECIPIENT_ALIAS_MESSAGE,
      );
    }
  });
});
