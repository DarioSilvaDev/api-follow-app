import { BaseCommand } from '../../../../common/commands/base.command';
import { EstimateStatus } from '@prisma/client';

export class UpdateEstimateStatusCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly status: EstimateStatus,
  ) {
    super();
  }
}
