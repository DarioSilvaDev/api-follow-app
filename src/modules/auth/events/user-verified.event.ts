import { BaseEvent } from '../../../common/events/base-event';

export class UserVerifiedEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('auth.user.verified');
  }
}
