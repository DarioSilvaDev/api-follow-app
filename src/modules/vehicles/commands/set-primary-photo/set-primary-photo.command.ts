import { BaseCommand } from '../../../../common/commands/base.command';

export class SetPrimaryPhotoCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly photoId: string,
  ) {
    super();
  }
}
