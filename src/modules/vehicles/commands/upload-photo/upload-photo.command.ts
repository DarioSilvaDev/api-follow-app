import { BaseCommand } from '../../../../common/commands/base.command';

export class UploadPhotoCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly file: Express.Multer.File,
    public readonly userId: string,
  ) {
    super();
  }
}
