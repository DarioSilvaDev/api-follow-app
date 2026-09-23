import { BaseCommand } from '../../../../common/commands/base.command';
import { UserWizardClaimDto } from '../../dto/user-wizard-claim.dto';

/**
 * D-106: claim del wizard de usuario de plataforma.
 * `sessionUserId` se mantiene para paridad de firma con el wizard de
 * workshops/dealerships; en el flujo de users no se vincula una cuenta activa
 * (active/suspended → 409), por lo que el handler no lo ramifica.
 */
export class UserWizardClaimCommand extends BaseCommand {
  constructor(
    public readonly dto: UserWizardClaimDto,
    public readonly sessionUserId?: string | null,
  ) {
    super();
  }
}