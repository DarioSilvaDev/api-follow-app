import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { WorkOrderCreatedEvent } from '../../events/work-order-created.event';
import { CreateWorkOrderCommand } from './create-work-order.command';

@Injectable()
export class CreateWorkOrderHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateWorkOrderCommand) {
    const workOrder = await this.repository.createWorkOrder({
      ...command.dto,
      customerId: command.customerId,
      number: command.number,
    });

    this.eventEmitter.emit(
      'work-order.created',
      new WorkOrderCreatedEvent(
        workOrder.id,
        workOrder.number,
        command.dto.vehicleId,
      ),
    );

    return workOrder;
  }
}
