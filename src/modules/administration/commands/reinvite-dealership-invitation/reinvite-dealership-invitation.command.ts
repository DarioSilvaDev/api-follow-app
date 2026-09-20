import { BaseCommand } from '../../../../common/commands/base.command';

export class ReinviteDealershipInvitationCommand extends BaseCommand {
  constructor(
    public readonly dealershipId: string,
    public readonly invitedById: string,
  ) {
    super();
  }
}
