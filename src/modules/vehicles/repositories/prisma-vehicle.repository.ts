import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import {
  RegisterVehicleData,
  RegisterDealershipVehicleData,
  VehicleRepository,
} from './vehicle.repository';

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: RegisterVehicleData) {
    const { ownerId, ...vehicleData } = data;

    try {
      return await this.prisma.vehicle.create({
        data: {
          ...vehicleData,
          ownerships: {
            create: {
              userId: ownerId,
              type: 'owner',
              startsAt: new Date(),
            },
          },
        },
        include: {
          // F-010 (§10): hidratar version.model.brand para que
          // VehicleResponseDto.from() devuelva brand/model/version y no null.
          // Mismo shape que list-vehicles.handler.ts / get-vehicle.handler.ts.
          version: { include: { model: { include: { brand: true } } } },
        },
      });
    } catch (error) {
      // D-036: los campos únicos (license_plate/vin/engine_number) pueden
      // colisionar a pesar del pre-check del handler (carrera / path directo).
      // El constraint actúa como red de seguridad → 409 con mensaje específico.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.mapUniqueViolation(error);
      }
      throw error;
    }
  }

  /**
   * Gap 1 (D-128 / §6.1): alta de stock propio por concesionaria. Crea en UNA
   * transacción: Vehicle + VehicleOwnership (type=company, userId=null,
   * endsAt=null) + VehicleMileage inicial (source=dealership, atribuida a la
   * concesionaria y a su miembro) + VehicleAuditLog (mileage_recorded). Si
   * cualquiera falla, PostgreSQL revierte todo el bloque.
   */
  async createDealershipRegistration(data: RegisterDealershipVehicleData) {
    const {
      dealershipId,
      dealershipMemberId,
      recordedByUserId,
      initialMileage,
      ...vehicleData
    } = data;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();

        const vehicle = await tx.vehicle.create({
          data: {
            ...vehicleData,
            ownerships: {
              create: {
                // D-DB-1 / panel de concesionaria: ownership activo por
                // dealershipId (userId null, endsAt null).
                dealershipId,
                userId: null,
                type: 'company',
                startsAt: now,
                endsAt: null,
              },
            },
          },
          include: {
            // Mismo shape hidratado que create()/list/get (F-010 §10).
            version: { include: { model: { include: { brand: true } } } },
          },
        });

        await tx.vehicleMileage.create({
          data: {
            vehicleId: vehicle.id,
            mileage: initialMileage,
            source: 'dealership',
            recordedAt: now,
            recordedByUserId,
            recordedByDealershipId: dealershipId,
            recordedByDealershipMemberId: dealershipMemberId,
          },
        });

        await tx.vehicleAuditLog.create({
          data: {
            vehicleId: vehicle.id,
            action: 'mileage_recorded',
            field: 'mileage',
            previousValue: null,
            newValue: String(initialMileage),
            actorUserId: recordedByUserId,
            dealershipId,
            dealershipMemberId,
            contextType: 'dealership',
          },
        });

        return vehicle;
      });
    } catch (error) {
      // D-036: mismos únicos (license_plate/vin/engine_number) → 409.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.mapUniqueViolation(error);
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateVehicleDto) {
    // D-042 (red de seguridad, mismo criterio que findByLicensePlate / D-037):
    // si un caller no normalizó la placa, la normalizamos acá para impedir
    // duplicados case-insensitive ("abc123" vs "ABC123") que un constraint
    // unique case-sensitive no detectaría → P2002 no se dispararía.
    const normalizedData =
      typeof data.licensePlate === 'string'
        ? { ...data, licensePlate: data.licensePlate.trim().toUpperCase() }
        : data;

    try {
      return await this.prisma.vehicle.update({
        where: { id },
        data: normalizedData,
        include: {
          // F-010 (§10): hidratar version.model.brand para que la respuesta
          // 200 sea consistente con create()/list/get (contrato unificado).
          version: { include: { model: { include: { brand: true } } } },
        },
      });
    } catch (error) {
      // D-041: los campos únicos (license_plate/vin/engine_number) pueden
      // colisionar al editar → 409 con mensaje específico (como register, D-036).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.mapUniqueViolation(error);
      }
      throw error;
    }
  }

  async delete(id: string) {
    await this.prisma.vehicle.delete({ where: { id } });
  }

  async findById(id: string) {
    return this.prisma.vehicle.findUnique({ where: { id } });
  }

  async findByLicensePlate(plate: string) {
    // D-037: normalizar también al buscar para detectar duplicados
    // case-insensitive ("abc123" vs "ABC123") incluso si el caller
    // no normalizó previamente.
    const normalizedPlate = plate.trim().toUpperCase();
    return this.prisma.vehicle.findUnique({
      where: { licensePlate: normalizedPlate },
    });
  }

  /**
   * Traduce la violación de constraint único (P2002) a 409 CONFLICT con un
   * mensaje específico por campo. Soporta tanto el nombre de columna en BD
   * (license_plate / engine_number) como el nombre de campo Prisma, según lo
   * que reporte meta.target en cada versión del cliente.
   */
  private mapUniqueViolation(
    error: Prisma.PrismaClientKnownRequestError,
  ): ConflictException {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.map(String)
      : [];

    if (target.some((t) => t === 'license_plate' || t === 'licensePlate')) {
      return new ConflictException(
        'Ya existe un vehículo registrado con esa placa',
      );
    }
    if (target.includes('vin')) {
      return new ConflictException(
        'Ya existe un vehículo registrado con ese VIN',
      );
    }
    if (target.some((t) => t === 'engine_number' || t === 'engineNumber')) {
      return new ConflictException(
        'Ya existe un vehículo registrado con ese número de motor',
      );
    }

    return new ConflictException(
      'Ya existe un vehículo registrado con esos datos',
    );
  }
}
