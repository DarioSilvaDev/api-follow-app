import { BaseCommand } from '../../../../common/commands/base.command';
import { CloseCareEpisodeDto } from '../../dto/close-care-episode.dto';

/**
 * CloseCareEpisodeCommand — datos ya resueltos desde el contexto WORKSHOP.
 *
 * La identidad (workshopId/memberId) viene SIEMPRE del contexto, nunca del
 * body. `careEpisodeId` es el `:id` de la ruta.
 */
export class CloseCareEpisodeCommand extends BaseCommand {
  constructor(
    public readonly careEpisodeId: string,
    public readonly dto: CloseCareEpisodeDto,
    public readonly workshopId: string,
    public readonly memberId: string,
  ) {
    super();
  }
}
