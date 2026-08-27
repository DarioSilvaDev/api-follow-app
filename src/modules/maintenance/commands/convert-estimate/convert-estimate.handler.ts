import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { EstimateStatus } from '@prisma/client';
import { ConvertEstimateCommand } from './convert-estimate.command';

@Injectable()
export class ConvertEstimateHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ConvertEstimateCommand) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: command.id },
      include: { items: true },
    });
    if (!estimate) {
      throw new NotFoundException('Estimate not found');
    }
    if (estimate.status !== EstimateStatus.accepted) {
      throw new BadRequestException(
        'Only accepted estimates can be converted to work orders',
      );
    }

    const number = `WO-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          number,
          vehicleId: estimate.vehicleId,
          workshopId: estimate.workshopId,
          branchId: estimate.branchId,
          customerId: estimate.customerId,
          status: 'open',
        },
      });

      if (estimate.items.length > 0) {
        await tx.workOrderItem.createMany({
          data: estimate.items.map((item) => ({
            workOrderId: workOrder.id,
            type: item.type,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            isTaxable: item.isTaxable,
            sortOrder: item.sortOrder,
          })),
        });
      }

      await tx.estimate.update({
        where: { id: command.id },
        data: {
          status: EstimateStatus.converted,
          workOrderId: workOrder.id,
        },
      });

      return tx.workOrder.findUnique({
        where: { id: workOrder.id },
        include: { items: true },
      });
    });
  }
}
