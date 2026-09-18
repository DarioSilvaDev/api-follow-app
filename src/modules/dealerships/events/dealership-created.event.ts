import { BaseEvent } from '../../../common/events/base-event';

export class DealershipCreatedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly ownerId: string,
  ) {
    super('dealership.created');
  }
}