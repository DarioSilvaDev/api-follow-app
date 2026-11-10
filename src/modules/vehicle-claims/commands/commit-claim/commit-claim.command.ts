import { BaseCommand } from '../../../../common/commands/base.command';
import { CommitClaimDto } from '../../dto/commit-claim.dto';

/**
 * CommitClaimCommand — datos del `POST /public/:token/commit`.
 *
 * `sessionUserId` se resuelve del cookie `access_token` en el controller (sin
 * lanzar): el handler decide el 401 `AUTH_REQUIRED` (T10).
 */
export class CommitClaimCommand extends BaseCommand {
  constructor(
    public readonly token: string,
    public readonly dto: CommitClaimDto,
    public readonly sessionUserId: string | null,
  ) {
    super();
  }
}
