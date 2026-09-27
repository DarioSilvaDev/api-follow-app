import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { EmailVerificationSentEvent } from '../events/email-verification-sent.event';

/**
 * D-109: el fallo de SMTP no revierte la cuenta creada. Este listener NUNCA
 * propaga el error hacia el comando: `MailService` ya devuelve un resultado
 * tipado y no lanza, y este handler devuelve ese resultado para que
 * `RegisterHandler` pueda reportar el estado de entrega (D-111).
 *
 * El `try/catch` cubre solo la lectura Prisma. Antes no existía ninguno: un
 * fallo de base de datos en este listener se descartaba con un log genérico
 * del EventEmitter2, sin correlación de entidad.
 */
@Injectable()
export class SendVerificationEmailListener {
  private readonly logger = new Logger(SendVerificationEmailListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('auth.email.verification.sent')
  async handle(event: EmailVerificationSentEvent): Promise<MailSendResult> {
    try {
      return await this.mailService.sendVerificationEmail(
        event.email,
        event.token,
        {
          userId: event.userId,
        },
      );
    } catch (error) {
      // Solo alcanzable si el propio MailService lanzara, lo cual contradice
      // su contrato. Se loguea igual: un fallo aquí sin registro es peor que
      // un log de más.
      this.logger.error(
        `Verification email listener failed unexpectedly (userId=${event.userId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        ok: false,
        template: 'email_verification',
        recipient: 'masked',
        code: 'LISTENER_ERROR',
        permanent: false,
        attempts: 0,
      };
    }
  }
}
