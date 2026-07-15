import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateEstimateDto } from '../../dto/create-estimate.dto';

export class CreateEstimateCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateEstimateDto,
    public readonly customerId: string,
    public readonly number: string,
  ) {
    super();
  }
}
