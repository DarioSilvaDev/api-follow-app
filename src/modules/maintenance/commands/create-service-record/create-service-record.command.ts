import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateServiceRecordDto } from '../../dto/create-service-record.dto';

export class CreateServiceRecordCommand extends BaseCommand {
  constructor(public readonly dto: CreateServiceRecordDto) {
    super();
  }
}
