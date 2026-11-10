import { BaseEvent } from '../../../common/events/base-event';

/** `vehicle-claim.manual-review` — T6: sin dato verificable o "No lo sé". */
export class VehicleClaimManualReviewEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
  ) {
    super('vehicle-claim.manual-review');
  }
}
