import { BaseCommand } from '../../../../common/commands/base.command';
import { AuthenticatedUser } from '../../../../common/types/auth.types';
import { CreateOwnerCareEpisodeDto } from '../../dto/create-owner-care-episode.dto';

export class CreateOwnerCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateOwnerCareEpisodeDto,
    public readonly user: AuthenticatedUser,
    /**
     * Evidencia adjunta en la creación (S6, ruta dual): presente SOLO cuando
     * el request fue multipart/form-data con campo `files`. JSON → undefined
     * (comportamiento histórico intacto).
     */
    public readonly files?: Express.Multer.File[],
  ) {
    super();
  }
}
