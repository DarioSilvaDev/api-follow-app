import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateWorkshopDto } from '../../dto/update-workshop.dto';

export class UpdateWorkshopCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateWorkshopDto,
  ) {
    super();
  }
}
