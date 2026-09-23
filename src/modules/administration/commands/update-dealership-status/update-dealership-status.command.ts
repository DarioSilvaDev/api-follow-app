import { BaseCommand } from '../../../../common/commands/base.command';

export class UpdateDealershipStatusCommand extends BaseCommand {
  constructor(
    public readonly dealershipId: string,
    public readonly isActive: boolean,
    public readonly reason?: string,
  ) {
    super();
  }
}
