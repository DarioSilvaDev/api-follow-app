import { BaseCommand } from '../../../../common/commands/base.command';
import { UploadDocumentDto } from '../../dto/upload-document.dto';

export class UploadDocumentCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: UploadDocumentDto,
    public readonly file: Express.Multer.File,
    public readonly userId: string,
  ) {
    super();
  }
}
