import { Inject, Injectable } from '@nestjs/common';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { AddWorkOrderItemCommand } from './add-work-order-item.command';

@Injectable()
export class AddWorkOrderItemHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
  ) {}

  async execute(command: AddWorkOrderItemCommand) {
    const existing = await this.repository.findWorkOrderById(
      command.workOrderId,
    );
    if (!existing)
      throw new NotFoundException('WorkOrder', command.workOrderId);
    return this.repository.addWorkOrderItem(command.workOrderId, command.dto);
  }
}
