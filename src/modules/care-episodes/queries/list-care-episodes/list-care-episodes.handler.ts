import { Injectable } from '@nestjs/common';
import type {
  CareEpisodeSource,
  CareEpisodeStatus,
  CareEpisodeVerification,
  Prisma,
} from '@prisma/client';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';
import { PrismaService } from '../../../../common/database/prisma.service';
import { formatDateOnly } from '../../../../common/dates/date-only';

export interface ListCareEpisodesQuery {
  workshopId: string;
  page?: number;
  limit?: number;
  q?: string;
}

/**
 * CareEpisodeListItem — fila del listado de atenciones del taller (F-023 RF-4).
 *
 * Contrato exhaustivo: solo los campos listados en RF-4. Sin PII del
 * propietario (D-F023-2), sin internalNotes / customerComplaint /
 * customerNotes, y sin los timestamps crudos (serviceDate / checkedInAt /
 * createdAt) — solo la fecha canónica D-070 pre-computada.
 */
export interface CareEpisodeListItem {
  id: string;
  vehicleId: string;
  title: string | null;
  status: CareEpisodeStatus;
  source: CareEpisodeSource;
  /** `null` cuando la verificación no aplica (source='workshop'). */
  verification: CareEpisodeVerification | null;
  /**
   * Fecha canónica D-070 (serviceDate ?? checkedInAt ?? createdAt). Siempre ISO
   * no-null: es la clave de orden del listado y NO cambia (D-TZ-4).
   */
  canonicalDate: string;
  /**
   * Fecha calendario para MOSTRAR (`YYYY-MM-DD`), derivada de `serviceDate`.
   * `null` si y solo si `serviceDate` es `null` (aditivo, no reemplaza a
   * `canonicalDate`). No usar "episodio de taller" como sinónimo: el seed tiene
   * episodios workshop con `serviceDate`.
   */
  canonicalDateOnly: string | null;
  mileageIn: number | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
}

/** Envelope meta — patrón idéntico a los listados admin/vehicles. */
export interface CareEpisodeListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * ListCareEpisodesHandler — Listado paginado de atenciones del taller (F-023).
 *
 * Workshop-scoped (workshopId del contexto WORKSHOP, RF-1), orden canónico
 * D-070 desc (RF-2) + paginación page-based con DEFAULT_PAGE_SIZE = 20
 * (D-F023-3 / D-TL-F023-3).
 *
 * Único filtro (D-F023-1a, enmienda de D-F023-1): búsqueda por patente vía
 * `q` — normalización idéntica a list-vehicles (D-044): trim, mínimo 2
 * caracteres tras trim (si no, se comporta como sin `q`), slice(0, 20) por
 * `licensePlate @db.VarChar(20)`, `contains` case-insensitive. Ignora case
 * pero NO separadores. Sin otros filtros.
 *
 * Estrategia en dos fases (D-TL-F023-3):
 *   1. count + query ligera (4 columnas escalares, sin select de joins) del
 *      taller — con `q` activo, filtrada por patente vía nested filter a
 *      `vehicle` (D-F023-1a).
 *   2. sort JS del coalesce D-070 → slice de la página → fetch detallado
 *      (con join de catálogo) SOLO de los ids de la página → reordenar.
 *
 * El orden NO se delega a Prisma orderBy: el compuesto no replica el
 * coalesce cuando serviceDate es null y checkedInAt está seteado (rechazo
 * TL en 2-3; misma semántica exacta que get-vehicle-history.handler.ts).
 */
