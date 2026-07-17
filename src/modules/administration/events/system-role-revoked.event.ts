import { BaseEvent } from '../../../common/events/base-event';

export class SystemRoleRevokedEvent extends BaseEvent {
  constructor(
    public readonly userId: string,
    public readonly roleType: string,
  ) {
    super('admin.system_role.revoked');
  }
}
