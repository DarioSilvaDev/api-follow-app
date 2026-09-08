import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
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

    // Security Review #14 (P1): mileage must be monotonic (non-decreasing).
    // Compare against the last recorded mileage of this vehicle. When there is
    // no previous record the new value is permitted.
    const lastRecord = await this.prisma.vehicleMileage.findFirst({
      where: { vehicleId: command.vehicleId },
      orderBy: { recordedAt: 'desc' },
      select: { mileage: true },
    });

    if (lastRecord && command.dto.mileage < lastRecord.mileage) {
      throw new CodedHttpException(
        HttpStatus.BAD_REQUEST,
        'Mileage must be greater than or equal to last recorded',
        ERROR_CODES.VALIDATION_ERROR,
        { mileage: 'km must be greater than or equal to last recorded' },
      );
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
