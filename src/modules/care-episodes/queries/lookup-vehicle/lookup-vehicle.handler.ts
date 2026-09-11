import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * LookupVehicleHandler — Búsqueda de vehículo por placa exacta para el taller.
 *
 * RF-2 / P2-3: El lookup está ubicado en el módulo care-episodes (NO en
 * vehicles), evitando el foot-gun de @Get(':id') del módulo vehicles (F-012).
 *
 * D-037 / D-042: La placa se normaliza (trim + uppercase) antes de consultar.
 *
 * Devuelve únicamente los campos necesarios para el check-in SIN PII del
 * propietario ni datos sensibles del vehículo (sin VIN, sin engineNumber).
 */
@Injectable()
export class LookupVehicleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(rawPlate: string) {
    // D-037 / D-042: normalize (trim + uppercase)
    const plate = rawPlate.trim().toUpperCase();

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { licensePlate: plate },
      select: {
        id: true,
        licensePlate: true,
        manufactureYear: true,
        modelYear: true,
        version: {
          select: {
            name: true,
            model: {
              select: {
                name: true,
                brand: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', plate);
    }

    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      brand: vehicle.version?.model?.brand?.name ?? null,
      model: vehicle.version?.model?.name ?? null,
      version: vehicle.version?.name ?? null,
      manufactureYear: vehicle.manufactureYear,
      modelYear: vehicle.modelYear,
    };
  }
}
