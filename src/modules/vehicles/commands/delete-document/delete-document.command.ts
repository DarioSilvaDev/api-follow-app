import { BaseCommand } from '../../../../common/commands/base.command';

export class DeleteDocumentCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly documentId: string,
  ) {
    super();
  }
}
