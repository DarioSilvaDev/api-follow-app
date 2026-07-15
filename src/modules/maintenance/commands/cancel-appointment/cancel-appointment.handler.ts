import { Inject, Injectable } from '@nestjs/common';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CancelAppointmentCommand } from './cancel-appointment.command';

@Injectable()
export class CancelAppointmentHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
  ) {}

  async execute(command: CancelAppointmentCommand) {
    const existing = await this.repository.findAppointmentById(command.id);
    if (!existing) throw new NotFoundException('Appointment', command.id);
    return this.repository.cancelAppointment(command.id, command.reason);
  }
}
