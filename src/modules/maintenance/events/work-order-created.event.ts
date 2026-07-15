import { BaseEvent } from '../../../common/events/base-event';

export class WorkOrderCreatedEvent extends BaseEvent {
  constructor(
    public readonly workOrderId: string,
    public readonly number: string,
    public readonly vehicleId: string,
  ) {
    super('work-order.created');
  }
}
