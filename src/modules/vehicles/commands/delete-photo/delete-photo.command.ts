import { BaseCommand } from '../../../../common/commands/base.command';

export class DeletePhotoCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly photoId: string,
  ) {
    super();
  }
}
