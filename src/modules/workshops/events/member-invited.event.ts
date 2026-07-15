import { BaseEvent } from '../../../common/events/base-event';

export class MemberInvitedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly email: string,
    public readonly token: string,
  ) {
    super('workshop.member.invited');
  }
}
