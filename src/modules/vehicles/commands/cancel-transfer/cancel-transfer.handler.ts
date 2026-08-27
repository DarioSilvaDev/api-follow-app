import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CancelTransferCommand } from './cancel-transfer.command';

@Injectable()
export class CancelTransferHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CancelTransferCommand) {
    const transfer = await this.prisma.vehicleTransfer.findUnique({
      where: { id: command.transferId },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer', command.transferId);
    }

    if (transfer.status !== 'pending') {
      throw new BadRequestException('Transfer is not pending');
    }

    if (transfer.fromUserId !== command.userId) {
      throw new ForbiddenException(
        'Only the requester can cancel this transfer',
      );
    }

    const updated = await this.prisma.vehicleTransfer.update({
      where: { id: transfer.id },
      data: { status: 'cancelled', respondedAt: new Date() },
    });

    await this.prisma.vehicleTransferEvent.create({
      data: {
        transferId: transfer.id,
        type: 'cancelled',
        performedByUserId: command.userId,
      },
    });

    return updated;
  }
}
