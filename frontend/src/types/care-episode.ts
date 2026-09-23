/**
 * F-020 + iteración 2-2 — CareEpisode frontend types.
 *
 * Alineado con el contrato del módulo `care-episodes` (spec F-020 §7 y spec
 * 2-2 §7):
 * - `GET /api/care-episodes/lookup?plate=` → datos mínimos del vehículo SIN PII
 *   (RF-2): `id`, `licensePlate`, `brand`, `model`, `version`,
 *   `manufactureYear`, `modelYear`.
 * - `POST /api/care-episodes` (check-in, RF-1): body con `vehicleId`, `branchId`
 *   y opcionales del ingreso. El episodio nace en estado `open`.
 * - `POST /api/care-episodes/owner` (RF-1 iteración 2-2): ruta PERSONAL del
 *   propietario; el `source` es constante del path (`owner`), nunca del body
 *   (D-063).
 * - `GET /api/care-episodes/verifications` (RF-4) y
 *   `POST /api/care-episodes/:id/verify` (RF-5): cola de verificaciones del
 *   taller (contexto WORKSHOP).
 *
 * El backend se implementa en paralelo con la spec; estos tipos solo reflejan
 * lo que consume la UI de esta iteración (F-021+ ampliará).
 */

/**
 * Origen del episodio (D-063: fijo e inmutable en la creación). Valores reales
 * del enum Prisma (minúsculas): `workshop` (flujo F-020) / `owner` (ruta
 * `/owner`).
 */
export type CareEpisodeSource = "workshop" | "owner";

/**
 * Nivel de confianza discreto (D-064): `unverified` → "Registrado por el
 * propietario"; `verified` → verificado por taller (solo talleres verifican).
 */
export type CareEpisodeVerification = "unverified" | "verified";

/** GET /api/care-episodes/lookup?plate= → vehículo para el check-in. */
export interface CareEpisodeLookupVehicle {
  id: string;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  manufactureYear: number | null;
  modelYear: number | null;
}

/** POST /api/care-episodes — body del check-in (campos expuestos en el form). */
export interface CreateCareEpisodeInput {
  vehicleId: string;
  branchId: string;
  appointmentId?: string;
  mileageIn?: number;
  customerComplaint?: string;
  customerNotes?: string;
}

/**
 * POST /api/care-episodes/owner — body del propietario (RF-1, iteración 2-2).
 * XOR del taller responsable (D-066): `workshopId` (taller de la app) **o**
 * `workshopName` (texto libre), nunca ambos (el backend responde 400 si el XOR
 * no se cumple).
 */
export interface CreateOwnerCareEpisodeInput {
  vehicleId: string;
  title: string;
  /** Fecha del servicio, ISO date `YYYY-MM-DD` (no futura, RF-1). */
  serviceDate: string;
  workshopId?: string;
  workshopName?: string;
  mileageIn?: number;
  notes?: string;
}

/**
 * POST /api/care-episodes → 201 con el episodio `open`. Subset leído por la UI.
 * Los campos de la iteración 2-2 (`source`, `verification`, campos owner) son
 * opcionales: el flujo WORKSHOP de F-020 no los expone en la respuesta.
 */
export interface CareEpisode {
  id: string;
  vehicleId: string;
  workshopId: string;
  branchId: string;
  status: "open" | "delivered" | "cancelled";
  mileageIn: number | null;
  customerComplaint: string | null;
  customerNotes: string | null;
  checkedInAt: string;
  createdAt: string;
  /** Iteración 2-2 (D-063): `source='owner'` en la ruta `/owner`. */
  source?: CareEpisodeSource;
  /** Iteración 2-2 (D-064): `verification='unverified'` al nacer. */
  verification?: CareEpisodeVerification;
  /** Iteración 2-2 (RF-1): requerido en episodios owner. */
  title?: string | null;
  /** Iteración 2-2 (RF-1): requerido en episodios owner (pasada/hoy). */
  serviceDate?: string | null;
  /** Iteración 2-2 (D-066): texto libre XOR `workshopId`. */
  workshopName?: string | null;
  /** Iteración 2-2 (RF-1): autor propietario (auditoría). */
  createdByUserId?: string | null;
}

/**
 * GET /api/care-episodes/verifications — item de la cola de verificaciones del
 * taller (RF-4, iteración 2-2). Solo episodios `source='owner'` +
 * `verification='unverified'` + `workshopId = contexto`, orden `serviceDate`
 * asc (≤50 default). PII mínima: `owner` sin email/teléfono.
 */
