import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { MemberInvitedEvent } from '../events/member-invited.event';

/**
 * D-106: envía el email de invitación del wizard de onboarding al dueño de
 * la concesionaria (`pending_claim`). El link apunta a la ruta pública del
 * frontend `${FRONTEND_URL}/invitations/{token}?kind=dealership`.
 *
 * Guard explícito: SOLO se envía cuando la concesionaria está en
 * `pending_claim` (onboarding admin). El flujo D-103 / invitación regular de
 * miembros (`InviteMemberHandler`) también emite `dealership.member.invited`
 * con la misma construcción de evento; enviarle al invitado el link del
 * wizard sería incorrecto (el wizard rechazaría la invitación con
 * INVITATION_USED porque la concesionaria ya está activa). Antes de este
 * listener no se enviaba ningún email para invitaciones regulares, por lo
 * que el skip preserva el comportamiento existente.
 */
@Injectable()
export class DealershipInvitationEmailListener {
  private readonly logger = new Logger(DealershipInvitationEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // SC-1: un fallo de SMTP post-commit NO debe tumbar el proceso ni romper el
  // flujo de respuesta. El error se loguea con dealershipId para correlación
  // y NUNCA se escribe el token de invitación en los logs. `suppressErrors`
  // explicita la red de seguridad del loader de @nestjs/event-emitter 3.x
  // (por defecto ya evita unhandledRejection; aquí queda asegurada también si
  // el default cambiara).
  @OnEvent('dealership.member.invited', { suppressErrors: true })
  async handle(event: MemberInvitedEvent) {
    try {
      const dealership = await this.prisma.dealership.findUnique({
        where: { id: event.dealershipId },
        select: { id: true, status: true },
      });

      if (!dealership || dealership.status !== 'pending_claim') return;

      await this.mailService.sendDealershipInvitationEmail(
        event.email,
        event.dealershipName,
        event.token,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dealership invitation email (dealershipId=${event.dealershipId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
