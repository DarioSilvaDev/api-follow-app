import { BaseCommand } from '../../../../common/commands/base.command';
import { RecordMileageDto } from '../../dto/record-mileage.dto';

export class RecordMileageCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: RecordMileageDto,
    public readonly recordedByUserId: string,
  ) {
    super();
  }
}
