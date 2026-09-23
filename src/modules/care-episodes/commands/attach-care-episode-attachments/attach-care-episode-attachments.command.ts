import { BaseCommand } from '../../../../common/commands/base.command';

export class AttachCareEpisodeAttachmentsCommand extends BaseCommand {
  constructor(
    public readonly careEpisodeId: string,
    public readonly workshopId: string,
    public readonly memberId: string,
    public readonly phase: 'before' | 'work' | 'after',
    public readonly caption: string | null,
    public readonly file: Express.Multer.File,
  ) {
    super();
  }
}