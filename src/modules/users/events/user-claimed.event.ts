import { BaseEvent } from '../../../common/events/base-event';

/**
 * D-106: un usuario activó su cuenta de plataforma a través del wizard de
 * invitación (post-commit). El rol lo determina la invitación.
 */
export class UserClaimedEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly roleType: string,
  ) {
    super('user.claimed');
  }
}