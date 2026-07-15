import { BaseEvent } from '../../../common/events/base-event';

export class PasswordResetRequestedEvent extends BaseEvent {
  constructor(
    public readonly email: string,
    public readonly token: string,
  ) {
    super('auth.password_reset.requested');
  }
}
