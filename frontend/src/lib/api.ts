import ky, { HTTPError, isHTTPError } from "ky";
import { clearActiveContext, getActiveContext } from "@/lib/active-context";
import type { SessionUser } from "@/types/auth";
import type {
  CareEpisode,
  CareEpisodeLookupVehicle,
  CareEpisodeVerificationItem,
  CreateCareEpisodeInput,
  CreateOwnerCareEpisodeInput,
} from "@/types/care-episode";
import type {
  CreateDealershipInput,
  UpdateDealershipInput,
  Dealership,
  DealershipExhibitionVehicle,
  DealershipInvitation,
  DealershipMember,
  DealershipRoleItem,
} from "@/types/dealership";
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
  TransferQrAcceptResult,
  TransferQrPreview,
  TransferQrRevokeResult,
  TransferRecipient,
  GeneratedTransferQr,
  VehicleVersion,
} from "@/types/vehicle";

export { HTTPError, isHTTPError };

// ---------------------------------------------------------------------------
// Active context headers (F-020 / RF-3, D-020 A1; consignación D-TL-12)
//
// El contexto activo se inyecta por request vía headers:
// - WORKSHOP activo → `X-Context-Type: WORKSHOP` + `X-Context-Id: {workshopId}`
//   en todas las llamadas EXCEPTO `auth/*`.
// - DEALERSHIP activo → `X-Context-Type: DEALERSHIP` +
//   `X-Context-Id: {dealershipId}` (idem, miembro en representación).
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

