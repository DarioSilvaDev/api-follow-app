import ky, { HTTPError, isHTTPError } from "ky";
import type { SessionUser } from "@/types/auth";
import type {
  RegisterVehicleInput,
  UpdateVehicleInput,
  Vehicle,
  VehicleBrand,
  VehicleDocument,
  VehicleHistoryResponse,
  VehicleListResponse,
  VehicleMileage,
  VehicleModel,
  VehiclePhoto,
  VehicleVersion,
} from "@/types/vehicle";

export { HTTPError, isHTTPError };

// ---------------------------------------------------------------------------
// Base API client — credentials: include for HttpOnly cookie auth (D-001)
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api",
  timeout: 10_000,
  credentials: "include",
  retry: { limit: 1, statusCodes: [401] },
  hooks: {
    beforeRetry: [
      async ({ error, retryCount }) => {
        // Only handle 401 on first retry — never on refresh itself
        if (
          retryCount !== 1 ||
          !isHTTPError(error) ||
          error.response.status !== 401
        ) {
          return ky.stop;
        }

        // Skip refresh for public auth endpoints
        try {
          const url = new URL(error.request.url);
          const path = url.pathname;
          const apiPrefix =
            process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
          const relativePath = path.replace(
            new URL(apiPrefix).pathname + "/",
            "",
          );
          const publicEndpoints = [
            "auth/login",
            "auth/refresh",
            "auth/logout",
            "auth/forgot-password",
            "auth/reset-password",
            "auth/register",
            "auth/verify-email",
          ];
          if (publicEndpoints.some((ep) => relativePath.startsWith(ep))) {
            return ky.stop;
          }
        } catch {
          // If URL parsing fails, allow refresh attempt
        }

        // Coordinate concurrent refreshes — only one refresh at a time
        if (isRefreshing && refreshPromise) {
          await refreshPromise;
          return; // Continue retry with updated cookies
        }

        isRefreshing = true;
        refreshPromise = api
          .post("auth/refresh")
          .then(() => {})
          .catch((refreshError: unknown) => {
            // Refresh failed → propagate error to stop retry
            throw refreshError;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });

        try {
          await refreshPromise;
        } catch {
          // Refresh failed → throw original 401 so ky stops and caller gets error
          throw error;
        }
        // Refresh succeeded → continue with retry (new cookies in browser jar)
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Shared error mapping — HTTPError → { status, message, code }
// Used so the UI can read API errors without importing ky internals.
// ---------------------------------------------------------------------------

async function toApiError(error: unknown): Promise<never> {
  if (isHTTPError(error)) {
    const status = error.response.status;
    let body: { message?: string; code?: string } = {};
    try {
      body = await error.response.json();
    } catch {
      // Response not JSON
    }
    throw { status, message: body.message, code: body.code };
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Auth API methods
// ---------------------------------------------------------------------------

export interface LoginResponse {
  /**
   * Login body `{ user }` per contract — but the frontend does NOT rely on it.
   * Session data is always loaded via GET /auth/me (spec: RF-2).
   */
  user: unknown;
}

export const authApi = {
  login: (email: string, password: string) =>
    api
      .post("auth/login", { json: { email, password } })
      .json<LoginResponse>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  logout: () =>
    api
      .post("auth/logout")
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  me: () =>
    api
      .get("auth/me")
      .json<SessionUser>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) =>
    api
      .post("auth/register", { json: data })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  verifyEmail: (token: string) =>
    api
      .get("auth/verify-email", { searchParams: { token } })
      .text()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON — might be plain text
            try {
              const text = await error.response.text();
              throw { status, message: text };
            } catch {
              // Already thrown or not parseable
            }
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  forgotPassword: (email: string) =>
    api
      .post("auth/forgot-password", { json: { email } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  resetPassword: (token: string, password: string) =>
    api
      .post("auth/reset-password", { json: { token, password } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post("auth/change-password", { json: { currentPassword, newPassword } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),
};

// ---------------------------------------------------------------------------
// Vehicle API methods
//
// D-035 (MVP): vehicle calls run in PERSONAL context — no X-Context-Type
// header is sent; the backend defaults to PERSONAL.
// ---------------------------------------------------------------------------

export interface VehicleApiError {
  status?: number;
  message?: string;
  code?: string;
}

export const vehicleApi = {
  listVehicles: ({
    page = 1,
    limit = 20,
    q,
  }: { page?: number; limit?: number; q?: string } = {}) =>
    api
      .get("vehicles", {
        searchParams: { page, limit, ...(q ? { q } : {}) },
      })
      .json<VehicleListResponse>()
      .catch(toApiError),

  registerVehicle: (input: RegisterVehicleInput) =>
    api
      .post("vehicles", { json: input })
      .json<Vehicle>()
      .catch(toApiError),

  /**
   * F-011: GET /api/vehicles/:id → VehicleResponseDto (denormalized).
   * Used to prefill the edit form (RF-5).
   */
  getVehicle: (id: string) =>
    api
      .get(`vehicles/${id}`)
      .json<Vehicle>()
      .catch(toApiError),

  /**
   * F-011: PATCH /api/vehicles/:id → VehicleResponseDto.
   * Partial body (D-040); responds 403 (non-owner) / 404 / 409 (duplicates).
   */
  updateVehicle: (id: string, input: UpdateVehicleInput) =>
    api
      .patch(`vehicles/${id}`, { json: input })
      .json<Vehicle>()
      .catch(toApiError),

  listBrands: () => api.get("vehicle-brands").json<VehicleBrand[]>().catch(toApiError),

  listModels: (brandId: string) =>
    api
      .get("vehicle-models", { searchParams: { brandId } })
      .json<VehicleModel[]>()
      .catch(toApiError),

  listVersions: (modelId: string) =>
    api
      .get("vehicle-versions", { searchParams: { modelId } })
      .json<VehicleVersion[]>()
      .catch(toApiError),

  // -----------------------------------------------------------------------
  // F-013 — Photos (D-048: reads via assertVehicleAccess, writes via assertVehicleOwned)
  // -----------------------------------------------------------------------

  /** GET vehicles/:id/photos?signed=true → photos with signed R2 URLs. */
  listPhotos: (vehicleId: string) =>
    api
      .get(`vehicles/${vehicleId}/photos`, {
        searchParams: { signed: "true" },
      })
      .json<VehiclePhoto[]>()
      .catch(toApiError),

  /** POST vehicles/:id/photos (multipart, field: file). Returns the new photo. */
  uploadPhoto: (
    vehicleId: string,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post(`vehicles/${vehicleId}/photos`, {
        body: formData,
        onUploadProgress: onProgress
          ? (event) => onProgress(Math.round(event.percent * 100))
          : undefined,
      })
      .json<VehiclePhoto>()
      .catch(toApiError);
  },

  /** PATCH vehicles/:id/photos/:photoId/primary → set photo as primary. */
  setPrimaryPhoto: (vehicleId: string, photoId: string) =>
    api
      .patch(`vehicles/${vehicleId}/photos/${photoId}/primary`)
      .json<VehiclePhoto>()
      .catch(toApiError),

  /** DELETE vehicles/:id/photos/:photoId → delete photo + R2 object. */
  deletePhoto: (vehicleId: string, photoId: string) =>
    api
      .delete(`vehicles/${vehicleId}/photos/${photoId}`)
      .then(() => undefined as void)
      .catch(toApiError),

  // -----------------------------------------------------------------------
  // F-013 — Documents (D-048: reads via assertVehicleAccess, writes via assertVehicleOwned)
  // -----------------------------------------------------------------------

  /** GET vehicles/:id/documents?signed=true → documents with signed R2 URLs. */
  listDocuments: (vehicleId: string) =>
    api
      .get(`vehicles/${vehicleId}/documents`, {
        searchParams: { signed: "true" },
      })
      .json<VehicleDocument[]>()
      .catch(toApiError),

  /**
   * POST vehicles/:id/documents (multipart, field: file + name + documentType + expiresAt?).
   * Returns the new document.
   */
  uploadDocument: (
    vehicleId: string,
    file: File,
    dto: { name: string; documentType: string; expiresAt?: string },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", dto.name);
    formData.append("documentType", dto.documentType);
    if (dto.expiresAt) formData.append("expiresAt", dto.expiresAt);
    return api
      .post(`vehicles/${vehicleId}/documents`, { body: formData })
      .json<VehicleDocument>()
      .catch(toApiError);
  },

  /** PATCH vehicles/:id/documents/:docId → update document metadata (no file replacement). */
  updateDocument: (
    vehicleId: string,
    docId: string,
    dto: {
      name?: string;
      documentType?: string;
      expiresAt?: string | null;
    },
  ) =>
    api
      .patch(`vehicles/${vehicleId}/documents/${docId}`, { json: dto })
      .json<VehicleDocument>()
      .catch(toApiError),

  /** DELETE vehicles/:id/documents/:docId → delete document + R2 object. */
  deleteDocument: (vehicleId: string, docId: string) =>
    api
      .delete(`vehicles/${vehicleId}/documents/${docId}`)
      .then(() => undefined as void)
      .catch(toApiError),

  // -----------------------------------------------------------------------
  // F-013 — Mileage (D-048: write via assertVehicleOwned)
  // -----------------------------------------------------------------------

  /** POST vehicles/:id/mileage → record mileage (monotonic, source: "owner" in MVP). */
  recordMileage: (
    vehicleId: string,
    dto: { mileage: number; source: "owner"; notes?: string },
  ) =>
    api
      .post(`vehicles/${vehicleId}/mileage`, { json: dto })
      .json<VehicleMileage>()
      .catch(toApiError),

  // -----------------------------------------------------------------------
  // F-014 — Vehicle history / timeline (GET :id/history, read-only)
  // -----------------------------------------------------------------------

  /** GET vehicles/:id/history → { transfers, mileages, ownerships } (F-014 / D-052). */
  getVehicleHistory: (vehicleId: string) =>
    api
      .get(`vehicles/${vehicleId}/history`)
      .json<VehicleHistoryResponse>()
      .catch(toApiError),
};
