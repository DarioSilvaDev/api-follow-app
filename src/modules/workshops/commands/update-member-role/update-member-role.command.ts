import { BaseCommand } from '../../../../common/commands/base.command';

export class UpdateMemberRoleCommand extends BaseCommand {
  constructor(
    public readonly memberId: string,
    public readonly roleId: string,
  ) {
    super();
  }
}
