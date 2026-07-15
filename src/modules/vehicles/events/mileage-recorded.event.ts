import { BaseEvent } from '../../../common/events/base-event';

export class MileageRecordedEvent extends BaseEvent {
  constructor(
    public readonly vehicleId: string,
    public readonly mileage: number,
  ) {
    super('vehicle.mileage.recorded');
  }
}
