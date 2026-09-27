import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { PasswordResetCompletedEvent } from '../events/password-reset-completed.event';

/**
 * D-029: el email post-reset es un AVISO de seguridad, no la vía de
 * recuperación (la contraseña ya quedó restablecida en la transacción del
 * comando). D-109: su fallo no revierte el reset ni cambia el status del
 * endpoint. D-029: un usuario inexistente (borrado entre el reset y el envío)
 * no produce error ni email.
 */
@Injectable()
export class SendPasswordResetCompletedEmailListener {
  private readonly logger = new Logger(
    SendPasswordResetCompletedEmailListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('auth.password_reset.completed')
  async handle(
    event: PasswordResetCompletedEvent,
  ): Promise<MailSendResult | undefined> {
    try {
      // Sin `select`: se mantiene la forma de la consulta preexistente. Este
      // cambio es sobre robustez de email, no sobre la forma de las queries.
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
      });

      // D-029: usuario borrado entre el reset y el envío → sin email, sin error.
      if (!user) return undefined;

      return await this.mailService.sendPasswordResetCompletedEmail(
        user.email,
        { userId: event.userId },
      );
    } catch (error) {
      this.logger.error(
        `Password reset completed email failed unexpectedly (userId=${event.userId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
