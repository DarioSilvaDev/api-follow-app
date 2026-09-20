import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { MemberInvitedEvent } from '../events/member-invited.event';

/**
 * D-106: envía el email de invitación del wizard de onboarding al dueño del
 * taller (`pending_claim`). El link apunta a la ruta pública del frontend
 * `${FRONTEND_URL}/invitations/{token}?kind=workshop`.
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
 * El nombre del taller se resuelve con un query adicional (el evento
 * workshops member.invited no transporta el nombre: se preserva su contrato).
 */
@Injectable()
export class WorkshopInvitationEmailListener {
  private readonly logger = new Logger(WorkshopInvitationEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // SC-1: un fallo de SMTP post-commit NO debe tumbar el proceso ni romper el
  // flujo de respuesta. El error se loguea con workshopId para correlación
  // y NUNCA se escribe el token de invitación en los logs. `suppressErrors`
  // explicita la red de seguridad del loader de @nestjs/event-emitter 3.x.
  @OnEvent('workshop.member.invited', { suppressErrors: true })
  async handle(event: MemberInvitedEvent) {
    try {
      const workshop = await this.prisma.workshop.findUnique({
        where: { id: event.workshopId },
        select: { id: true, status: true, name: true },
      });

      if (!workshop || workshop.status !== 'pending_claim') return;

      await this.mailService.sendWorkshopInvitationEmail(
        event.email,
        workshop.name,
        event.token,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send workshop invitation email (workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}