import { BaseCommand } from '../../../../common/commands/base.command';

export class VerifyCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly careEpisodeId: string,
    public readonly workshopId: string,
    public readonly memberId: string,
  ) {
    super();
  }
}
