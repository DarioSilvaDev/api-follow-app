import { BaseCommand } from '../../../../common/commands/base.command';
import { CheckInDto } from '../../dto/check-in.dto';

/**
 * CheckInCommand — datos ya resueltos desde el contexto WORKSHOP.
 *
 * La identidad (workshopId/memberId/userId) viene SIEMPRE del contexto, nunca
 * del body. `userId` sólo se usa para el evento `vehicle.registered` cuando el
 * check-in crea el vehículo.
 */
export class CheckInCommand extends BaseCommand {
  constructor(
    public readonly dto: CheckInDto,
    public readonly workshopId: string,
    public readonly memberId: string,
    public readonly userId: string,
  ) {
    super();
  }
}
