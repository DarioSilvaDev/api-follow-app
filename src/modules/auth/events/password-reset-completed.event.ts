import { BaseEvent } from '../../../common/events/base-event';

export class PasswordResetCompletedEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('auth.password_reset.completed');
  }
}
