import { BaseCommand } from '../../../../common/commands/base.command';
import { InviteMemberDto } from '../../dto/invite-member.dto';

export class InviteMemberCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: InviteMemberDto,
    public readonly invitedById: string,
  ) {
    super();
  }
}
