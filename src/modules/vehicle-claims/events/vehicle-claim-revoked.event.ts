import type { VehicleClaimRevokeReason } from '@prisma/client';
import { BaseEvent } from '../../../common/events/base-event';

/** `vehicle-claim.revoked` — T13/T14/T19. */
export class VehicleClaimRevokedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly reason: VehicleClaimRevokeReason,
    public readonly autoRevoked: boolean,
  ) {
    super('vehicle-claim.revoked');
  }
}
