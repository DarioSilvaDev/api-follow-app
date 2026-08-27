import { BaseCommand } from '../../../../common/commands/base.command';

export class UpdateRolePermissionsCommand extends BaseCommand {
  constructor(
    public readonly roleId: string,
    public readonly permissionIds: string[],
  ) {
    super();
  }
}
