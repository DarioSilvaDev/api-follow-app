import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import { CreateClaimInviteDto } from '../../dto/create-claim-invite.dto';

export class CreateClaimInviteCommand {
  constructor(
    public readonly dto: CreateClaimInviteDto,
    public readonly context: CurrentContext,
    public readonly user: AuthenticatedUser,
  ) {}
}
