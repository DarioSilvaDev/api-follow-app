import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetWorkOrderHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        vehicle: { select: { id: true, licensePlate: true } },
        workshop: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!workOrder) throw new NotFoundException('WorkOrder', id);
    return workOrder;
  }
}
