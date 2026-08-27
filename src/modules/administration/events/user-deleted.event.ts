import { BaseEvent } from '../../../common/events/base-event';

export class UserDeletedEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('admin.user.deleted');
  }
}
