import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/constants';

interface ListWorkshopsQuery {
  page?: number;
  limit?: number;
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

    const [workshops, total] = await Promise.all([
      this.prisma.workshop.findMany({
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
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workshop.count(),
    ]);

    return {
      data: workshops,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
