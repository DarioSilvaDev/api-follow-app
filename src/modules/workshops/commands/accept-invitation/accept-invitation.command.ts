import { BaseCommand } from '../../../../common/commands/base.command';

export class AcceptInvitationCommand extends BaseCommand {
  constructor(
    public readonly token: string,
    public readonly userId: string,
  ) {
    super();
  }
}
