import { BaseCommand } from '../../../../common/commands/base.command';

export class ConvertEstimateCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {
    super();
  }
}
