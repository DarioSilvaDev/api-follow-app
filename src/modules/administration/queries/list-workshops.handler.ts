import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/constants';

/**
 * D-106: listado de talleres del panel de administración con foco en
 * onboarding:
 * - filtro opcional por status (pending_claim | active);
 * - última invitación pending/accepted (para el estado de la invitación);
 * - members (para el DTO del owner / conteos legacy).
 */
export interface ListWorkshopsQuery {
  page?: number;
  limit?: number;
  status?: 'pending_claim' | 'active';
}

@Injectable()
export class ListWorkshopsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkshopsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.WorkshopWhereInput = {};
    if (query.status === 'pending_claim' || query.status === 'active') {
      where.status = query.status;
    }

    const [workshops, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        skip,
        take: limit,
        include: {
          branches: {
            select: { id: true },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              role: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          invitations: {
            where: { status: { in: ['pending', 'accepted'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return {
      data: workshops,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}