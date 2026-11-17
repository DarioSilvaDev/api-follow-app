import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { escapeLike } from '../search-workshops/escape-like';

export const CATALOG_SEARCH_MIN_LENGTH = 2;
export const CATALOG_SEARCH_MAX_LENGTH = 50;
export const CATALOG_DEFAULT_PAGE = 1;
export const CATALOG_DEFAULT_LIMIT = 10;
export const CATALOG_MAX_LIMIT = 50;

function sanitizePositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export interface ListWorkshopCatalogQuery {
  q?: string;
  page?: number;
  limit?: number;
}

/**
 * ListWorkshopCatalogHandler — Catálogo público paginado de talleres
 * activos (selector de "Taller responsable" del flujo owner, RF-8 / D-066).
 *
 * Complemento paginado de `SearchWorkshopsHandler` (take fijo 10, sin
 * total): mismo criterio de exposición mínima ({id, name, logoUrl, city}
 * de la sede, sin taxId/email/branches), pero con envelope
 * `{ data, meta }` page-based para "cargar más" incremental en el bottom
 * sheet.
 *
 * - `q` opcional; si está presente y trimmed < 2 chars (o > 50) → 400,
 *   mismo contrato que `/workshops/search`. Sin `q` → catálogo completo
 *   (orden alfabético), usado para sugerencias y primer render del sheet.
 * - Solo talleres activos; `contains` + `mode: 'insensitive'` con
 *   escapeLike (input como texto literal).
 */
@Injectable()
export class ListWorkshopCatalogHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkshopCatalogQuery) {
    const page = sanitizePositiveInt(query.page, CATALOG_DEFAULT_PAGE);
    const limit = Math.min(
      sanitizePositiveInt(query.limit, CATALOG_DEFAULT_LIMIT),
      CATALOG_MAX_LIMIT,
    );
    const skip = (page - 1) * limit;

    const trimmed = query.q?.trim() ?? '';
    let where: Prisma.WorkshopWhereInput = { isActive: true };
    if (trimmed.length > 0) {
      if (trimmed.length < CATALOG_SEARCH_MIN_LENGTH) {
        throw new BadRequestException(
          `q must be at least ${CATALOG_SEARCH_MIN_LENGTH} characters`,
        );
      }
      if (trimmed.length > CATALOG_SEARCH_MAX_LENGTH) {
        throw new BadRequestException(
          `q must be at most ${CATALOG_SEARCH_MAX_LENGTH} characters`,
        );
      }
      where = {
        isActive: true,
        name: { contains: escapeLike(trimmed), mode: 'insensitive' },
      };
    }

    const [workshops, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          logoUrl: true,
          branches: {
            where: { isHeadquarters: true },
            take: 1,
            select: { city: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return {
      data: workshops.map((workshop) => ({
        id: workshop.id,
        name: workshop.name,
        logoUrl: workshop.logoUrl,
        city: workshop.branches[0]?.city ?? null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
