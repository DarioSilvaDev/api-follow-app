import type { VehicleClaimOutcome } from '@prisma/client';
import { BaseEvent } from '../../../common/events/base-event';

/** `vehicle-claim.claimed` — T7/T8. Aviso pasivo al taller + mail reclamante. */
export class VehicleClaimClaimedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly claimantUserId: string,
    public readonly outcome: VehicleClaimOutcome,
  ) {
    super('vehicle-claim.claimed');
  }
}
