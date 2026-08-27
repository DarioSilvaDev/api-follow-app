import { BaseEvent } from '../../../common/events/base-event';
import { UserStatus } from '@prisma/client';

export class UserStatusChangedEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly status: UserStatus,
  ) {
    super('admin.user.status_changed');
  }
}