/** Inyecta los headers de contexto si hay taller/concesionaria seleccionado y NO es auth/*. */
function injectActiveContextHeaders({ request }: { request: Request }): void {
  const context = getActiveContext();
  if (!context) {
    return;
  }
  if (isAuthApiPath(apiRelativePath(request.url))) {
    return;
  }
  request.headers.set("X-Context-Type", context.type);
  const contextId =
    context.type === "WORKSHOP" ? context.workshopId : context.dealershipId;
  request.headers.set("X-Context-Id", contextId);
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
      // Consignación (D-TL-12): DEALERSHIP también inyecta headers.
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

/**
 * ky 2.x consume el body HTTP al poblar `error.data`; por eso `error.response
 * .json()` / `.text()` lanzan "Body has already been read". Este helper lee
 * `error.data` y lo normaliza al shape de UI `{ message?, code? }`:
 * - string (body text/plain) → `{ message }`.
 * - objeto → `message` string, o array de mensajes (validación NestJS) unido
 *   con espacio; `code` solo si es string.
 * - `undefined` / vacío / no parseable → `{}`.
 */
function normalizeErrorBody(error: HTTPError): {
  message?: string;
  code?: string;
} {
  const data: unknown = error.data;

  if (typeof data === "string") {
    const message = data.trim();
    return message ? { message } : {};
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const normalized: { message?: string; code?: string } = {};

    if (typeof record.message === "string") {
      normalized.message = record.message;
    } else if (Array.isArray(record.message)) {
      const message = record.message
        .filter((item): item is string => typeof item === "string")
        .join(" ");
      if (message) {
        normalized.message = message;
      }
    }

    if (typeof record.code === "string") {
      normalized.code = record.code;
    }

    return normalized;
  }

  return {};
}

async function toApiError(error: unknown): Promise<never> {
  if (isHTTPError(error)) {
    throw {
      status: error.response.status,
      ...normalizeErrorBody(error),
    };
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
      .catch(toApiError),

  logout: () =>
    api
      .post("auth/logout")
      .json<{ message: string }>()
      .catch(toApiError)
      // F-020 / RF-3: el logout SIEMPRE resetea el contexto a null (PERSONAL),
      // incluso si la API falla — un workshopId/dealershipId stale rompería el
      // próximo login (ContextResolver, D-020 / D-TL-12).
      .finally(() => clearActiveContext()),

  me: () =>
    api
      .get("auth/me")
      .json<SessionUser>()
      .catch(toApiError),

  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) =>
    api
      .post("auth/register", { json: data })
      .json<{ message: string }>()
      .catch(toApiError),

  verifyEmail: (token: string) =>
    api
      .get("auth/verify-email", { searchParams: { token } })
      .text()
      .catch(toApiError),

  forgotPassword: (email: string) =>
    api
      .post("auth/forgot-password", { json: { email } })
      .json<{ message: string }>()
      .catch(toApiError),

  resetPassword: (token: string, password: string) =>
    api
      .post("auth/reset-password", { json: { token, password } })
      .json<{ message: string }>()
      .catch(toApiError),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post("auth/change-password", { json: { currentPassword, newPassword } })
      .json<{ message: string }>()
      .catch(toApiError),
};

// ---------------------------------------------------------------------------
// User API methods (Fase 2 — Alias, D-077/D-091)
// ---------------------------------------------------------------------------

export interface MyAlias {
  alias: string | null;
  lastAliasChangedAt: string | null;
  nextChangeAllowedAt: string | null;
}

export const usersApi = {
  /** GET /users/me/alias → alias actual + cooldown info. */
  getMyAlias: () =>
    api
      .get("users/me/alias")
      .json<MyAlias>()
      .catch(toApiError),

  /**
   * PATCH /users/me/alias → establece, cambia o elimina (null) el alias.
   * 409s: cooldown 15d / transferencia pendiente / alias en uso.
   */
  updateMyAlias: (alias: string | null) =>
    api
      .patch("users/me/alias", { json: { alias } })
      .json<MyAlias>()
      .catch(toApiError),
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

  /**
   * POST vehicles/:id/transfer → crea transferencia pendiente (D-078 RF-1).
   * Fase 4: el destinatario se identifica por email o alias (contrato congelado
   * `{ recipient: { type, value }, notes? }`).
   */
  transferVehicle: (
    vehicleId: string,
    dto: { recipient: TransferRecipient; notes?: string },
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

  // -----------------------------------------------------------------------
  // Fase 3 — QR de transferencia presencial/concesionaria (D-079..D-088)
  // -----------------------------------------------------------------------

  /** POST vehicles/:id/qr → genera QR de transferencia (owner-only). */
  generateTransferQr: (
    vehicleId: string,
    dto: { source: "presencial" | "concesionaria" },
  ) =>
    api
      .post(`vehicles/${vehicleId}/qr`, { json: dto })
      .json<GeneratedTransferQr>()
      .catch(toApiError),

  // -------------------------------------------------------------------------
  // Milestone consignación (D-104/D-105, spec §8). Same QR machinery; the
  // purpose (take/sale/return) is resolved server-side and echoed back.
  // -------------------------------------------------------------------------

  /**
   * POST vehicles/:id/consignment/take-qr → QR de TOMA (purpose: take, D-104).
   * Lo genera el vendedor (owner) y lo escanea un miembro de la concesionaria
   * (contexto DEALERSHIP). `schedule`:
   * - `immediate` → presencial 1h (RB-11);
   * - `pickup`    → retiro diferido 48h (la agencia escanea al llegar el auto).
   */
  generateConsignmentTakeQr: (
    vehicleId: string,
    dto: { schedule: "immediate" | "pickup" },
  ) =>
    api
      .post(`vehicles/${vehicleId}/consignment/take-qr`, { json: dto })
      .json<GeneratedTransferQr>()
      .catch(toApiError),

  /**
   * POST vehicles/:id/consignment/return-qr → QR inverso de DEVOLUCIÓN
   * (purpose: return, D-105). Lo genera la concesionaria (titular intermedio,
   * contexto DEALERSHIP); el vendedor original lo escanea y acepta.
   */
  generateConsignmentReturnQr: (vehicleId: string) =>
    api
      .post(`vehicles/${vehicleId}/consignment/return-qr`)
      .json<GeneratedTransferQr>()
      .catch(toApiError),

  /** GET vehicles/transfer/qr/:token → preview antes de aceptar. */
  previewTransferQr: (token: string) =>
    api
      .get(`vehicles/transfer/qr/${token}`)
      .json<TransferQrPreview>()
      .catch(toApiError),

  /** POST vehicles/transfer/qr/:token/accept → acepta (one-shot, body { confirmation: true }). */
  acceptTransferQr: (token: string) =>
    api
      .post(`vehicles/transfer/qr/${token}/accept`, {
        json: { confirmation: true },
      })
      .json<TransferQrAcceptResult>()
      .catch(toApiError),

  /** DELETE vehicles/:id/qr → revoca el QR pendiente (owner-only, idempotente). */
  revokeTransferQr: (vehicleId: string) =>
    api
      .delete(`vehicles/${vehicleId}/qr`)
      .json<TransferQrRevokeResult>()
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

// ---------------------------------------------------------------------------
// Dealership API methods (milestone consignación — D-102, spec §8)
//
// Módulo `dealerships` espejo de workshops. Los endpoints exigen membresía
// activa (o permisos por rol — RB-10) y el backend es la frontera de
// enforcement; la UI solo oculta/renderiza según contexto (AGENTS.md §22).
// ---------------------------------------------------------------------------

export const dealershipApi = {
  /** POST /dealerships → alta rápida (D-103): crea member dueño del user autenticado. */
  create: (input: CreateDealershipInput) =>
    api
      .post("dealerships", { json: input })
      .json<Dealership>()
      .catch(toApiError),

  /** GET /dealerships/mine → concesionarias del usuario (miembro). */
  listMine: () =>
    api
      .get("dealerships/mine")
      .json<Dealership[]>()
      .catch(toApiError),

  /** GET /dealerships/:id → detalle (admin/miembro). */
  get: (id: string) =>
    api
      .get(`dealerships/${id}`)
      .json<Dealership>()
      .catch(toApiError),

  /** PATCH /dealerships/:id → editar perfil (admin). */
  update: (id: string, input: UpdateDealershipInput) =>
    api
      .patch(`dealerships/${id}`, { json: input })
      .json<Dealership>()
      .catch(toApiError),

  /** GET /dealerships/:id/vehicles → vehículos en exhibición (panel). */
  listVehicles: (id: string) =>
    api
      .get(`dealerships/${id}/vehicles`)
      .json<DealershipExhibitionVehicle[]>()
      .catch(toApiError),

  /** GET /dealerships/:id/members → miembros (espejo workshops). */
  listMembers: (id: string) =>
    api
      .get(`dealerships/${id}/members`)
      .json<DealershipMember[]>()
      .catch(toApiError),

  /** GET /dealerships/:id/roles → roles de la concesionaria (RB-10). */
  listRoles: (id: string) =>
    api
      .get(`dealerships/${id}/roles`)
      .json<DealershipRoleItem[]>()
      .catch(toApiError),

  /** POST /dealerships/:id/members → invitación por email + rol (patrón workshops, D-034). */
  inviteMember: (id: string, input: { email: string; roleId: string }) =>
    api
      .post(`dealerships/${id}/members`, { json: input })
      .json<DealershipInvitation>()
      .catch(toApiError),

  /** PATCH /dealerships/:id/members/:memberId/role → cambio de rol (admin). */
  updateMemberRole: (
    dealershipId: string,
    memberId: string,
    roleId: string,
  ) =>
    api
      .patch(`dealerships/${dealershipId}/members/${memberId}/role`, {
        json: { roleId },
      })
      .json<DealershipMember>()
      .catch(toApiError),

  /** DELETE /dealerships/:id/members/:memberId → quitar miembro (admin). */
  removeMember: (dealershipId: string, memberId: string) =>
    api
      .delete(`dealerships/${dealershipId}/members/${memberId}`)
      .then(() => undefined as void)
      .catch(toApiError),
};
