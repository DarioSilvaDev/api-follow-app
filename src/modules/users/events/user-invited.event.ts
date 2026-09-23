import { BaseEvent } from '../../../common/events/base-event';

/**
 * D-106: se creó una invitación para un usuario de plataforma (panel admin).
 * El token viaja en el payload SOLO para que el listener de email construya
 * el link del wizard `${FRONTEND_URL}/invitations/{token}?kind=user`. Nunca se
 * devuelve en respuestas HTTP.
 */
export class UserInvitedEvent extends BaseEvent {
  constructor(
    public readonly email: string,
    public readonly token: string,
    public readonly roleType: string,
    public readonly roleName: string,
  ) {
    super('user.invited');
  }
}