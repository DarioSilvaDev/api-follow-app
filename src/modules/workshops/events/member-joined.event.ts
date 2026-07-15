import { BaseEvent } from '../../../common/events/base-event';

export class MemberJoinedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly userId: string,
  ) {
    super('workshop.member.joined');
  }
}
