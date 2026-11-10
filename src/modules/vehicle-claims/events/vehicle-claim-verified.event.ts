import { BaseEvent } from '../../../common/events/base-event';

/**
 * `vehicle-claim.verified` — T5 superado. Sólo log/auditoría (sin mail).
 * Se emite post-commit; no transporta token ni hash (S-1).
 */
export class VehicleClaimVerifiedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
  ) {
    super('vehicle-claim.verified');
  }
}
