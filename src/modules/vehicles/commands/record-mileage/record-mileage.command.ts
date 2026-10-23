import { BaseCommand } from '../../../../common/commands/base.command';
import { RecordMileageDto } from '../../dto/record-mileage.dto';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';

export class RecordMileageCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: RecordMileageDto,
    public readonly recordedByUserId: string,
    public readonly context: CurrentContext,
  ) {
    super();
  }
}
