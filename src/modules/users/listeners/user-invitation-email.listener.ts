import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { maskEmail } from '../../../common/mail/mask-email';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { UserInvitedEvent } from '../events/user-invited.event';

/**
 * D-109 / D-117: envía el email de invitación de usuario de plataforma (panel
 * admin). El link apunta a la ruta pública del wizard del frontend
 * `${FRONTEND_URL}/invitations/{token}?kind=user`.
 *
 * D-109: si el envío falla, la invitación ya está creada y el comando que la
 * originó NO se revierte ni devuelve 5xx. El `try/catch` ya no cubre el SMTP
 * (MailService es la frontera de error y no lanza); queda solo como red de
 * seguridad del contrato.
 */
@Injectable()
export class UserInvitationEmailListener {
  private readonly logger = new Logger(UserInvitationEmailListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('user.invited', { suppressErrors: true })
  async handle(event: UserInvitedEvent): Promise<MailSendResult | undefined> {
    try {
      return await this.mailService.sendUserInvitationEmail(
        event.email,
        event.roleName,
        event.token,
      );
    } catch (error) {
      // Red de seguridad del contrato, no el camino esperado: MailService es
      // la frontera de error y no lanza (D-109). Se mantiene igual para que un
      // cambio futuro en MailService no pueda tumbar el listener.
      //
      // `UserInvitedEvent` no transporta ningún id de dominio, así que la
      // única correlación posible es el email enmascarado. El token de
      // invitación NUNCA se loguea: es la credencial del link de onboarding.
      this.logger.error(
        `User invitation email failed (email=${maskEmail(event.email)})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
