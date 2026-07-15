import { BaseEvent } from '../../../common/events/base-event';

export class UserRegisteredEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super('auth.user.registered');
  }
}
