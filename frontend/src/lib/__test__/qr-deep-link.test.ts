/**
 * Fase 3 / D-080 — Tests del parser del deep link del QR.
 */

import { describe, it, expect } from "vitest";
import { extractQrToken, qrDeepLink } from "@/lib/qr-deep-link";

describe("extractQrToken", () => {
  it("extrae el token de una URL absoluta de deep link", () => {
    expect(
      extractQrToken(
        "https://autentia.example/transfer/qr/abc123def456abc123def456aa",
      ),
    ).toBe("abc123def456abc123def456aa");
  });

  it("extrae el token de una ruta relativa", () => {
    expect(extractQrToken("/transfer/qr/TOKEN123")).toBe("TOKEN123");
  });

  it("acepta un token crudo (alfanumérico >= 16)", () => {
    expect(extractQrToken("abcdef1234567890abcdef")).toBe("abcdef1234567890abcdef");
  });

  it("rechaza texto sin token, corto o con caracteres no alfanuméricos", () => {
    expect(extractQrToken("")).toBeNull();
    expect(extractQrToken("hola")).toBeNull();
    expect(extractQrToken("/transfer/qr/ab!cd")).toBeNull();
    expect(extractQrToken("not a qr at all definitely")).toBeNull();
  });

  it("recorta espacios", () => {
    expect(extractQrToken("  /transfer/qr/ABC123  ")).toBe("ABC123");
  });
});

describe("qrDeepLink", () => {
  it("arma la ruta interna del deep link", () => {
    expect(qrDeepLink("ABC123")).toBe("/transfer/qr/ABC123");
  });
});