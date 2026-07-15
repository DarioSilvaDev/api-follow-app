import { Inject, Injectable } from '@nestjs/common';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { CreateEstimateCommand } from './create-estimate.command';

@Injectable()
export class CreateEstimateHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
  ) {}

  async execute(command: CreateEstimateCommand) {
    const subtotal = command.dto.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );
    const taxAmount = command.dto.taxRate
      ? subtotal * (command.dto.taxRate / 100)
      : 0;
    const total = subtotal + taxAmount;

    return this.repository.createEstimate({
      ...command.dto,
      customerId: command.customerId,
      number: command.number,
      validUntil: command.dto.validUntil
        ? new Date(command.dto.validUntil)
        : undefined,
      subtotal,
      taxAmount: command.dto.taxRate ? taxAmount : undefined,
      total,
    });
  }
}
