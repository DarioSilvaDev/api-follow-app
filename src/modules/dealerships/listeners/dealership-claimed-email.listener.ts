import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { DealershipClaimedEvent } from '../events/dealership-claimed.event';

/**
 * D-106: confirma al dueño por email que la concesionaria quedó operativa
 * después de completar el wizard de onboarding (status active / claimed_at).
 */
@Injectable()
export class DealershipClaimedEmailListener {
  private readonly logger = new Logger(DealershipClaimedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // SC-1: un fallo de SMTP post-commit NO debe tumbar el proceso ni romper el
  // flujo de respuesta. El error se loguea con dealershipId para correlación.
  // `suppressErrors` explicita la red de seguridad del loader de
  // @nestjs/event-emitter 3.x (por defecto ya evita unhandledRejection).
  @OnEvent('dealership.claimed', { suppressErrors: true })
  async handle(event: DealershipClaimedEvent) {
    try {
      const dealership = await this.prisma.dealership.findUnique({
        where: { id: event.dealershipId },
        select: { id: true, name: true },
      });

      if (!dealership) return;

      await this.mailService.sendDealershipClaimedEmail(
        event.email,
        dealership.name,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dealership claimed email (dealershipId=${event.dealershipId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
