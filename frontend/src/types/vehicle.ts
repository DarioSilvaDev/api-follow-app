/**
 * Vehicle domain types — aligned with the F-010 contract (spec §5).
 *
 * CONTRACT TOLERANCE (F-010 §9): the backend is migrating `GET /api/vehicles`
 * (list) to the same shape as `VehicleResponseDto` (brand/model/version
 * denormalized). Until that is uniformed, `brand`/`model`/`version` are
 * OPTIONAL here and the UI renders "—" when missing (D-038).
 */

export interface Vehicle {
  id: string;
  licensePlate: string;
  vin?: string | null;
  engineNumber?: string | null;
  versionId?: string | null;
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
  ownerships?: unknown[];
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