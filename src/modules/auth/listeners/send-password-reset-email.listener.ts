import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { PasswordResetRequestedEvent } from '../events/password-reset-requested.event';

/**
 * D-109 + D-110: `forgot-password` responde SIEMPRE 201 con el mismo mensaje
 * (anti-enumeración, D-028/D-025). Este listener por lo tanto NO puede
 * comunicar el resultado del envío: indistinguible es un requisito de
 * seguridad, no un efecto secundario. La degradación se communica por logs y,
 * para el owner, por la affordance permanente de reenvío en la UI.
 *
 * Nunca se registra el token de reset.
 */
@Injectable()
export class SendPasswordResetEmailListener {
  private readonly logger = new Logger(SendPasswordResetEmailListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('auth.password_reset.requested')
  async handle(event: PasswordResetRequestedEvent): Promise<MailSendResult> {
    try {
      return await this.mailService.sendPasswordResetEmail(
        event.email,
        event.token,
      );
    } catch (error) {
      this.logger.error(
        'Password reset email listener failed unexpectedly',
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        template: 'password_reset',
        recipient: 'masked',
        code: 'LISTENER_ERROR',
        permanent: false,
        attempts: 0,
      };
    }
  }
}
