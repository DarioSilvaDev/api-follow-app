/**
 * Tests for the API client refresh interceptor behavior.
 *
 * These tests verify the critical auth contract:
 * - 401 triggers one POST /auth/refresh then retries the original request
 * - Public auth endpoints skip refresh on 401
 * - No infinite loops (max one retry)
 *
 * Strategy: Mock globalThis.fetch to control ky's HTTP behavior.
 * ky is built on fetch; by intercepting at the fetch level we can verify
 * the full retry/refresh flow without modifying api.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Extract URL and method from fetch arguments.
 * ky may pass either (url, init) or (Request, init).
 */
function extractFetchInfo(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string; method: string } {
  let url: string;
  let method: string;

  if (input instanceof Request) {
    url = input.url;
    method = input.method;
  } else if (input instanceof URL) {
    url = input.href;
    method = init?.method ?? "GET";
  } else {
    url = input;
    method = init?.method ?? "GET";
  }

  return { url, method };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("API client — refresh interceptor", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; method: string }>;

  beforeEach(() => {
    capturedRequests = [];
    vi.resetModules();

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });

      // Simulate: auth/refresh always returns 200
      if (url.includes("auth/refresh")) {
        return makeResponse(200, { message: "ok" });
      }

      // Everything else returns 200 (overridden per test via mockImplementation)
      return makeResponse(200, { data: "ok" });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * Core contract: a 401 on a protected endpoint triggers one
   * POST /auth/refresh, then retries the original request (now succeeding).
   */
  it("retries once after refresh on 401 from a protected endpoint", async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, method } = extractFetchInfo(input, init);
        capturedRequests.push({ url, method });

        if (url.includes("auth/refresh")) {
          return makeResponse(200, { message: "ok" });
        }

        callCount++;
        if (callCount === 1) {
          // First call to /vehicles → 401
          return makeResponse(401, { message: "Unauthorized" });
        }
        // Retry after refresh → 200
        return makeResponse(200, { data: [{ id: "v1" }] });
      },
    );

    const { api } = await import("@/lib/api");
    const result = await api.get("vehicles").json();

    expect(result).toEqual({ data: [{ id: "v1" }] });

    // Verify refresh was called exactly once with POST
    const refreshCalls = capturedRequests.filter((r) =>
      r.url.includes("auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0].method).toBe("POST");

    // Verify original endpoint was called twice (401 + retry)
    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles"),
    );
    expect(vehicleCalls).toHaveLength(2);
  });

  /**
   * Public auth endpoints must NOT trigger refresh on 401.
   * The 401 should propagate directly to the caller.
   */
  it("does NOT refresh on 401 from public auth endpoints", async () => {
    fetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, method } = extractFetchInfo(input, init);
        capturedRequests.push({ url, method });

        // auth/login returns 401
        if (url.includes("auth/login")) {
          return makeResponse(401, { message: "Invalid credentials" });
        }
        return makeResponse(200);
      },
    );

    const { authApi } = await import("@/lib/api");

    await expect(
      authApi.login("wrong@example.com", "badpassword"),
    ).rejects.toMatchObject({ status: 401 });

    // No refresh should have been called
    const refreshCalls = capturedRequests.filter((r) =>
      r.url.includes("auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(0);
  });

  /**
   * Verify that each concurrent 401 retries exactly once (no infinite loop).
   * Both requests should succeed after refresh; each request triggers at
   * most one refresh call (coordination may share or duplicate depending
   * on timing, but the critical contract is: no infinite loop).
   */
  it("no infinite loop — concurrent 401s each retry at most once", async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, method } = extractFetchInfo(input, init);
        capturedRequests.push({ url, method });

        if (url.includes("auth/refresh")) {
          return makeResponse(200, { message: "ok" });
        }

        callCount++;
        if (callCount <= 2) {
          // Both initial calls return 401
          return makeResponse(401, { message: "Unauthorized" });
        }
        // Retries succeed
        return makeResponse(200, { data: "ok" });
      },
    );

    const { api } = await import("@/lib/api");

    // Fire two concurrent requests
    const [r1, r2] = await Promise.all([
      api.get("workshops").json().catch(() => null),
      api.get("profile").json().catch(() => null),
    ]);

    // Both should succeed after refresh
    expect(r1).toEqual({ data: "ok" });
    expect(r2).toEqual({ data: "ok" });

    // Each request retried at most once: max 2 refresh calls (1 per request)
    // but NOT 3+ (which would indicate an infinite loop)
    const refreshCalls = capturedRequests.filter((r) =>
      r.url.includes("auth/refresh"),
    );
    expect(refreshCalls.length).toBeLessThanOrEqual(2);
    expect(refreshCalls.length).toBeGreaterThanOrEqual(1);

    // All refresh calls are POST
    for (const call of refreshCalls) {
      expect(call.method).toBe("POST");
    }

    // Original endpoints called at most 4 times (2 initial + 2 retries)
    const nonRefreshCalls = capturedRequests.filter(
      (r) => !r.url.includes("auth/refresh"),
    );
    expect(nonRefreshCalls.length).toBeLessThanOrEqual(4);
  });
});

