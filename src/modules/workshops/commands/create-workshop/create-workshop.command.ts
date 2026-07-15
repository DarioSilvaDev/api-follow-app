import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateWorkshopDto } from '../../dto/create-workshop.dto';

export class CreateWorkshopCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateWorkshopDto,
    public readonly ownerId: string,
  ) {
    super();
  }
}
