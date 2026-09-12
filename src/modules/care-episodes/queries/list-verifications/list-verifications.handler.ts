import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

export const VERIFICATIONS_DEFAULT_LIMIT = 50;
export const VERIFICATIONS_MAX_LIMIT = 100;

/**
 * ListVerificationsHandler — Cola de verificaciones del taller (RF-4).
 *
 * Episodios con source='owner', verification='unverified' y
 * workshopId = contexto del taller; ordenados por serviceDate asc (más antiguos
 * primero) con limit default 50 / max 100 (anti-scraping interno).
 *
 * PII mínima: vehículo (placa + join catálogo) + propietario solo
 * firstName/lastName (sin email/teléfono — patrón de get-vehicle-history: el
 * taller confirma trabajo de un cliente identificable por placa+nombre).
 */
@Injectable()
export class ListVerificationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string, rawLimit?: number) {
    const limit =
      typeof rawLimit === 'number' && Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), VERIFICATIONS_MAX_LIMIT)
        : VERIFICATIONS_DEFAULT_LIMIT;

    const episodes = await this.prisma.careEpisode.findMany({
      where: {
        workshopId,
        source: 'owner',
        verification: 'unverified',
      },
      select: {
        id: true,
        title: true,
        serviceDate: true,
        mileageIn: true,
        customerNotes: true,
        vehicle: {
          select: {
            licensePlate: true,
            manufactureYear: true,
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
            ownerships: {
              where: { endsAt: null },
              orderBy: { startsAt: 'desc' },
              take: 1,
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { serviceDate: 'asc' },
      take: limit,
    });

    return episodes.map((episode) => ({
      id: episode.id,
      title: episode.title ?? null,
      serviceDate: episode.serviceDate,
      mileageIn: episode.mileageIn ?? null,
      notes: episode.customerNotes ?? null,
      vehicle: {
        licensePlate: episode.vehicle.licensePlate,
        brand: episode.vehicle.version?.model?.brand?.name ?? null,
        model: episode.vehicle.version?.model?.name ?? null,
        version: episode.vehicle.version?.name ?? null,
        manufactureYear: episode.vehicle.manufactureYear,
      },
      owner: {
        firstName: episode.vehicle.ownerships[0]?.user.firstName ?? null,
        lastName: episode.vehicle.ownerships[0]?.user.lastName ?? null,
      },
    }));
  }
}
