import { BaseEvent } from '../../../common/events/base-event';

export class UserLoggedInEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('auth.user.logged_in');
  }
}
