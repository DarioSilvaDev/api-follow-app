import { BaseEvent } from '../../../common/events/base-event';

export class MemberInvitedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly email: string,
    public readonly token: string,
    // D-106: el listener de email necesita el nombre de la concesionaria en
    // el asunto/cuerpo sin hacer un query adicional por dealershipId.
    public readonly dealershipName: string,
  ) {
    super('dealership.member.invited');
  }
}