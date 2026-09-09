import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { RegisterVehicleData, VehicleRepository } from './vehicle.repository';

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

  async update(id: string, data: UpdateVehicleDto) {
    return this.prisma.vehicle.update({ where: { id }, data });
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
      return new ConflictException('Ya existe un vehículo registrado con ese VIN');
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
