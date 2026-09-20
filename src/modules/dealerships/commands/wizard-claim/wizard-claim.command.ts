import { BaseCommand } from '../../../../common/commands/base.command';
import { WizardClaimDto } from '../../dto/wizard-claim.dto';

/**
 * D-106: comando de claim del wizard.
 * `sessionUserId` es opcional: si el usuario ya tiene una cuenta activa, el
 * wizard requiere sesión; si el usuario es nuevo (o pending), no hace falta.
 */
export class WizardClaimCommand extends BaseCommand {
  constructor(
    public readonly dto: WizardClaimDto,
    public readonly sessionUserId?: string | null,
  ) {
    super();
  }
}
