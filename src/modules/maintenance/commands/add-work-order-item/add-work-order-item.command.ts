import { BaseCommand } from '../../../../common/commands/base.command';
import { AddWorkOrderItemDto } from '../../dto/add-work-order-item.dto';

export class AddWorkOrderItemCommand extends BaseCommand {
  constructor(
    public readonly workOrderId: string,
    public readonly dto: AddWorkOrderItemDto,
  ) {
    super();
  }
}
