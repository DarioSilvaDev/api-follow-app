import ky, { HTTPError, isHTTPError } from "ky";
import { clearWorkshop, getActiveContext } from "@/lib/active-context";
import type { SessionUser } from "@/types/auth";
import type {
  CareEpisode,
  CareEpisodeLookupVehicle,
  CareEpisodeVerificationItem,
  CreateCareEpisodeInput,
  CreateOwnerCareEpisodeInput,
} from "@/types/care-episode";
import type {
  WorkshopDetail,
  WorkshopSearchResult,
} from "@/types/workshop";
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
  VehicleTransferListItem,
  VehicleTransferRow,
  VehicleVersion,
} from "@/types/vehicle";

export { HTTPError, isHTTPError };

// ---------------------------------------------------------------------------
// Active context headers (F-020 / RF-3, D-020 A1)
//
// El contexto activo se inyecta por request vía headers:
// - WORKSHOP activo → `X-Context-Type: WORKSHOP` + `X-Context-Id: {workshopId}`
//   en todas las llamadas EXCEPTO `auth/*`.
// - PERSONAL (null) → sin headers (comportamiento actual intacto, D-035).
// ---------------------------------------------------------------------------

/**
 * Relativiza la URL absoluta que arma ky (prefix + path) → "auth/login",
 * "vehicles", "care-episodes/lookup", etc.
 */
function apiRelativePath(requestUrl: string): string {
  const apiPrefix =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
  try {
    const url = new URL(requestUrl);
    const prefixUrl = new URL(apiPrefix);
    return url.pathname.replace(prefixUrl.pathname.replace(/\/$/, "") + "/", "");
  } catch {
    const marker = "/api/";
    const idx = requestUrl.indexOf(marker);
    return idx >= 0 ? requestUrl.slice(idx + marker.length) : requestUrl;
  }
}

/**
 * `auth/*` NUNCA lleva headers de contexto (RF-3). Un contexto stale en
 * /auth/me rompería el bootstrap de sesión con 403 INVALID_CONTEXT
 * (ContextResolver, D-020). Prefijo amplio a propósito: login/refresh/logout/
 * me/verify/forgot-password/reset-password/register son bootstrap o ciclo de
 * cuenta, y ninguna debe arrastrar contexto.
 */
function isAuthApiPath(path: string): boolean {
  return path.startsWith("auth/");
}

/** Inyecta los headers de contexto si hay taller seleccionado y NO es auth/*. */
function injectActiveContextHeaders({ request }: { request: Request }): void {
  const context = getActiveContext();
  if (!context) {
    return;
  }
  if (isAuthApiPath(apiRelativePath(request.url))) {
    return;
  }
  request.headers.set("X-Context-Type", context.type);
  request.headers.set("X-Context-Id", context.workshopId);
}

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
    beforeRequest: [
      // F-020 / RF-3: contexto activo por headers (no aplica a auth/*).
      (hookArg) => {
        injectActiveContextHeaders(hookArg);
      },
    ],
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
      })
      // F-020 / RF-3: el logout SIEMPRE resetea el contexto a null (PERSONAL),
      // incluso si la API falla — un workshopId stale rompería el próximo login.
      .finally(() => clearWorkshop()),

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

  // -----------------------------------------------------------------------
  // Fase 1 — Panel de transferencias (D-078)
  //
  // Contrato objetivo: fromUser/toUser SIMÉTRICOS sin email (PII), con
  // `vehicle` desnormalizado. Si el backend aún expone la forma legacy
  // (solo un lado con email), el tipado tolerante + transferUserLabel hacen
  // que la UI no muestre PII ni dependa del lado presente.
  // -----------------------------------------------------------------------

  /** GET vehicles/transfers/incoming → transferencias dirigidas al usuario actual. */
  listIncomingTransfers: () =>
    api
      .get("vehicles/transfers/incoming")
      .json<VehicleTransferListItem[]>()
      .catch(toApiError),

  /** GET vehicles/transfers/outgoing → transferencias iniciadas por el usuario actual. */
  listOutgoingTransfers: () =>
    api
      .get("vehicles/transfers/outgoing")
      .json<VehicleTransferListItem[]>()
      .catch(toApiError),

  /** POST vehicles/:id/transfer → crea transferencia pendiente (D-078 RF-1). */
  transferVehicle: (
    vehicleId: string,
    dto: { email: string; notes?: string },
  ) =>
    api
      .post(`vehicles/${vehicleId}/transfer`, { json: dto })
      .json<VehicleTransferRow>()
      .catch(toApiError),

  /** PATCH vehicles/transfers/:id/accept → acepta y completa la transferencia. */
  acceptTransfer: (transferId: string) =>
    api
      .patch(`vehicles/transfers/${transferId}/accept`)
      .json<VehicleTransferRow>()
      .catch(toApiError),

  /** PATCH vehicles/transfers/:id/reject → rechaza la transferencia. */
  rejectTransfer: (transferId: string) =>
    api
      .patch(`vehicles/transfers/${transferId}/reject`)
      .json<VehicleTransferRow>()
      .catch(toApiError),

  /** PATCH vehicles/transfers/:id/cancel → cancela (solo el emisor). */
  cancelTransfer: (transferId: string) =>
    api
      .patch(`vehicles/transfers/${transferId}/cancel`)
      .json<VehicleTransferRow>()
      .catch(toApiError),
};

