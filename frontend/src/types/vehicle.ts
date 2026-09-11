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
 * F-014: Vehicle transfer. Backend GET :id/history includes nested
 * `fromUser`/`toUser` as { id, firstName, lastName } (no email — PII).
 */
export interface VehicleTransfer {
  id: string;
  vehicleId: string;
  fromUser: { id: string; firstName: string; lastName: string };
  toUser: { id: string; firstName: string; lastName: string };
  status: VehicleTransferStatus;
  requestedAt: string;
  respondedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * F-014: GET /api/vehicles/:id/history response — 3 sources, each sorted
 * desc by its own timestamp (transfers.createdAt, mileages.recordedAt,
 * ownerships.startsAt). The frontend merges them (D-052).
 */
export interface VehicleHistoryResponse {
  transfers: VehicleTransfer[];
  mileages: VehicleMileage[];
  ownerships: VehicleOwnership[];
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