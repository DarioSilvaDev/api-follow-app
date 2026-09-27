import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { MemberInvitedEvent } from '../events/member-invited.event';

/**
 * D-109 / D-117: envía el email de invitación del wizard de onboarding al
 * dueño del taller (`pending_claim`). El link apunta a la ruta pública del
 * frontend `${FRONTEND_URL}/invitations/{token}?kind=workshop`.
 *
 * Guard explícito: SOLO se envía cuando el taller está en `pending_claim`
 * (onboarding admin). El flujo de invitación regular de miembros
 * (`InviteMemberHandler`) también emite `workshop.member.invited` con la
 * misma construcción de evento; enviarle al invitado el link del wizard sería
 * incorrecto (el wizard rechazaría la invitación con INVITATION_USED porque el
 * taller ya está activo). Antes de este listener no se enviaba ningún email
 * para invitaciones regulares, por lo que el skip preserva el comportamiento
 * existente.
 *
 * D-117 (PM) indica que la invitación a miembro SÍ debe notificar por email en
 * MVP, pero depende del PENDIENTE P-3 (journey de aceptación). Queda
 * pendiente de Fase 2; no se altera el guard acá.
 *
 * D-109: el alta ya está creada; el fallo de SMTP no la revierte.
 */
@Injectable()
export class WorkshopInvitationEmailListener {
  private readonly logger = new Logger(WorkshopInvitationEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('workshop.member.invited', { suppressErrors: true })
  async handle(event: MemberInvitedEvent): Promise<MailSendResult | undefined> {
    try {
      const workshop = await this.prisma.workshop.findUnique({
        where: { id: event.workshopId },
        select: { id: true, status: true, name: true },
      });

      if (!workshop || workshop.status !== 'pending_claim') return undefined;

      return await this.mailService.sendWorkshopInvitationEmail(
        event.email,
        workshop.name,
        event.token,
        { workshopId: event.workshopId },
      );
    } catch (error) {
      this.logger.error(
        `Workshop invitation email failed unexpectedly (workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
