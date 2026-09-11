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

// ── Active context headers (F-020 / RF-3) ──────────────────────────────────

/**
 * These tests verify the active-context header contract on the shared ky
 * instance WITHOUT modifying api.ts:
 * - null (PERSONAL) → no X-Context-Type / X-Context-Id headers (D-035).
 * - WORKSHOP selected → both headers injected on every non-auth request.
 * - `auth/*` requests NEVER carry context headers (RF-3) — a stale context on
 *   /auth/me breaks session bootstrap with 403 INVALID_CONTEXT (D-020).
 * - logout resets the context to null.
 */
describe("API client — active context headers (F-020 / RF-3)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{
    url: string;
    method: string;
    headers: Headers;
  }>;

  function extractRequestHeaders(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Headers {
    if (input instanceof Request) {
      return input.headers;
    }
    return new Headers(init?.headers);
  }

  beforeEach(() => {
    capturedRequests = [];
    vi.resetModules();

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({
        url,
        method,
        headers: new Headers(extractRequestHeaders(input, init)),
      });
      return makeResponse(200, { data: "ok" });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("PERSONAL (default) → NO context headers (D-035)", async () => {
    const { api } = await import("@/lib/api");
    await api.get("vehicles").json();

    expect(capturedRequests).toHaveLength(1);
    const headers = capturedRequests[0].headers;
    expect(headers.get("X-Context-Type")).toBeNull();
    expect(headers.get("X-Context-Id")).toBeNull();
  });

  it("WORKSHOP → injects X-Context-Type + X-Context-Id", async () => {
    const { selectWorkshop } = await import("@/lib/active-context");
    selectWorkshop("w1");

    const { api } = await import("@/lib/api");
    await api.get("care-episodes/lookup", { searchParams: { plate: "ABC123" } }).json();

    expect(capturedRequests).toHaveLength(1);
    const headers = capturedRequests[0].headers;
    expect(headers.get("X-Context-Type")).toBe("WORKSHOP");
    expect(headers.get("X-Context-Id")).toBe("w1");
  });

  it("auth/* NEVER carries context headers (RF-3)", async () => {
    const { selectWorkshop } = await import("@/lib/active-context");
    selectWorkshop("w1");

    const { authApi } = await import("@/lib/api");
    await authApi.me();
    await authApi.login("test@example.com", "password123");
    await authApi.logout().catch(() => {});

    // Every captured request must be header-free (me/login/logout are auth/*)
    const contextRoutes = capturedRequests.filter((r) =>
      r.url.includes("auth/"),
    );
    expect(contextRoutes.length).toBeGreaterThanOrEqual(3);
    for (const request of contextRoutes) {
      expect(request.headers.get("X-Context-Type")).toBeNull();
      expect(request.headers.get("X-Context-Id")).toBeNull();
    }
  });

  it("logout resets the active context to null (RF-3)", async () => {
    const { selectWorkshop, getActiveContext } = await import(
      "@/lib/active-context"
    );
    selectWorkshop("w1");
    expect(getActiveContext()).toEqual({ type: "WORKSHOP", workshopId: "w1" });

    const { authApi } = await import("@/lib/api");
    await authApi.logout();

    expect(getActiveContext()).toBeNull();
  });

  it("logout resets the context even when the API call fails (RF-3)", async () => {
    fetchSpy.mockImplementation(async () =>
      makeResponse(500, { message: "Internal Server Error" }),
    );

    const { selectWorkshop, getActiveContext } = await import(
      "@/lib/active-context"
    );
    selectWorkshop("w1");

    const { authApi } = await import("@/lib/api");
    await authApi.logout().catch(() => {});

    expect(getActiveContext()).toBeNull();
  });
});

// ── Vehicle API ──────────────────────────────────────────────────────────────

describe("API client — vehicleApi", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let capturedRequests: Array<{ url: string; method: string }>;

  const emptyMeta = { total: 0, page: 1, limit: 20, totalPages: 0 };

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

  it("listVehicles sends q as a search param when provided (F-012 D-044)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, { data: [], meta: emptyMeta });
    });

    const { vehicleApi } = await import("@/lib/api");
    await vehicleApi.listVehicles({ page: 1, limit: 20, q: "SMK" });

    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles"),
    );
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].url).toContain("q=SMK");
  });

  it("listVehicles does NOT include q when it is empty (F-012)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, { data: [], meta: emptyMeta });
    });

    const { vehicleApi } = await import("@/lib/api");
    await vehicleApi.listVehicles({ page: 1, limit: 20, q: "" });

    const vehicleCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles"),
    );
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].url).toContain("page=1");
    expect(vehicleCalls[0].url).not.toContain("q=");
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

  // ── F-013: Photos ────────────────────────────────────────────────────────

  it("listPhotos sends ?signed=true and parses the photo array (F-013)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, [
        {
          id: "p1",
          vehicleId: "v1",
          key: "vehicles/v1/photos/p1.webp",
          caption: null,
          isPrimary: true,
          createdAt: "2026-09-10T00:00:00.000Z",
          url: "https://signed.example/p1",
          expiresAt: "2026-09-10T01:00:00.000Z",
        },
      ]);
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.listPhotos("v1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
    expect(result[0].isPrimary).toBe(true);
    expect(result[0].url).toBe("https://signed.example/p1");

    const photoCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles/v1/photos"),
    );
    expect(photoCalls).toHaveLength(1);
    expect(photoCalls[0].method).toBe("GET");
    expect(photoCalls[0].url).toContain("signed=true");
  });

  it("uploadPhoto POSTs a multipart form with the file field (F-013)", async () => {
    let body: FormData | string | undefined;
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (input instanceof Request) {
        const contentType = input.headers.get("content-type") ?? "";
        body = contentType.includes("multipart/form-data")
          ? await input.clone().formData()
          : await input.clone().text();
      } else if (init?.body instanceof FormData) {
        body = init.body;
      } else {
        body = init?.body as string | undefined;
      }
      return makeResponse(200, {
        id: "p2",
        vehicleId: "v1",
        key: "vehicles/v1/photos/p2.webp",
        caption: null,
        isPrimary: false,
        createdAt: "2026-09-10T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });
    const result = await vehicleApi.uploadPhoto("v1", file);

    expect(result.id).toBe("p2");
    const photoCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles/v1/photos"),
    );
    expect(photoCalls).toHaveLength(1);
    expect(photoCalls[0].method).toBe("POST");

    expect(body).toBeDefined();
    if (body instanceof FormData) {
      expect(body.get("file")).toBeTruthy();
    } else {
      expect(String(body)).toContain('name="file"');
    }
  });

  it("setPrimaryPhoto PATCHes the primary route (F-013)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, {
        id: "p1",
        vehicleId: "v1",
        key: "k",
        caption: null,
        isPrimary: true,
        createdAt: "2026-09-10T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.setPrimaryPhoto("v1", "p1");

    expect(result.isPrimary).toBe(true);
    expect(capturedRequests[0].url).toContain("vehicles/v1/photos/p1/primary");
    expect(capturedRequests[0].method).toBe("PATCH");
  });

  it("deletePhoto DELETEs the photo route and resolves on empty body (F-013)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200);
    });

    const { vehicleApi } = await import("@/lib/api");
    await expect(vehicleApi.deletePhoto("v1", "p1")).resolves.toBeUndefined();

    expect(capturedRequests[0].url).toContain("vehicles/v1/photos/p1");
    expect(capturedRequests[0].method).toBe("DELETE");
  });

  it("maps uploadPhoto 403 to { status, message } (D-048)", async () => {
    fetchSpy.mockImplementation(async () =>
      makeResponse(403, { message: "Forbidden", code: "FORBIDDEN" }),
    );

    const { vehicleApi } = await import("@/lib/api");

    await expect(
      vehicleApi.uploadPhoto("v1", new File(["x"], "a.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ status: 403, message: "Forbidden", code: "FORBIDDEN" });
  });

  // ── F-013: Documents ─────────────────────────────────────────────────────

  it("listDocuments sends ?signed=true and parses document URLs (F-013)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, [
        {
          id: "d1",
          vehicleId: "v1",
          key: "vehicles/v1/documents/d1.pdf",
          name: "Cédula verde",
          documentType: "Cédula",
          expiresAt: null,
          createdAt: "2026-09-10T00:00:00.000Z",
          updatedAt: "2026-09-10T00:00:00.000Z",
          url: "https://signed.example/d1",
          urlExpiresAt: "2026-09-10T01:00:00.000Z",
        },
      ]);
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.listDocuments("v1");

    expect(result[0].name).toBe("Cédula verde");
    expect(result[0].url).toBe("https://signed.example/d1");
    expect(capturedRequests[0].url).toContain("vehicles/v1/documents");
    expect(capturedRequests[0].url).toContain("signed=true");
  });

  it("uploadDocument POSTs multipart with file + metadata fields (F-013)", async () => {
    let body: FormData | string | undefined;
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (input instanceof Request) {
        const contentType = input.headers.get("content-type") ?? "";
        body = contentType.includes("multipart/form-data")
          ? await input.clone().formData()
          : await input.clone().text();
      } else if (init?.body instanceof FormData) {
        body = init.body;
      } else {
        body = init?.body as string | undefined;
      }
      return makeResponse(200, {
        id: "d2",
        vehicleId: "v1",
        key: "vehicles/v1/documents/d2.pdf",
        name: "Seguro",
        documentType: "Seguro",
        expiresAt: null,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const file = new File(["dummy"], "seguro.pdf", { type: "application/pdf" });
    await vehicleApi.uploadDocument("v1", file, {
      name: "Seguro",
      documentType: "Seguro",
      expiresAt: "2027-01-01",
    });

    expect(capturedRequests[0].method).toBe("POST");
    expect(capturedRequests[0].url).toContain("vehicles/v1/documents");
    expect(body).toBeDefined();
    if (body instanceof FormData) {
      expect(body.get("file")).toBeTruthy();
      expect(body.get("name")).toBe("Seguro");
      expect(body.get("documentType")).toBe("Seguro");
      expect(body.get("expiresAt")).toBe("2027-01-01");
    } else {
      const text = String(body);
      expect(text).toContain('name="file"');
      expect(text).toContain('name="name"');
      expect(text).toContain("Seguro");
      expect(text).toContain('name="documentType"');
      expect(text).toContain("2027-01-01");
    }
  });

  it("updateDocument PATCHes metadata and parses the response (F-013)", async () => {
    let requestBody: unknown;
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (input instanceof Request) {
        requestBody = JSON.parse(await input.clone().text());
      } else if (init?.body) {
        requestBody = JSON.parse(String(init.body));
      }
      return makeResponse(200, {
        id: "d1",
        vehicleId: "v1",
        key: "k",
        name: "Seguro actualizado",
        documentType: "Seguro",
        expiresAt: null,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.updateDocument("v1", "d1", {
      name: "Seguro actualizado",
    });

    expect(result.name).toBe("Seguro actualizado");
    expect(capturedRequests[0].url).toContain("vehicles/v1/documents/d1");
    expect(capturedRequests[0].method).toBe("PATCH");
    expect(requestBody).toEqual({ name: "Seguro actualizado" });
  });

  it("deleteDocument DELETEs and resolves on empty body (F-013)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200);
    });

    const { vehicleApi } = await import("@/lib/api");
    await expect(vehicleApi.deleteDocument("v1", "d1")).resolves.toBeUndefined();

    expect(capturedRequests[0].url).toContain("vehicles/v1/documents/d1");
    expect(capturedRequests[0].method).toBe("DELETE");
  });

  // ── F-013: Mileage ───────────────────────────────────────────────────────

  it("recordMileage POSTs { mileage, source: 'owner', notes } (F-013 D-048)", async () => {
    let requestBody: unknown;
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      if (input instanceof Request) {
        requestBody = JSON.parse(await input.clone().text());
      } else if (init?.body) {
        requestBody = JSON.parse(String(init.body));
      }
      return makeResponse(201, {
        id: "m1",
        vehicleId: "v1",
        mileage: 25000,
        source: "owner",
        notes: "Cambio de aceite",
        recordedAt: "2026-09-11T00:00:00.000Z",
        createdAt: "2026-09-11T00:00:00.000Z",
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.recordMileage("v1", {
      mileage: 25000,
      source: "owner",
      notes: "Cambio de aceite",
    });

    expect(result.mileage).toBe(25000);
    expect(result.source).toBe("owner");
    expect(capturedRequests[0].url).toContain("vehicles/v1/mileage");
    expect(capturedRequests[0].method).toBe("POST");
    expect(requestBody).toEqual({
      mileage: 25000,
      source: "owner",
      notes: "Cambio de aceite",
    });
  });

  it("maps recordMileage 400 (non-monotonic) to { status, message } (RF-5)", async () => {
    fetchSpy.mockImplementation(async () =>
      makeResponse(400, {
        message: "Mileage must be greater than or equal to last recorded",
        code: "VALIDATION_ERROR",
      }),
    );

    const { vehicleApi } = await import("@/lib/api");

    await expect(
      vehicleApi.recordMileage("v1", { mileage: 1000, source: "owner" }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  // ── F-014: Vehicle history ───────────────────────────────────────────────

  it("getVehicleHistory GETs the history route and parses the 3-source response (F-014)", async () => {
    fetchSpy.mockImplementation(async (input, init) => {
      const { url, method } = extractFetchInfo(input, init);
      capturedRequests.push({ url, method });
      return makeResponse(200, {
        transfers: [
          {
            id: "t1",
            vehicleId: "v1",
            fromUser: { id: "u1", firstName: "Juan", lastName: "Perez" },
            toUser: { id: "u2", firstName: "Maria", lastName: "Lopez" },
            status: "completed",
            requestedAt: "2026-09-09T00:00:00.000Z",
            respondedAt: "2026-09-10T00:00:00.000Z",
            completedAt: "2026-09-10T00:00:00.000Z",
            expiresAt: null,
            notes: null,
            createdAt: "2026-09-09T00:00:00.000Z",
          },
        ],
        mileages: [],
        ownerships: [],
      });
    });

    const { vehicleApi } = await import("@/lib/api");
    const result = await vehicleApi.getVehicleHistory("v1");

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].fromUser.firstName).toBe("Juan");
    expect(result.mileages).toEqual([]);
    expect(result.ownerships).toEqual([]);

    const historyCalls = capturedRequests.filter((r) =>
      r.url.includes("vehicles/v1/history"),
    );
    expect(historyCalls).toHaveLength(1);
    expect(historyCalls[0].method).toBe("GET");
  });
});
