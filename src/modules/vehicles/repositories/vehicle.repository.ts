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
 * Alta de stock propio de una concesionaria (Gap 1 / D-128). Además de los
 * campos del vehículo incluye el kilometraje inicial (obligatorio) y el
 * contexto que autoriza el alta. La implementación debe crear Vehicle +
 * VehicleOwnership (company) + VehicleMileage + VehicleAuditLog de forma atómica.
 */
export type RegisterDealershipVehicleData = RegisterVehicleDto & {
  dealershipId: string;
  dealershipMemberId: string;
  recordedByUserId: string;
  initialMileage: number;
};

/**
 * Superconjunto de Vehicle con la relación version.model.brand hidratada
 * (F-010 §10). create/update lo devuelven para que VehicleResponseDto.from()
 * pueda mapear brand/model/version y no null.
 */
export type HydratedVehicle = Vehicle & {
  version:
    (VehicleVersion & { model: VehicleModel & { brand: VehicleBrand } }) | null;
};

export interface VehicleRepository {
  create(data: RegisterVehicleData): Promise<HydratedVehicle>;
  createDealershipRegistration(
    data: RegisterDealershipVehicleData,
  ): Promise<HydratedVehicle>;
  update(id: string, data: UpdateVehicleDto): Promise<HydratedVehicle>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findByLicensePlate(plate: string): Promise<Vehicle | null>;
}
