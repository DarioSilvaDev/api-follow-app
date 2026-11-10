import { BaseEvent } from '../../../common/events/base-event';

/**
 * `vehicle-claim.invited` — T1: se creó o reactivó un invite de reclamo.
 *
 * No transporta token, hash ni link (S-1): los consumidores correlacionan por
 * `inviteId`. C-4 decide si el dueño tiene cuenta para el mail de invitación.
 */
export class VehicleClaimInvitedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly ownerPhone: string | null,
    public readonly reactivated: boolean,
  ) {
    super('vehicle-claim.invited');
  }
}
