import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateDocumentDto } from '../../dto/update-document.dto';

export class UpdateDocumentCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly documentId: string,
    public readonly dto: UpdateDocumentDto,
  ) {
    super();
  }
}
