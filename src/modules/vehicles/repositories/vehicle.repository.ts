import {
  Vehicle,
  VehicleBrand,
  VehicleModel,
  VehicleVersion,
} from '@prisma/client';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';

export type RegisterVehicleData = RegisterVehicleDto & { ownerId: string };

/**
 * Superconjunto de Vehicle con la relación version.model.brand hidratada
 * (F-010 §10). create/update lo devuelven para que VehicleResponseDto.from()
 * pueda mapear brand/model/version y no null.
 */
export type HydratedVehicle = Vehicle & {
  version:
    | (VehicleVersion & { model: VehicleModel & { brand: VehicleBrand } })
    | null;
};

export interface VehicleRepository {
  create(data: RegisterVehicleData): Promise<HydratedVehicle>;
  update(id: string, data: UpdateVehicleDto): Promise<HydratedVehicle>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findByLicensePlate(plate: string): Promise<Vehicle | null>;
}
