import {
  Vehicle,
  VehiclePhoto,
  VehicleDocument,
  VehicleOwnership,
  VehicleVersion,
  VehicleModel,
  VehicleBrand,
} from '@prisma/client';

type VehicleWithRelations = Vehicle & {
  version?:
    | (VehicleVersion & {
        model: VehicleModel & {
          brand: VehicleBrand;
        };
      })
    | null;
  photos?: VehiclePhoto[];
  documents?: VehicleDocument[];
  ownerships?: VehicleOwnership[];
};

export class VehicleResponseDto {
  id!: string;
  licensePlate!: string;
  vin!: string | null;
  engineNumber!: string | null;
  versionId!: string | null;
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
  ownerships?: VehicleOwnership[];

  static from(vehicle: VehicleWithRelations): VehicleResponseDto {
    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      engineNumber: vehicle.engineNumber,
      versionId: vehicle.versionId,
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
    };
  }
}
