import {
  Vehicle,
  VehiclePhoto,
  VehicleDocument,
  VehicleOwnership,
} from '@prisma/client';

type VehicleWithRelations = Vehicle & {
  photos?: VehiclePhoto[];
  documents?: VehicleDocument[];
  ownerships?: VehicleOwnership[];
};

export class VehicleResponseDto {
  id!: string;
  licensePlate!: string;
  vin!: string | null;
  engineNumber!: string | null;
  manufactureYear!: number | null;
  modelYear!: number | null;
  color!: string | null;
  notes!: string | null;
  createdAt!: Date | null;
  updatedAt!: Date | null;
  photos?: VehiclePhoto[];
  documents?: VehicleDocument[];
  ownerships?: VehicleOwnership[];

  static from(vehicle: VehicleWithRelations): VehicleResponseDto {
    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      engineNumber: vehicle.engineNumber,
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
