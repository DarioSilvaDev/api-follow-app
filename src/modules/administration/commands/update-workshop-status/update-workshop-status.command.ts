import { BaseCommand } from '../../../../common/commands/base.command';

export class UpdateWorkshopStatusCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly isActive: boolean,
  ) {
    super();
  }
}
