import { BaseEvent } from '../../../common/events/base-event';

export class AppointmentCreatedEvent extends BaseEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly vehicleId: string,
    public readonly customerId: string,
  ) {
    super('appointment.created');
  }
}