// ── Vehicle API ──────────────────────────────────────────────────────────────

describe("API client — vehicleApi", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; method: string }>;

  beforeEach(() => {
    capturedRequests = [];
    vi.resetModules();

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, { data: [] });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("listVehicles parses the paginated response", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (url.includes("auth/refresh")) {
        return makeResponse(200, { message: "ok" });
      }
      return makeResponse(200, {
        data: [{ id: "v1", licensePlate: "ABC123" }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.listVehicles({ page: 1, limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.data[0].licensePlate).toBe("ABC123");

    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles"),
    );
    expect(vehicleCalls).toHaveLength(1);
  });

  it("maps registerVehicle 409 to { status, message, code } without refresh", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (url.includes("auth/refresh")) {
        return makeResponse(200, { message: "ok" });
      }
      return makeResponse(409, {
        message: "Vehicle with plate 'ABC123' already exists",
        code: "VEHICLE_PLATE_EXISTS",
      });
    });

    const { vehicleApi } = await import("@/lib/api");

    await expect(
      vehicleApi.registerVehicle({ licensePlate: "ABC123" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Vehicle with plate 'ABC123' already exists",
      code: "VEHICLE_PLATE_EXISTS",
    });

    // 409 is not in the retry statusCodes → refresh must NOT be triggered
    const refreshCalls = capturedRequests.filter((r) =>
      r.url.includes("auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(0);
  });

  it("listModels sends brandId as a query param", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, [{ id: "m1", brandId: "b1", name: "Corolla" }]);
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.listModels("b1");

    expect(result[0].name).toBe("Corolla");
    expect(capturedRequests[0].url).toContain("vehicle-models");
    expect(capturedRequests[0].url).toContain("brandId=b1");
  });

  it("getVehicle parses the denormalized detail response (F-011)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, {
        id: "v1",
        licensePlate: "ABC123",
        brand: "Toyota",
        model: "Corolla",
        version: "XEI",
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.getVehicle("v1");

    expect(result.licensePlate).toBe("ABC123");
    expect(result.model).toBe("Corolla");

    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles/v1"),
    );
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].method).toBe("GET");
  });

  it("maps getVehicle 404 to { status, message } (F-011 RF-6)", async () => {
    fetchSpy.mockImplementation(async () =>
      makeResponse(404, {
        message: "Vehicle not found",
        code: "VEHICLE_NOT_FOUND",
      }),
    );

    const { vehicleApi } = await import("@/lib/api");

    await expect(vehicleApi.getVehicle("nope")).rejects.toMatchObject({
      status: 404,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });
  });

  it("updateVehicle PATCHes a partial body and parses the response (F-011 D-040)", async () => {
    let requestBody: unknown;
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      // ky sends the JSON body inside the Request object (first argument).
      if (input instanceof Request) {
        requestBody = JSON.parse(await input.clone().text());
      } else if (init?.body) {
        requestBody = JSON.parse(String(init.body));
      }
      return makeResponse(200, {
        id: "v1",
        licensePlate: "ABC999",
        color: "Verde",
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.updateVehicle("v1", {
      licensePlate: "ABC999",
      color: "Verde",
    });

    expect(result.licensePlate).toBe("ABC999");
    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles/v1"),
    );
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].method).toBe("PATCH");
    expect(requestBody).toEqual({ licensePlate: "ABC999", color: "Verde" });
  });

  it("maps updateVehicle 409 to { status, message, code } without refresh (F-011 D-041)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (url.includes("auth/refresh")) {
        return makeResponse(200, { message: "ok" });
      }
      return makeResponse(409, {
        message: "Ya existe un vehículo registrado con esa placa",
        code: "VEHICLE_PLATE_EXISTS",
      });
    });

    const { vehicleApi } = await import("@/lib/api");

    await expect(
      vehicleApi.updateVehicle("v1", { licensePlate: "ABC999" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Ya existe un vehículo registrado con esa placa",
      code: "VEHICLE_PLATE_EXISTS",
    });

    // 409 is not in the retry statusCodes → refresh must NOT be triggered
    const refreshCalls = capturedRequests.filter((r) =>
      r.url.includes("auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(0);
  });
});
