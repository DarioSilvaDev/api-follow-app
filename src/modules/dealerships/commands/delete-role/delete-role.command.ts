import { BaseCommand } from '../../../../common/commands/base.command';

export class DeleteRoleCommand extends BaseCommand {
  constructor(
    public readonly dealershipId: string,
    public readonly roleId: string,
  ) {
    super();
  }
}