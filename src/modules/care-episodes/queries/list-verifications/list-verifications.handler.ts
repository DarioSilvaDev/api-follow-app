import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { formatDateOnly } from '../../../../common/dates/date-only';

export const VERIFICATIONS_DEFAULT_LIMIT = 50;
export const VERIFICATIONS_MAX_LIMIT = 100;

/**
 * CareEpisodeVerificationItem — fila de la cola de verificaciones (RF-4).
 *
 * `serviceDate` es fecha **calendario** (`YYYY-MM-DD`, D-TZ-1/D-TZ-4) y puede
 * ser `null`. El tipo explícito evita el drift que tenía el retorno inferido.
 */
export interface CareEpisodeVerificationItem {
  id: string;
  /** Vehículo del episodio — deep-link al detalle (`/vehicles/:id/servicios/:id`). */
  vehicleId: string;
  title: string | null;
  /** Fecha calendario `YYYY-MM-DD` (NO un instante ISO). */
  serviceDate: string | null;
  mileageIn: number | null;
  notes: string | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    manufactureYear: number | null;
  };
  owner: {
    firstName: string | null;
    lastName: string | null;
  };
}

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

  async execute(
    workshopId: string,
    rawLimit?: number,
  ): Promise<CareEpisodeVerificationItem[]> {
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
        // vehicleId: aditivo para deep-link al detalle del episodio desde la
        // cola del taller (GET /care-episodes/:id). No es PII nueva — la cola
        // ya expone la placa y el detalle lo devuelve igual.
        vehicleId: true,
        title: true,
        serviceDate: true,
        mileageIn: true,
        customerNotes: true,
        vehicle: {
          select: {
            licensePlate: true,
            manufactureYear: true,
            brandName: true,
            modelName: true,
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

    return episodes.map((episode): CareEpisodeVerificationItem => ({
      id: episode.id,
      vehicleId: episode.vehicleId,
      title: episode.title ?? null,
      // D-TZ-4: fecha calendario → `YYYY-MM-DD` (null si no hay serviceDate).
      serviceDate: formatDateOnly(episode.serviceDate),
      mileageIn: episode.mileageIn ?? null,
      notes: episode.customerNotes ?? null,
      vehicle: {
        licensePlate: episode.vehicle.licensePlate,
        brand:
          episode.vehicle.version?.model?.brand?.name ??
          episode.vehicle.brandName ??
          null,
        model:
          episode.vehicle.version?.model?.name ??
          episode.vehicle.modelName ??
          null,
        version: episode.vehicle.version?.name ?? null,
        manufactureYear: episode.vehicle.manufactureYear,
      },
      owner: {
        firstName: episode.vehicle.ownerships[0]?.user?.firstName ?? null,
        lastName: episode.vehicle.ownerships[0]?.user?.lastName ?? null,
      },
    }));
  }
}
