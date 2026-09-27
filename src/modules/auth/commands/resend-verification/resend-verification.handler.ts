import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MailSendThrottle } from '../../../../common/mail/mail-send-throttle';
import { envs } from '../../../../config/envs';
import { EmailVerificationSentEvent } from '../../events/email-verification-sent.event';
import { ResendVerificationDto } from '../../dto/resend-verification.dto';

/**
 * D-110: la respuesta es SIEMPRE 201 con cuerpo vacío, exista o no la cuenta.
 * D-121: el límite por destinatario es SILENCIOSO — cuando se alcanza, se
 * responde el mismo 201 sin enviar nada. Un 429 o un mensaje distinto aquí
 * sería un orador de existencia de cuentas.
 */
@Injectable()
export class ResendVerificationHandler {
  private readonly logger = new Logger(ResendVerificationHandler.name);

  /**
   * D-121: 5 por hora y destinatario. Generoso para un usuario legítimo que
   * no está recibiendo el email, restrictivo para un atacante que lo use como
   * relay. El damping se aplica ANTES de tocar la base y sin revelar nada.
   */
  private readonly throttle = new MailSendThrottle(5, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(dto: ResendVerificationDto): Promise<void> {
    if (!this.throttle.tryAcquire(dto.email.toLowerCase())) {
      this.logger.warn(
        'Verification resend silently throttled for recipient (limit=5/3600000ms)',
      );
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== 'pending') {
      return;
    }

    await this.prisma.emailVerification.updateMany({
      where: { userId: user.id, verifiedAt: null },
      data: { expiresAt: new Date(0) },
    });

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + envs.VERIFICATION_TOKEN_EXPIRY_HOURS,
    );

    await this.prisma.emailVerification.create({
      data: { userId: user.id, token, expiresAt },
    });

    this.eventEmitter.emit(
      'auth.email.verification.sent',
      new EmailVerificationSentEvent(user.id, user.email, token),
    );
  }
}
