import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { escapeLike } from './escape-like';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 50;
export const SEARCH_TAKE = 10;

/**
 * SearchWorkshopsHandler — Búsqueda pública acotada de talleres (RF-8 / D-065).
 *
 * Solo talleres activos; `contains` + `mode: 'insensitive'` con escapeLike
 * (input como texto literal). Orden alfabético, take fijo 10.
 * La "ciudad" proviene de la sucursal central (isHeadquarters, take 1) para
 * no exponer el listado completo de sucursales al propietario.
 */
@Injectable()
export class SearchWorkshopsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(q: string) {
    if (!q || q.trim().length < SEARCH_MIN_LENGTH) {
      throw new BadRequestException(
        `q must be at least ${SEARCH_MIN_LENGTH} characters`,
      );
    }
    const trimmed = q.trim();
    if (trimmed.length > SEARCH_MAX_LENGTH) {
      throw new BadRequestException(
        `q must be at most ${SEARCH_MAX_LENGTH} characters`,
      );
    }

    const workshops = await this.prisma.workshop.findMany({
      where: {
        isActive: true,
        name: { contains: escapeLike(trimmed), mode: 'insensitive' },
      },
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
      take: SEARCH_TAKE,
    });

    return workshops.map((workshop) => ({
      id: workshop.id,
      name: workshop.name,
      logoUrl: workshop.logoUrl,
      city: workshop.branches[0]?.city ?? null,
    }));
  }
}
