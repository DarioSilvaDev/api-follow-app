import { Vehicle } from '@prisma/client';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';

export type RegisterVehicleData = RegisterVehicleDto & { ownerId: string };

export interface VehicleRepository {
  create(data: RegisterVehicleData): Promise<Vehicle>;
  update(id: string, data: UpdateVehicleDto): Promise<Vehicle>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findByLicensePlate(plate: string): Promise<Vehicle | null>;
}
