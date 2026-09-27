import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { MemberInvitedEvent } from '../events/member-invited.event';

/**
 * D-109 / D-117: envía el email de invitación del wizard de onboarding al
 * dueño de la concesionaria (`pending_claim`). El link apunta a la ruta pública
 * del frontend `${FRONTEND_URL}/invitations/{token}?kind=dealership`.
 *
 * Guard explícito: SOLO se envía cuando la concesionaria está en
 * `pending_claim` (onboarding admin). El flujo D-103 / invitación regular de
 * miembros (`InviteMemberHandler`) también emite `dealership.member.invited`
 * con la misma construcción de evento; enviarle al invitado el link del wizard
 * sería incorrecto (el wizard rechazaría la invitación con INVITATION_USED
 * porque la concesionaria ya está activa). Antes de este listener no se enviaba
 * ningún email para invitaciones regulares, por lo que el skip preserva el
 * comportamiento existente.
 *
 * D-117 (PM) indica que la invitación a miembro SÍ debe notificar por email en
 * MVP, pero depende del PENDIENTE P-3 (journey de aceptación). Queda
 * pendiente de Fase 2; no se altera el guard acá.
 *
 * D-109: el alta ya está creada; el fallo de SMTP no la revierte. El token de
 * invitación NUNCA se loguea: la correlación es por dealershipId.
 */
@Injectable()
export class DealershipInvitationEmailListener {
  private readonly logger = new Logger(DealershipInvitationEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('dealership.member.invited', { suppressErrors: true })
  async handle(event: MemberInvitedEvent): Promise<MailSendResult | undefined> {
    try {
      const dealership = await this.prisma.dealership.findUnique({
        where: { id: event.dealershipId },
        select: { id: true, status: true },
      });

      if (!dealership || dealership.status !== 'pending_claim')
        return undefined;

      return await this.mailService.sendDealershipInvitationEmail(
        event.email,
        event.dealershipName,
        event.token,
        { dealershipId: event.dealershipId },
      );
    } catch (error) {
      this.logger.error(
        `Dealership invitation email failed unexpectedly (dealershipId=${event.dealershipId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
