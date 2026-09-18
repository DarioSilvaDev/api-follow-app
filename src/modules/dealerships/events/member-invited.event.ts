import { BaseEvent } from '../../../common/events/base-event';

export class MemberInvitedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly email: string,
    public readonly token: string,
  ) {
    super('dealership.member.invited');
  }
}