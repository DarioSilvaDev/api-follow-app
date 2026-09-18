import { BaseEvent } from '../../../common/events/base-event';

export class MemberJoinedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly userId: string,
  ) {
    super('dealership.member.joined');
  }
}