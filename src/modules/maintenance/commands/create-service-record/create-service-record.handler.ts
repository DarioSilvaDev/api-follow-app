import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { ServiceRecordedEvent } from '../../events/service-recorded.event';
import { CreateServiceRecordCommand } from './create-service-record.command';

@Injectable()
export class CreateServiceRecordHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateServiceRecordCommand) {
    const record = await this.repository.createServiceRecord({
      ...command.dto,
      serviceDate: new Date(command.dto.serviceDate),
      totalCost: command.dto.totalCost
        ? Number(command.dto.totalCost)
        : undefined,
    });

    this.eventEmitter.emit(
      'service.recorded',
      new ServiceRecordedEvent(
        record.id,
        command.dto.vehicleId,
        command.dto.mileageAtService,
      ),
    );

    return record;
  }
}
