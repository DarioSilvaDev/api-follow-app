import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MileageRecordedEvent } from '../../events/mileage-recorded.event';
import { RecordMileageCommand } from './record-mileage.command';

@Injectable()
export class RecordMileageHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RecordMileageCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', command.vehicleId);
    }

    const mileage = await this.prisma.vehicleMileage.create({
      data: {
        vehicleId: command.vehicleId,
        recordedByUserId: command.recordedByUserId,
        mileage: command.dto.mileage,
        source: command.dto.source,
        notes: command.dto.notes,
        recordedAt: new Date(),
      },
    });

    this.eventEmitter.emit(
      'vehicle.mileage.recorded',
      new MileageRecordedEvent(command.vehicleId, command.dto.mileage),
    );

    return mileage;
  }
}
