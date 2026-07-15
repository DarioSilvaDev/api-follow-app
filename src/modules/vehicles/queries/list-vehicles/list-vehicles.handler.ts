import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

interface ListVehiclesQuery {
  userId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListVehiclesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListVehiclesQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where = query.userId
      ? { ownerships: { some: { userId: query.userId, endsAt: null } } }
      : undefined;

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        include: {
          ownerships: {
            where: { endsAt: null },
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          photos: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data: vehicles,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
