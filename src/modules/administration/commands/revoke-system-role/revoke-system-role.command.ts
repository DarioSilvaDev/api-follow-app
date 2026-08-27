import { BaseCommand } from '../../../../common/commands/base.command';

export class RevokeSystemRoleCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly roleId: string,
  ) {
    super();
  }
}
