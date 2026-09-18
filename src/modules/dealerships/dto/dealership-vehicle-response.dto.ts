import { Vehicle, VehiclePhoto, VehicleOwnership } from '@prisma/client';

type DealershipVehicle = Vehicle & {
  version?: {
    name: string | null;
    model: { id: string; name: string; brand: { id: string; name: string } };
  } | null;
  photos?: VehiclePhoto[];
  ownerships?: (VehicleOwnership & {
    user?: { id: string; firstName: string; lastName: string } | null;
    dealership?: { id: string; name: string } | null;
  })[];
};

/**
 * Contrato del panel de concesionaria (§8 spec): mismo shape que el
 * VehicleResponseDto del módulo vehicles para reutilizar componentes de
 * frontend. Se mantiene local para no acoplar los módulos (sin imports
 * cross-módulo en este proyecto).
 */
export class DealershipVehicleResponseDto {
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
  ownerships?: (VehicleOwnership & {
    user?: { id: string; firstName: string; lastName: string } | null;
    dealership?: { id: string; name: string } | null;
  })[];

  static from(vehicle: DealershipVehicle): DealershipVehicleResponseDto {
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
      ownerships: vehicle.ownerships,
    };
  }
}