import { BaseCommand } from '../../../../common/commands/base.command';

export class RemoveSpecialtyCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly specialtyId: string,
  ) {
    super();
  }
}
