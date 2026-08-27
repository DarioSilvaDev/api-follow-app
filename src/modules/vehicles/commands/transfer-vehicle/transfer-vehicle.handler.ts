import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferRequestedEvent } from '../../events/vehicle-transfer-requested.event';
import { TransferVehicleCommand } from './transfer-vehicle.command';

@Injectable()
export class TransferVehicleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: TransferVehicleCommand) {
    const targetUser = await this.prisma.user.findUnique({
      where: { email: command.dto.email },
    });
    if (!targetUser) {
      throw new BadRequestException(
        `User with email '${command.dto.email}' not found`,
      );
    }

    if (targetUser.id === command.fromUserId) {
      throw new BadRequestException('Cannot transfer vehicle to yourself');
    }

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

    const existingPending = await this.prisma.vehicleTransfer.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
      },
    });
    if (existingPending) {
      throw new BadRequestException(
        'There is already a pending transfer for this vehicle',
      );
    }

    const transfer = await this.prisma.vehicleTransfer.create({
      data: {
        vehicleId: command.vehicleId,
        fromUserId: command.fromUserId,
        toUserId: targetUser.id,
        status: 'pending',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes: command.dto.notes,
      },
    });

    await this.prisma.vehicleTransferEvent.create({
      data: {
        transferId: transfer.id,
        type: 'requested',
        performedByUserId: command.fromUserId,
      },
    });

    this.eventEmitter.emit(
      'vehicle.transfer.requested',
      new VehicleTransferRequestedEvent(
        transfer.id,
        command.vehicleId,
        command.fromUserId,
        targetUser.id,
      ),
    );

    return transfer;
  }
}
