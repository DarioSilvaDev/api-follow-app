import { Inject, Injectable } from '@nestjs/common';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { UpdateWorkOrderStatusCommand } from './update-work-order-status.command';

@Injectable()
export class UpdateWorkOrderStatusHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
  ) {}

  async execute(command: UpdateWorkOrderStatusCommand) {
    const existing = await this.repository.findWorkOrderById(command.id);
    if (!existing) throw new NotFoundException('WorkOrder', command.id);
    return this.repository.updateWorkOrderStatus(command.id, command.status);
  }
}
