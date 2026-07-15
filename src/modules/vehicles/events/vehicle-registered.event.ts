import { BaseEvent } from '../../../common/events/base-event';

export class VehicleRegisteredEvent extends BaseEvent {
  constructor(
    public readonly vehicleId: string,
    public readonly ownerId: string,
    public readonly licensePlate: string,
  ) {
    super('vehicle.registered');
  }
}
