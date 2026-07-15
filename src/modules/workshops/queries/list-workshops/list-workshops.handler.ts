import { Injectable } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

interface ListWorkshopsQuery {
  userId?: string;
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

    const where = query.userId
      ? {
          members: {
            some: { userId: query.userId, status: MemberStatus.active },
          },
        }
      : undefined;

    const [workshops, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { members: true, branches: true } },
          branches: { where: { isHeadquarters: true }, take: 1 },
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
