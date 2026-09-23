import { BaseCommand } from '../../../../common/commands/base.command';
import { InvitePlatformUserDto } from '../../dto/invite-platform-user.dto';

/**
 * D-106: invitación de usuario de plataforma desde el panel admin.
 * `invitedById` es el id del Identity/admin autenticado (se persiste en
 * UserInvitation.invitedBy para auditoría).
 */
export class InvitePlatformUserCommand extends BaseCommand {
  constructor(
    public readonly dto: InvitePlatformUserDto,
    public readonly invitedById: string,
  ) {
    super();
  }
}