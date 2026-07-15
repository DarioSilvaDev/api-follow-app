import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateWorkOrderDto } from '../../dto/create-work-order.dto';

export class CreateWorkOrderCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateWorkOrderDto,
    public readonly customerId: string,
    public readonly number: string,
  ) {
    super();
  }
}
