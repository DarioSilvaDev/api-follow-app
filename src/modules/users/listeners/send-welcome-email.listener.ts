import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { UserCreatedEvent } from '../events/user-created.event';

/**
 * Email de bienvenida. Es puramente informativo: D-109 implica que su fallo no
 * cambia el status del comando que lo disparó.
 *
 * El evento `user.created` solo transporta el email, pero la plantilla espera
 * el nombre. Antes de este cambio el listener pasaba `email` en el lugar de
 * `firstName`, así que el saludo salía "Hola juan@correo.com,". El nombre se
 * resuelve acá, igual que cualquier otro dato de plantilla.
 */
@Injectable()
export class SendWelcomeEmailListener {
  private readonly logger = new Logger(SendWelcomeEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('user.created')
  async handle(event: UserCreatedEvent): Promise<MailSendResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { firstName: true },
      });

      // Sin usuario no hay a quién felicitar: no es un error. No se loguea
      // nada porque la ausencia de la fila ya es el dato.
      if (!user) return this.listenerFailure();

      return await this.mailService.sendWelcomeEmail(
        event.email,
        user.firstName,
        { userId: event.userId },
      );
    } catch (error) {
      this.logger.error(
        `Welcome email failed unexpectedly (userId=${event.userId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return this.listenerFailure();
    }
  }

  /**
   * Resultado sintético para los fallos del propio listener. El id del usuario
   * NO viaja en el resultado: la correlación va en el log, y el resultado es
   * lo que consume el llamador, que no debe depender de parsear logs.
   */
  private listenerFailure(): MailSendResult {
    return {
      ok: false,
      template: 'welcome',
      recipient: 'masked',
      code: 'LISTENER_ERROR',
      permanent: false,
      attempts: 0,
    };
  }
}
