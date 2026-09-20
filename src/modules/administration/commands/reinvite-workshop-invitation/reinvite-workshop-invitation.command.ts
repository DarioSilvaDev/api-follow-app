import { BaseCommand } from '../../../../common/commands/base.command';

/**
 * D-106: reenvío de invitación del onboarding admin de taller.
 * `invitedById` es el admin de plataforma que ejecuta
 * POST /admin/workshops/:id/invitations.
 */
export class ReinviteWorkshopInvitationCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly invitedById: string,
  ) {
    super();
  }
}