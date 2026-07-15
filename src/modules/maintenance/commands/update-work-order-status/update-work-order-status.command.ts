import { BaseCommand } from '../../../../common/commands/base.command';

export class UpdateWorkOrderStatusCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly status: string,
  ) {
    super();
  }
}
