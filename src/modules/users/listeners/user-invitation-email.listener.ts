import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { UserInvitedEvent } from '../events/user-invited.event';

/**
 * D-106: envía el email de invitación de usuario de plataforma (panel admin).
 * El link apunta a la ruta pública del wizard del frontend
 * `${FRONTEND_URL}/invitations/{token}?kind=user`.
 *
 * SC-1: un fallo de SMTP post-commit NO debe tumbar el proceso ni romper el
 * flujo de respuesta. El error se loguea con el email enmascarado y NUNCA se
 * escribe el token de invitación en los logs.
 */
@Injectable()
export class UserInvitationEmailListener {
  private readonly logger = new Logger(UserInvitationEmailListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('user.invited', { suppressErrors: true })
  async handle(event: UserInvitedEvent) {
    try {
      await this.mailService.sendUserInvitationEmail(
        event.email,
        event.roleName,
        event.token,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send platform user invitation email (email=${this.mask(event.email)})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    return `${local?.slice(0, 2) ?? ''}***@${domain ?? '?'}`;
  }
}