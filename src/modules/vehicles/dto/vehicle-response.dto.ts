import {
  VehicleDocument,
  VehicleMileage,
  VehicleOwnership,
  VehiclePhoto,
} from '@prisma/client';
import { VehicleMileageResponseDto } from './vehicle-mileage-response.dto';

/**
 * Gap 1 — D-11/D-12: `GET /vehicles/:id` agrega `mileages`, `mileageCount` y
 * `capabilities` (aditivo). Representa la forma que devuelve el handler:
 * el payload Prisma del vehículo más `_count` y `capabilities`.
 */
type OwnershipUser = {
  id: string;
  firstName: string;
  lastName: string;
  alias?: string | null;
  email?: string | null;
};

type OwnershipWithRelations = VehicleOwnership & {
  user?: OwnershipUser | null;
  dealership?: { id: string; name: string; logoUrl?: string | null } | null;
};

type MileageWithAttribution = VehicleMileage & {
  recordedByUser?: { id: string; firstName: string; lastName: string } | null;
  recordedByDealership?: { id: string; name: string } | null;
  recordedByWorkshopMember?: {
    id: string;
    user?: { id: string; firstName: string; lastName: string } | null;
    workshop?: { id: string; name: string } | null;
  } | null;
};

type VehicleWithRelations = {
  id: string;
  licensePlate: string;
  vin: string | null;
  engineNumber: string | null;
  versionId: string | null;
  manufactureYear: number | null;
  modelYear: number | null;
  color: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  version?: {
    id: string;
    name: string;
    model?: {
      id: string;
      name: string;
      brand?: { id: string; name: string } | null;
    } | null;
  } | null;
  photos?: VehiclePhoto[];
  documents?: VehicleDocument[];
  ownerships?: OwnershipWithRelations[];
  mileages?: MileageWithAttribution[];
  _count?: { mileages: number };
  capabilities?: {
    canEdit: boolean;
    canRecordMileage: boolean;
    canCorrectVin: boolean;
  };
};

export class VehicleResponseDto {
  id!: string;
  licensePlate!: string;
  vin!: string | null;
  engineNumber!: string | null;
  versionId!: string | null;
  brandId!: string | null;
  modelId!: string | null;
  brand!: string | null;
  model!: string | null;
  version!: string | null;
  manufactureYear!: number | null;
  modelYear!: number | null;
  color!: string | null;
  notes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  photos?: VehiclePhoto[];
  documents?: VehicleDocument[];
  ownerships?: OwnershipWithRelations[];
  mileages?: VehicleMileageResponseDto[];
  mileageCount?: number;
  capabilities?: {
    canEdit: boolean;
    canRecordMileage: boolean;
    canCorrectVin: boolean;
  };

  static from(vehicle: VehicleWithRelations): VehicleResponseDto {
    const mileages =
      vehicle.mileages?.map((m) => VehicleMileageResponseDto.from(m)) ?? [];
    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      engineNumber: vehicle.engineNumber,
      versionId: vehicle.versionId,
      brandId: vehicle.version?.model?.brand?.id ?? null,
      modelId: vehicle.version?.model?.id ?? null,
      brand: vehicle.version?.model?.brand?.name ?? null,
      model: vehicle.version?.model?.name ?? null,
      version: vehicle.version?.name ?? null,
      manufactureYear: vehicle.manufactureYear,
      modelYear: vehicle.modelYear,
      color: vehicle.color,
      notes: vehicle.notes,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
      photos: vehicle.photos,
      documents: vehicle.documents,
      ownerships: vehicle.ownerships,
      mileages,
      // D-11: total real de lecturas (el arreglo está limitado a 5).
      mileageCount: vehicle._count?.mileages ?? vehicle.mileages?.length ?? 0,
      capabilities: vehicle.capabilities,
    };
  }
}
