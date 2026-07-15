import { BaseEvent } from '../../../common/events/base-event';

export class ServiceRecordedEvent extends BaseEvent {
  constructor(
    public readonly serviceRecordId: string,
    public readonly vehicleId: string,
    public readonly mileageAtService: number,
  ) {
    super('service.recorded');
  }
}
