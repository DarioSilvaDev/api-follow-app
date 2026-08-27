import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { RejectTransferCommand } from './reject-transfer.command';

@Injectable()
export class RejectTransferHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RejectTransferCommand) {
    const transfer = await this.prisma.vehicleTransfer.findUnique({
      where: { id: command.transferId },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer', command.transferId);
    }

    if (transfer.status !== 'pending') {
      throw new BadRequestException('Transfer is not pending');
    }

    if (transfer.toUserId !== command.userId) {
      throw new ForbiddenException('This transfer is not addressed to you');
    }

    const updated = await this.prisma.vehicleTransfer.update({
      where: { id: transfer.id },
      data: { status: 'rejected', respondedAt: new Date() },
    });

    await this.prisma.vehicleTransferEvent.create({
      data: {
        transferId: transfer.id,
        type: 'rejected',
        performedByUserId: command.userId,
      },
    });

    return updated;
  }
}
