import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateSpecialtyDto } from '../../dto/update-specialty.dto';

export class UpdateSpecialtyCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateSpecialtyDto,
  ) {
    super();
  }
}
