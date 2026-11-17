import {
  Vehicle,
  VehicleBrand,
  VehicleModel,
  VehicleVersion,
} from '@prisma/client';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';

/**
 * Datos de alta que persiste el repositorio. `brandId`/`modelId` NO se
 * forwardean a Prisma: el handler resuelve los nombres y los pasa en
 * `brandName`/`modelName`; `versionId` queda null en los vehículos nuevos
 * (legacy conserva su versión).
 */
export type RegisterVehiclePayload = Omit<
  RegisterVehicleDto,
  'brandId' | 'modelId'
> & {
  brandName?: string | null;
  modelName?: string | null;
  versionId?: string | null;
};

export type RegisterVehicleData = RegisterVehiclePayload & { ownerId: string };

/**
 * Alta de stock propio de una concesionaria (Gap 1 / D-128). Además de los
 * campos del vehículo incluye el kilometraje inicial (obligatorio) y el
 * contexto que autoriza el alta. La implementación debe crear Vehicle +
 * VehicleOwnership (company) + VehicleMileage + VehicleAuditLog de forma atómica.
 */
export type RegisterDealershipVehicleData = RegisterVehiclePayload & {
  dealershipId: string;
  dealershipMemberId: string;
  recordedByUserId: string;
  initialMileage: number;
};

/**
 * Alta personal (PERSONAL) con kilometraje declarado por el propietario
 * (D-206). `initialMileage` es opcional en el contrato: cuando viaja se
 * persiste como la primera lectura del odómetro (source=owner, atribuida al
 * usuario). La implementación debe crear Vehicle + VehicleOwnership (owner) +
 * VehicleMileage + VehicleAuditLog de forma atómica.
 */
export type RegisterPersonalVehicleData = RegisterVehicleData & {
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

/** Datos de PATCH ya resueltos: sin `brandId`/`modelId`, con textos de catálogo. */
export type UpdateVehicleData = Omit<
  UpdateVehicleDto,
  'brandId' | 'modelId'
> & {
  brandName?: string | null;
  modelName?: string | null;
  versionId?: string | null;
};

export interface VehicleRepository {
  create(data: RegisterVehicleData): Promise<HydratedVehicle>;
  createPersonalRegistration(
    data: RegisterPersonalVehicleData,
  ): Promise<HydratedVehicle>;
  createDealershipRegistration(
    data: RegisterDealershipVehicleData,
  ): Promise<HydratedVehicle>;
  update(id: string, data: UpdateVehicleData): Promise<HydratedVehicle>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findByLicensePlate(plate: string): Promise<Vehicle | null>;
}
