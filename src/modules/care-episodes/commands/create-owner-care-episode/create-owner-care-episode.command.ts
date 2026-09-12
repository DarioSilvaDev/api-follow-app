import { BaseCommand } from '../../../../common/commands/base.command';
import { AuthenticatedUser } from '../../../../common/types/auth.types';
import { CreateOwnerCareEpisodeDto } from '../../dto/create-owner-care-episode.dto';

export class CreateOwnerCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateOwnerCareEpisodeDto,
    public readonly user: AuthenticatedUser,
  ) {
    super();
  }
}
