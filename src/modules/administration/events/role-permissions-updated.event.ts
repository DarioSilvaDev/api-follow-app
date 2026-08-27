import { BaseEvent } from '../../../common/events/base-event';

export class RolePermissionsUpdatedEvent extends BaseEvent {
  constructor(
    public readonly roleId: string,
    public readonly roleType: string,
    public readonly permissionCodes: string[],
  ) {
    super('admin.role.permissions_updated');
  }
}
