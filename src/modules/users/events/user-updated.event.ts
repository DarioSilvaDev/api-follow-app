import { BaseEvent } from '../../../common/events/base-event';

export class UserUpdatedEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('user.updated');
  }
}