export interface CareEpisodeVerificationItem {
  id: string;
  title: string;
  serviceDate: string;
  mileageIn: number | null;
  notes: string | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    manufactureYear: number | null;
  };
  owner: {
    firstName: string;
    lastName: string;
  };
}

// ---------------------------------------------------------------------------
// Iteración 2-4 — Evidencia del episodio (S1..S6)
// GET /api/care-episodes/:id (+?signed=true), POST/:id/attachments,
// DELETE/:id/attachments/:attachmentId, POST /api/care-episodes/owner (multipart).
// ---------------------------------------------------------------------------

/**
 * Fase del adjunto de evidencia (S1/S4):
 * - "before" | "work" | "after" — evidencia del taller (fase de la atención).
 * - null — evidencia del propietario en la creación multipart (grupo General
 *   en el detalle, consistente con S1).
 */
export type CareEpisodeAttachmentPhase = "before" | "work" | "after" | null;

/**
 * Motivo de eliminación auditada (S5). El backend valida la enum real
 * (`duplicada | sin_valor | privacidad | otro`) en el body opcional de DELETE.
 */
export type RemovedAttachmentReason =
  | "duplicada"
  | "sin_valor"
  | "privacidad"
  | "otro";

/** Límites de evidencia espejo del backend (S4/S6, defensa en profundidad). */
export const CARE_EPISODE_ATTACHMENT_LIMITS = {
  /** Tope global de adjuntos activos por episodio. */
  maxTotal: 15,
  /** Máximo lote por request (backend: MAX_OWNER_CREATION_FILES / FilesInterceptor). */
  maxBatch: 5,
  /** Máximo por archivo (multer limits.fileSize). */
  maxFileSizeBytes: 5 * 1024 * 1024,
} as const;

/**
 * GET /api/care-episodes/:id — item del galería de evidencia (AttachmentDto,
 * contrato congelado S1). `url`/`expiresAt` SOLO aparecen con ?signed=true;
 * los adjuntos removidos NO se listan (tombstones server-side), por eso
 * `removed` viaja siempre `false` en las listas activas.
 */
export interface CareEpisodeAttachment {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  phase: CareEpisodeAttachmentPhase;
  uploadedByMemberId: string | null;
  uploadedByUserId: string | null;
  removed: boolean;
  createdAt: string;
  /** Solo presente cuando el detalle se pidió con ?signed=true. */
  url?: string;
  expiresAt?: string;
}

/** Agrupación por fase que devuelve el backend (S1): antes/trabajo/después/general. */
export interface CareEpisodeAttachmentGroups {
  before: CareEpisodeAttachment[];
  work: CareEpisodeAttachment[];
  after: CareEpisodeAttachment[];
  other: CareEpisodeAttachment[];
}

/**
 * GET /api/care-episodes/:id (+?signed=true) → CareEpisodeDetailResponseDto (S1).
 *
 * Proyección por actor (defense in depth aplicada en el mapping del backend):
 * - taller del episodio → `customerComplaint` + `internalNotes` visibles;
 * - dueño vigente       → `customerComplaint` visible, `internalNotes` null;
 * - shared/neutral      → ambos omitidos/null (nunca fuga PII).
 *
 * El backend puede OMITIR campos de proyección en lugar de enviar null → los
 * campos son opcionales y la UI renderiza defensivamente (`?? null`).
 */
export interface CareEpisodeDetail {
  id: string;
  vehicleId: string;
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
  status: "open" | "delivered" | "cancelled";
  source: CareEpisodeSource;
  verification: CareEpisodeVerification;
  title: string | null;
  serviceDate: string | null;
  workshopId: string | null;
  workshopName: string | null;
  mileageIn: number | null;
  /** Proyección: solo taller del episodio y dueño; puede venir OCULTO. */
  customerComplaint?: string | null;
  customerNotes: string | null;
  /** Proyección: SOLO presente para el taller del episodio (nunca dueño/shared). */
  internalNotes?: string | null;
  checkedInAt: string | null;
  closedAt: string | null;
  createdAt: string;
  attachments: CareEpisodeAttachmentGroups;
  attachmentCount: number;
}

/**
 * Respuesta aditiva de POST /api/care-episodes/owner con multipart (S6):
 * el shape histórico del episodio quedó intacto + `attachments` +
 * `attachmentCount` (misma forma AttachmentDto del detalle).
 */
export interface CreateOwnerCareEpisodeResult extends CareEpisode {
  attachments: CareEpisodeAttachment[];
  attachmentCount: number;
}