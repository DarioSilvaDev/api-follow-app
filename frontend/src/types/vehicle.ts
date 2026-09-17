/**
 * Vehicle domain types — aligned with the F-010 contract (spec §5).
 *
 * CONTRACT TOLERANCE (F-010 §9): the backend is migrating `GET /api/vehicles`
 * (list) to the same shape as `VehicleResponseDto` (brand/model/version
 * denormalized). Until that is uniformed, `brand`/`model`/`version` are
 * OPTIONAL here and the UI renders "—" when missing (D-038).
 */

export type VehicleOwnershipType = "owner" | "co_owner" | "company";

/**
 * Minimal ownership shape consumed by the frontend (D-039 / RF-1).
 * The backend exposes the full `VehicleOwnership` row (Prisma) in the list
 * and detail responses; here we only type the fields the UI reads:
 * - `type` is `owner` for active owners (D-039 edit rule).
 * - `endsAt === null` marks an ACTIVE ownership (historical rows are kept).
 * - F-013: GET /:id include el anidado `user` (nombre/apellido) para mostrar
 *   el titular actual (RF-2). El listado NO lo incluye — por eso es opcional.
 */
export interface VehicleOwnership {
  id: string;
  vehicleId: string;
  userId: string;
  type: VehicleOwnershipType;
  startsAt: string;
  endsAt?: string | null;
  /** Ownership notes — present in GET /:id/history (F-014), NOT in list. */
  notes?: string | null;
  /** Detailed GET /:id and history only — the list response omits it. */
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

// ---------------------------------------------------------------------------
// F-013: Photo / Document / Mileage types
// ---------------------------------------------------------------------------

/**
 * F-013 / D-048: Vehicle photo.
 * When fetched via `GET :id/photos?signed=true` the response includes `url`
 * and `expiresAt` (signed URL expiry, ISO string).
 */
export interface VehiclePhoto {
  id: string;
  vehicleId: string;
  key: string;
  caption: string | null;
  isPrimary: boolean;
  createdAt: string;
  /** Signed URL (R2 batch `?signed=true`) — present only with signed query. */
  url?: string;
  /** Signed URL expiration timestamp (ISO string). */
  expiresAt?: string;
}

/**
 * F-013 / D-048: Vehicle document.
 * `expiresAt` is the document metadata expiry (null = no expiry).
 * `urlExpiresAt` is the signed URL expiry (separate from the metadata field).
 */
export interface VehicleDocument {
  id: string;
  vehicleId: string;
  key: string;
  name: string;
  documentType: string;
  /** Document metadata expiry (null = no expiry). */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Signed URL (R2 batch `?signed=true`) — present only with signed query. */
  url?: string;
  /** Signed URL expiration timestamp (ISO string). */
  urlExpiresAt?: string;
}

/**
 * Mileage source enum — mirrors the Prisma `MileageSource` enum.
 */
export type MileageSource =
  | "owner"
  | "workshop"
  | "inspection"
  | "dealership"
  | "imported"
  | "system";

/**
 * F-013: Vehicle mileage record.
 */
export interface VehicleMileage {
  id: string;
  vehicleId: string;
  mileage: number;
  source: MileageSource | string;
  notes?: string | null;
  recordedAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// F-014: Vehicle history / timeline types (GET :id/history)
// ---------------------------------------------------------------------------

/**
 * Transfer status — mirrors the Prisma `TransferStatus` enum.
 * D-054: every status is shown as a visible timeline entry.
 */
export type VehicleTransferStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "completed"
  | "expired";

/**
 * Usuario de contraparte en una transferencia (emisor/receptor) — SIN email
 * (PII). D-077: `alias` se incorpora en Fase 1 como nullable (null en el
 * backend hasta D-XXX; la UI muestra el fallback nombre completo).
 */
export interface VehicleTransferUser {
  id: string;
  firstName: string;
  lastName: string;
  /** D-077: alias de usuario (null en Fase 1; se puebla en Fase 2+). */
  alias?: string | null;
}

/**
 * F-014: Vehicle transfer. Backend GET :id/history includes nested
 * `fromUser`/`toUser` (no email — PII).
 */
export interface VehicleTransfer {
  id: string;
  vehicleId: string;
  fromUser: VehicleTransferUser;
  toUser: VehicleTransferUser;
  status: VehicleTransferStatus;
  requestedAt: string;
  respondedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * Panel de transferencias (Fase 1 / D-078): item de las listas
 * `GET vehicles/transfers/incoming|outgoing`.
 *
 * Contrato objetivo D-078: `fromUser`/`toUser` simétricos sin email, con
 * `vehicle` anidado desnormalizado. Tolerancia de contrato: los campos que la
 * UI no lee son opcionales (el backend en migración puede devolver filas
 * crudas de Prisma con campos extra).
 */
export interface VehicleTransferListItem {
  id: string;
  status: VehicleTransferStatus;
  requestedAt: string;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  respondedAt?: string | null;
  completedAt?: string | null;
  /** Desnormalizado (Fase 1 / RF-1): los campos del listado NO cambian. */
  vehicle: {
    id: string;
    licensePlate: string;
    manufactureYear?: number | null;
    modelYear?: number | null;
    color?: string | null;
  };
  fromUser: VehicleTransferUser;
  toUser: VehicleTransferUser;
}

/**
 * Fase 1: respuesta de las mutaciones de transferencia (accept/reject/cancel/
 * POST :id/transfer). El backend devuelve la fila cruda de Prisma (sin
 * `vehicle`/`fromUser`/`toUser` anidados) — el frontend NO consume esta
 * respuesta: invalida queries y refetchea.
 */
export interface VehicleTransferRow {
  id: string;
  status: VehicleTransferStatus;
  requestedAt: string;
  [key: string]: unknown;
}

/**
 * Fase 4 — transferencia por email o alias.
 *
 * Contrato congelado: `POST /vehicles/:id/transfer` recibe
 * `{ recipient: { type, value }, notes? }`.
 * - `type: "email"` → `value` es un email.
 * - `type: "alias"` → `value` es el alias SIN "@" (el backend normaliza
 *   lowercase igualmente; el frontend ya lo envía normalizado).
 */
export type TransferRecipientType = "email" | "alias";

export interface TransferRecipient {
  type: TransferRecipientType;
  value: string;
}

// ---------------------------------------------------------------------------
// Fase 3 — QR de transferencia presencial / concesionaria (D-079..D-088, D-090)
// ---------------------------------------------------------------------------

export type TransferQrSource = "presencial" | "concesionaria";

/** POST vehicles/:id/qr → QR generado (url deep link + TTL). */
export interface GeneratedTransferQr {
  id: string;
  token: string;
  url: string;
  source: TransferQrSource;
  expiresAt: string;
  secondsRemaining: number;
}

/** GET vehicles/transfer/qr/:token → preview (vehicle + emisor, sin PII). */
export interface TransferQrPreview {
  vehicle: {
    id: string;
    name: string;
    licensePlate: string;
  };
  fromUser: {
    id: string;
    firstName: string;
    lastName: string;
    alias: string | null;
  };
  source: TransferQrSource;
  expiresAt: string;
  secondsRemaining: number;
}

/** POST vehicles/transfer/qr/:token/accept → resultado one-shot. */
export interface TransferQrAcceptResult {
  transferId: string;
  status: "completed";
}

/** DELETE vehicles/:id/qr → revoke (idempotente). */
export interface TransferQrRevokeResult {
  revoked: boolean;
  id?: string;
}

/**
 * Iteración 2-3 (D-069/D-070): CareEpisode en el timeline del vehículo.
 *
 * Shape ESTRICTO del 4º array de `GET /api/vehicles/:id/history` — no
 * reutilizar el modelo `CareEpisode` de crear (RF-2): este es más estrecho
 * y el `title` es `string | null` (el schema es nullable; el fallback de UI
 * vive en D-071).
 *
 * Fuente del nombre del taller (TL): `workshop?.name ?? workshopName`
 * (relación viva con fallback al snapshot de texto libre).
 */
export interface VehicleCareEpisode {
  id: string;
  /** NO normalizar (schema nullable) — fallback en UI (D-071). */
  title: string | null;
  /** DateTime? ISO — timestamp canónico del merge (D-070) vía serviceDate ?? checkedInAt ?? createdAt. */
  serviceDate: string | null;
  status: "open" | "delivered" | "cancelled";
  /** D-063: fijo e inmutable en la creación. */
  source: "owner" | "workshop";
  /** D-064: solo talleres verifican. */
  verification: "unverified" | "verified";
  mileageIn: number | null;
  customerNotes: string | null;
  checkedInAt: string | null;
  createdAt: string;
  workshop: { id: string; name: string } | null;
  /** Snapshot de texto libre (XOR con workshopId, D-066). */
  workshopName: string | null;
}

/**
 * F-014: GET /api/vehicles/:id/history response — 4 sources, each sorted
 * desc by its own timestamp (transfers.createdAt, mileages.recordedAt,
 * ownerships.startsAt, careEpisodes por D-070). The frontend merges them
 * (D-052). La iteración 2-3 agrega `careEpisodes` (aditivo, D-069).
 */
export interface VehicleHistoryResponse {
  transfers: VehicleTransfer[];
  mileages: VehicleMileage[];
  ownerships: VehicleOwnership[];
  /** Iteración 2-3: episodios owner + workshop (ya ordenados por D-070). */
  careEpisodes: VehicleCareEpisode[];
}

// ---------------------------------------------------------------------------
// Vehicle response (base — used by list and detail)
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  licensePlate: string;
  vin?: string | null;
  engineNumber?: string | null;
  versionId?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  manufactureYear?: number | null;
  modelYear?: number | null;
  color?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  /** F-013: Photos (raw from GET /:id, or with url when signed=true). */
  photos?: VehiclePhoto[];
  /** F-013: Documents (raw from GET /:id, or with url when signed=true). */
  documents?: VehicleDocument[];
  /** F-013: Latest mileage records (from GET /:id, last 5). */
  mileages?: VehicleMileage[];
  /** Active ownerships (list) / all ownerships (detail). See VehicleOwnership. */
  ownerships?: VehicleOwnership[];
}

export interface VehicleListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VehicleListResponse {
  data: Vehicle[];
  meta: VehicleListMeta;
}

export interface VehicleBrand {
  id: string;
  name: string;
}

export interface VehicleModel {
  id: string;
  brandId: string;
  name: string;
}

export interface VehicleVersion {
  id: string;
  modelId: string;
  name: string;
}

export interface RegisterVehicleInput {
  licensePlate: string;
  vin?: string;
  engineNumber?: string;
  versionId?: string;
  manufactureYear?: number;
  modelYear?: number;
  color?: string;
  notes?: string;
}

/**
 * F-011: PATCH /api/vehicles/:id accepts the same fields as register, partial
 * (UpdateVehicleDto = PartialType(RegisterVehicleDto), D-040).
 *
 * D-043 (RF-8): en EDICIÓN los campos opcionales de texto/número pueden
 * enviarse como `null` para VACIARLOS (el backend @IsOptional() acepta null y
 * Prisma persiste NULL). El alta (register) NUNCA envía null — usa
 * `RegisterVehicleInput` (opcionales vacíos → undefined/omitidos).
 *
 * `versionId` NUNCA viaja null (omitir = no tocar la rama del catálogo, RF-2)
 * y `licensePlate` es obligatoria (nunca null).
 */
export interface UpdateVehicleInput {
  licensePlate?: string;
  vin?: string | null;
  engineNumber?: string | null;
  versionId?: string;
  manufactureYear?: number | null;
  modelYear?: number | null;
  color?: string | null;
  notes?: string | null;
}