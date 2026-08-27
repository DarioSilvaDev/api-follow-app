import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateSpecialtyDto } from '../../dto/create-specialty.dto';

export class CreateSpecialtyCommand extends BaseCommand {
  constructor(public readonly dto: CreateSpecialtyDto) {
    super();
  }
}
