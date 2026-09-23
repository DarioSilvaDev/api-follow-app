import { BaseCommand } from '../../../../common/commands/base.command';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import type { CareEpisodeAttachmentRemovalReason } from '@prisma/client';

export class RemoveCareEpisodeAttachmentCommand extends BaseCommand {
  constructor(
    public readonly careEpisodeId: string,
    public readonly attachmentId: string,
    public readonly removedReason: CareEpisodeAttachmentRemovalReason | null,
    public readonly ctx: CurrentContext,
    public readonly user: AuthenticatedUser,
  ) {
    super();
  }
}