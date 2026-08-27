import { BaseCommand } from '../../../../common/commands/base.command';

export class AddSpecialtyCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly specialtyId: string,
  ) {
    super();
  }
}
