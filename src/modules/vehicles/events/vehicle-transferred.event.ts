import { BaseEvent } from '../../../common/events/base-event';

export class VehicleTransferredEvent extends BaseEvent {
  constructor(
    public readonly vehicleId: string,
    public readonly fromUserId: string,
    public readonly toUserId: string,
  ) {
    super('vehicle.transferred');
  }
}
