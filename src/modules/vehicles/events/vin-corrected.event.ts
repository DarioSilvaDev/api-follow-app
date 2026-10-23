import { BaseEvent } from '../../../common/events/base-event';

export class VehicleVinCorrectedEvent extends BaseEvent {
  constructor(
    public readonly vehicleId: string,
    public readonly previousVin: string | null,
    public readonly newVin: string,
  ) {
    super('vehicle.vin.corrected');
  }
}

