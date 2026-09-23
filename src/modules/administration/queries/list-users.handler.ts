import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SystemRoleType } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/constants';

interface ListUsersQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  role?: string;
}

const USER_STATUS_FILTERS = ['pending', 'active', 'suspended'] as const;
const PLATFORM_ROLE_FILTERS = ['admin', 'support'] as const;

@Injectable()
export class ListUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListUsersQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // Búsqueda de texto libre por email/nombre. Igual que search-workshops:
    // menos de 2 caracteres es un error de validación explícito (400), no
    // un filtro vacío silencioso.
    if (query.q !== undefined) {
      const q = query.q.trim();
      if (q.length < 2) {
        throw new BadRequestException(
          'El filtro q debe tener al menos 2 caracteres',
        );
      }
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.status !== undefined) {
      const valid = (USER_STATUS_FILTERS as readonly string[]).includes(
        query.status,
      );
      if (!valid) {
        throw new BadRequestException(
          `El filtro status debe ser uno de: ${USER_STATUS_FILTERS.join(', ')}`,
        );
      }
      where.status = query.status as Prisma.UserWhereInput['status'];
    }

    // Filtro por rol de plataforma (admin/support): los roles asignables
    // desde el panel. Se aplica sobre el systemRoleAssignment vigente.
    if (query.role !== undefined) {
      const valid = (PLATFORM_ROLE_FILTERS as readonly string[]).includes(
        query.role,
      );
      if (!valid) {
        throw new BadRequestException(
          `El filtro role debe ser uno de: ${PLATFORM_ROLE_FILTERS.join(', ')}`,
        );
      }
      where.systemRoleAssignments = {
        some: { role: { type: query.role as SystemRoleType } },
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          systemRoleAssignments: {
            include: { role: true },
          },
        },
        // P5: pendientes primero (orden del enum en PG), luego los más
        // recientes — espejo de workshops/dealerships.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
