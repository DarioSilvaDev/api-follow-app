import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferAcceptedEvent } from '../../events/vehicle-transfer-accepted.event';
import { AcceptTransferCommand } from './accept-transfer.command';

@Injectable()
export class AcceptTransferHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: AcceptTransferCommand) {
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

    if (transfer.expiresAt && new Date() > transfer.expiresAt) {
      await this.prisma.vehicleTransfer.update({
        where: { id: transfer.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Transfer has expired');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const currentOwnership = await tx.vehicleOwnership.findFirst({
        where: { vehicleId: transfer.vehicleId, endsAt: null },
      });

      if (currentOwnership) {
        await tx.vehicleOwnership.update({
          where: { id: currentOwnership.id },
          data: { endsAt: new Date() },
        });

        await tx.vehicleTransferEvent.create({
          data: {
            transferId: transfer.id,
            type: 'ownership_closed',
            performedByUserId: command.userId,
          },
        });
      }

      await tx.vehicleOwnership.create({
        data: {
          vehicleId: transfer.vehicleId,
          userId: transfer.toUserId,
          type: 'owner',
          startsAt: new Date(),
          acquiredByTransferId: transfer.id,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'ownership_created',
          performedByUserId: command.userId,
        },
      });

      const updated = await tx.vehicleTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'completed',
          respondedAt: new Date(),
          completedAt: new Date(),
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'completed',
          performedByUserId: command.userId,
        },
      });

      return updated;
    });

    this.eventEmitter.emit(
      'vehicle.transfer.accepted',
      new VehicleTransferAcceptedEvent(
        transfer.id,
        transfer.vehicleId,
        transfer.fromUserId,
        transfer.toUserId,
      ),
    );

    return result;
  }
}