// ---------------------------------------------------------------------------
// CareEpisode API methods (F-020)
//
// WORKSHOP-only: requieren contexto activo de taller (headers inyectados por
// `injectActiveContextHeaders`). En PERSONAL el backend responde 403
// (D-024 A2). El lookup NO va en vehicles — vive en `care-episodes` (foot-gun
// `:id` evitado por diseño, F-012).
// ---------------------------------------------------------------------------

export const careEpisodeApi = {
  /** F-020 RF-2: busca vehículo por placa EXACTA (normalizada trim+uppercase, D-037/D-042). Sin PII. */
  lookupVehicleByPlate: (plate: string) =>
    api
      .get("care-episodes/lookup", { searchParams: { plate } })
      .json<CareEpisodeLookupVehicle>()
      .catch(toApiError),

  /** F-020 RF-1: crea el CareEpisode (check-in). workshopId/createdByMemberId los fija el backend del contexto. */
  createCareEpisode: (input: CreateCareEpisodeInput) =>
    api
      .post("care-episodes", { json: input })
      .json<CareEpisode>()
      .catch(toApiError),

  // -------------------------------------------------------------------------
  // Iteración 2-2 — propietario + verificación por taller (spec 2-2 §6-§7)
  //
  // El inyector de contexto existente (auth/* excluido) NO cambia: la ruta
  // `/owner` opera en PERSONAL (sin headers → el backend exige ctx PERSONAL,
  // RF-1) y `verifications`/`:id/verify` operan en WORKSHOP (headers del
  // contexto activo, RF-4/RF-5). La ruta estática `verifications` convive con
  // `:id/verify` sin colisión (foot-gun F-012 documentado en la spec).
  // -------------------------------------------------------------------------

  /** Iteración 2-2 RF-1: POST /care-episodes/owner → 201 episodio source=OWNER (contexto PERSONAL). */
  createOwnerCareEpisode: (input: CreateOwnerCareEpisodeInput) =>
    api
      .post("care-episodes/owner", { json: input })
      .json<CareEpisode>()
      .catch(toApiError),

  /** Iteración 2-2 RF-4: GET /care-episodes/verifications → cola del taller (contexto WORKSHOP). */
  getCareEpisodeVerifications: () =>
    api
      .get("care-episodes/verifications")
      .json<CareEpisodeVerificationItem[]>()
      .catch(toApiError),

  /** Iteración 2-2 RF-5: POST /care-episodes/:id/verify → 200 (contexto WORKSHOP; idempotente). */
  verifyCareEpisode: (id: string) =>
    api
      .post(`care-episodes/${id}/verify`)
      .json<CareEpisode>()
      .catch(toApiError),
};

// ---------------------------------------------------------------------------
// Workshop API methods (F-020 — branches del taller para el check-in)
//
// GET /workshops/:id (backend existente) exige membresía activa y devuelve las
// branches activas (sede primero). Sin ContextGuard: tolera los headers de
// contexto y valida por `userId` en el handler.
// ---------------------------------------------------------------------------

export const workshopApi = {
  /** GET /workshops/:id → WorkshopResponseDto (branches activas, sede primero). */
  getWorkshop: (id: string) =>
    api
      .get(`workshops/${id}`)
      .json<WorkshopDetail>()
      .catch(toApiError),

  /**
   * Iteración 2-2 RF-3: búsqueda pública acotada de talleres para el
   * propietario (autenticado, SIN membresía). El debounce (≥2 chars) se
   * resuelve en la UI, no acá. Sin match → `[]`; `q` de 1 char → 400;
   * throttle 30/60s → 429.
   */
  searchWorkshops: (q: string) =>
    api
      .get("workshops/search", { searchParams: { q } })
      .json<WorkshopSearchResult[]>()
      .catch(toApiError),
};
