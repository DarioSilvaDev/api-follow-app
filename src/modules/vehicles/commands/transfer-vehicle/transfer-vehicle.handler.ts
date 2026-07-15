import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferredEvent } from '../../events/vehicle-transferred.event';
import { TransferVehicleCommand } from './transfer-vehicle.command';

@Injectable()
export class TransferVehicleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: TransferVehicleCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
      include: {
        ownerships: { where: { endsAt: null }, take: 1 },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', command.vehicleId);
    }

    const currentOwnership = vehicle.ownerships[0];
    if (!currentOwnership || currentOwnership.userId !== command.fromUserId) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.vehicleOwnership.update({
        where: { id: currentOwnership.id },
        data: { endsAt: new Date() },
      });

      const transfer = await tx.vehicleTransfer.create({
        data: {
          vehicleId: command.vehicleId,
          fromUserId: command.fromUserId,
          toUserId: command.dto.toUserId,
          status: 'completed',
          requestedAt: new Date(),
          completedAt: new Date(),
          notes: command.dto.notes,
        },
      });

      const ownership = await tx.vehicleOwnership.create({
        data: {
          vehicleId: command.vehicleId,
          userId: command.dto.toUserId,
          type: 'owner',
          startsAt: new Date(),
          acquiredByTransferId: transfer.id,
        },
      });

      return { transfer, ownership };
    });

    this.eventEmitter.emit(
      'vehicle.transferred',
      new VehicleTransferredEvent(
        command.vehicleId,
        command.fromUserId,
        command.dto.toUserId,
      ),
    );

    return result.transfer;
  }
}
