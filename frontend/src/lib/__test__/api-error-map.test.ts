// @vitest-environment node
/**
 * Regression tests del error-mapping de ky 2.1.0.
 *
 * BUG original: ky 2.x consume el body HTTP al poblar `error.data`, por lo que
 * `error.response.json()` lanza "Body has already been read". Los mappers
 * (`toApiError` + los 8 bloques inline de auth) leían `response.json()` →
 * `message`/`code` llegaban undefined y toda la UI caía en fallbacks genéricos.
 *
 * Estrategia: instancia real de ky + `fetch` global stubbeado. El body se
 * consume exactamente como en producción (se verifica con `response.bodyUsed`),
 * así que el mapper solo puede pasar si lee `error.data`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("error mapping — ky 2.1.0 (error.data, body consumido)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("400 JSON → { status, message, code } leídos de error.data (body ya consumido por ky)", async () => {
    const response = jsonResponse(400, {
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });
    fetchSpy.mockResolvedValue(response);

    const { vehicleApi } = await import("@/lib/api");

    await expect(vehicleApi.getVehicle("v1")).rejects.toMatchObject({
      status: 400,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });

    // El body lo consumió ky al poblar error.data → response.json() ya no
    // funcionaría. El mapper NO debe depender de él.
    expect(response.bodyUsed).toBe(true);
  });

  it("validación NestJS: message array se une con espacio", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(400, {
        message: [
          "alias must be longer than or equal to 3 characters",
          "alias must match /^[a-z0-9._-]+$/ regular expression",
        ],
      }),
    );

    const { usersApi } = await import("@/lib/api");

    await expect(usersApi.updateMyAlias("ab")).rejects.toMatchObject({
      status: 400,
      message:
        "alias must be longer than or equal to 3 characters alias must match /^[a-z0-9._-]+$/ regular expression",
    });
  });

  it("body text/plain → data string → { status, message }", async () => {
    fetchSpy.mockResolvedValue(textResponse(400, "Alias inválido"));

    const { usersApi } = await import("@/lib/api");

    await expect(usersApi.updateMyAlias("###")).rejects.toMatchObject({
      status: 400,
      message: "Alias inválido",
    });
  });

  it("data undefined (body vacío) → { status } sin crash", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    const { vehicleApi } = await import("@/lib/api");

    const error = await vehicleApi.listVehicles().catch((e: unknown) => e);
    expect(error).toEqual({ status: 500 });
  });

  it("login (auth) usa el mismo shape unificado vía .catch(toApiError)", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(401, {
        message: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      }),
    );

    const { authApi } = await import("@/lib/api");

    await expect(authApi.login("a@b.com", "x")).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials",
      code: "INVALID_CREDENTIALS",
    });

    // Endpoint público: sin refresh ni retry (un solo fetch).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("body JSON vacío / no parseable no rompe el mapper", async () => {
    fetchSpy.mockResolvedValue(
      new Response("not-json", {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { vehicleApi } = await import("@/lib/api");

    // ky no puede parsear → data undefined → solo { status }.
    await expect(vehicleApi.getVehicle("v1")).rejects.toEqual({ status: 400 });
  });
});
