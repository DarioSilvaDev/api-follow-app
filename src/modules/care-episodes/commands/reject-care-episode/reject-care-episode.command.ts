import { BaseCommand } from '../../../../common/commands/base.command';

export class RejectCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly careEpisodeId: string,
    public readonly reason: string | null,
    public readonly workshopId: string,
    public readonly memberId: string,
  ) {
    super();
  }
}
