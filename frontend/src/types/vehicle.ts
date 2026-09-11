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
 */
export interface VehicleOwnership {
  id: string;
  vehicleId: string;
  userId: string;
  type: VehicleOwnershipType;
  startsAt: string;
  endsAt?: string | null;
}

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
  /** Relations exposed by the backend — not consumed by the MVP list yet. */
  photos?: unknown[];
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