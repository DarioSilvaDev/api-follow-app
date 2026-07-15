import { Injectable } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

interface ListWorkOrdersQuery {
  workshopId?: string;
  vehicleId?: string;
  customerId?: string;
  status?: WorkOrderStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListWorkOrdersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkOrdersQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.workshopId) where.workshopId = query.workshopId;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;

    const [workOrders, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { items: true, serviceRecords: true } },
          vehicle: { select: { id: true, licensePlate: true } },
        },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data: workOrders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
