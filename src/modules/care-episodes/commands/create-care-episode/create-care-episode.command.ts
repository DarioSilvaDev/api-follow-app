import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateCareEpisodeDto } from '../../dto/create-care-episode.dto';

export class CreateCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateCareEpisodeDto,
    public readonly workshopId: string,
    public readonly createdByMemberId: string,
  ) {
    super();
  }
}
