import { BaseEvent } from '../../../common/events/base-event';

/**
 * `vehicle-claim.blocked` — T9: la sesión no es el titular activo (o P2002 de
 * D-155). C-4 avisa al titular y al taller, sin datos del titular en el body.
 */
export class VehicleClaimBlockedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly claimantUserId: string,
  ) {
    super('vehicle-claim.blocked');
  }
}
