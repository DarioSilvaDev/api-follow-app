import { BaseEvent } from '../../../common/events/base-event';

export class UserCreatedEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super('user.created');
  }
}
