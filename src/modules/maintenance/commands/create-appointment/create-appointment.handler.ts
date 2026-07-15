import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MAINTENANCE_REPOSITORY } from '../../tokens';
import type { MaintenanceRepository } from '../../repositories/maintenance.repository';
import { AppointmentCreatedEvent } from '../../events/appointment-created.event';
import { CreateAppointmentCommand } from './create-appointment.command';

@Injectable()
export class CreateAppointmentHandler {
  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly repository: MaintenanceRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateAppointmentCommand) {
    const { scheduledFor, ...rest } = command.dto;
    const appointment = await this.repository.createAppointment({
      ...rest,
      scheduledFor: new Date(scheduledFor),
      customerId: command.customerId,
    });

    this.eventEmitter.emit(
      'appointment.created',
      new AppointmentCreatedEvent(
        appointment.id,
        command.dto.vehicleId,
        command.customerId,
      ),
    );

    return appointment;
  }
}