@Injectable()
export class ListCareEpisodesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ workshopId, page, limit, q: rawQParam }: ListCareEpisodesQuery) {
    const safePage =
      typeof page === 'number' && Number.isFinite(page)
        ? Math.max(1, Math.trunc(page))
        : 1;
    const safeLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    // D-F023-1a (enmienda de D-F023-1): búsqueda por patente — mismo contrato
    // exacto que list-vehicles (D-044). Guard `typeof`: `?q=a&q=b` llega como
    // array y `.trim()` explotaría. Mínimo 2 caracteres tras trim; con menos,
    // se comporta como sin `q` (NO 400). slice(0, 20) alinea con
    // `licensePlate @db.VarChar(20)`.
    const rawQ = typeof rawQParam === 'string' ? rawQParam : '';
    const q = rawQ.trim().length >= 2 ? rawQ.trim().slice(0, 20) : '';
    const where: Prisma.CareEpisodeWhereInput = q
      ? {
          workshopId,
          vehicle: { licensePlate: { contains: q, mode: 'insensitive' } },
        }
      : { workshopId };

    // Fase 1 — total + filas ligeras (mismo patrón Promise.all que
    // list-vehicles: ambas consultas son independientes). Con `q` activo el
    // `where` incluye un nested filter a `vehicle` (to-one) — el filtro va
    // ANTES del sort D-070 para que `total`/`totalPages` sean consistentes.
    const [total, lightRows] = await Promise.all([
      this.prisma.careEpisode.count({ where }),
      this.prisma.careEpisode.findMany({
        where,
        select: {
          id: true,
          serviceDate: true,
          checkedInAt: true,
          createdAt: true,
        },
      }),
    ]);

    // Orden D-070 en JS (coalesce desc + tiebreak createdAt desc) y slice
    // de la página → ≤ limit ids. Página fuera de rango → slice vacío
    // (200 con data: [], no 404 — mismo contrato que los listados existentes).
    const pageRows = this.sortCareEpisodes(lightRows).slice(
      (safePage - 1) * safeLimit,
      safePage * safeLimit,
    );

    if (pageRows.length === 0) {
      return {
        data: [] as CareEpisodeListItem[],
        meta: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        },
      };
    }

    // Fase 2 — detalles SOLO de la página (join de catálogo, PII-excluido).
    const pageIds = pageRows.map((row) => row.id);
    const details = await this.prisma.careEpisode.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        vehicleId: true,
        title: true,
        status: true,
        source: true,
        verification: true,
        serviceDate: true,
        mileageIn: true,
        checkedInAt: true,
        createdAt: true,
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
          },
        },
      },
    });

    // El `in` de Prisma no preserva orden: reordenar según la posición del
    // sort (map id → índice).
    const rank = new Map(pageRows.map((row, index) => [row.id, index]));
    details.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    return {
      data: details.map((episode): CareEpisodeListItem => ({
        id: episode.id,
        vehicleId: episode.vehicleId,
        title: episode.title,
        status: episode.status,
        source: episode.source,
        verification: episode.verification,
        canonicalDate: this.canonicalDate(episode).toISOString(),
        canonicalDateOnly: formatDateOnly(episode.serviceDate),
        mileageIn: episode.mileageIn,
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
          manufactureYear: episode.vehicle.manufactureYear,
        },
      })),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  /** D-070: serviceDate ?? checkedInAt ?? createdAt (createdAt es NOT NULL). */
  private canonicalDate(episode: {
    serviceDate: Date | null;
    checkedInAt: Date | null;
    createdAt: Date;
  }): Date {
    return episode.serviceDate ?? episode.checkedInAt ?? episode.createdAt;
  }

  /**
   * D-070: sort por timestamp canónico desc, tiebreak createdAt desc
   * (orden determinista — espejo exacto de sortCareEpisodes en
   * get-vehicle-history.handler.ts).
   */
  private sortCareEpisodes<
    T extends {
      serviceDate: Date | null;
      checkedInAt: Date | null;
      createdAt: Date;
    },
  >(episodes: T[]): T[] {
    return [...episodes].sort((a, b) => {
      const keyA = new Date(
        a.serviceDate ?? a.checkedInAt ?? a.createdAt,
      ).getTime();
      const keyB = new Date(
        b.serviceDate ?? b.checkedInAt ?? b.createdAt,
      ).getTime();
      if (keyB !== keyA) return keyB - keyA; // desc by canonical timestamp
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // tiebreak: createdAt desc
    });
  }
}
