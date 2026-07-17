import { BaseEvent } from '../../../common/events/base-event';

export class EmailVerificationSentEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly token: string,
  ) {
    super('auth.email.verification.sent');
  }
}
