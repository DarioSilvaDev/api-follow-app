import { BaseCommand } from '../../../../common/commands/base.command';
import { VerifyClaimDto } from '../../dto/verify-claim.dto';

/**
 * VerifyClaimCommand — datos del `POST /public/:token/verify`.
 *
 * `ip` y `userAgent` ya vienen truncados/saneados por el controller; se
 * persisten en `VehicleClaimAttempt` sólo como evidencia de intento (S-2).
 */
export class VerifyClaimCommand extends BaseCommand {
  constructor(
    public readonly token: string,
    public readonly dto: VerifyClaimDto,
    public readonly ip: string | null,
    public readonly userAgent: string | null,
  ) {
    super();
  }
}
