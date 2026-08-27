import { BaseEvent } from '../../../common/events/base-event';

export class VehicleTransferRequestedEvent extends BaseEvent {
  constructor(
    public readonly transferId: string,
    public readonly vehicleId: string,
    public readonly fromUserId: string,
    public readonly toUserId: string,
  ) {
    super('vehicle.transfer.requested');
  }
}
