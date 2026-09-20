import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { WorkshopClaimedEvent } from '../events/workshop-claimed.event';

/**
 * D-106: confirma al dueño por email que el taller quedó operativo después de
 * completar el wizard de onboarding (status active / claimed_at).
 */
@Injectable()
export class WorkshopClaimedEmailListener {
  private readonly logger = new Logger(WorkshopClaimedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // SC-1: un fallo de SMTP post-commit NO debe tumbar el proceso ni romper el
  // flujo de respuesta. El error se loguea con workshopId para correlación.
  // `suppressErrors` explicita la red de seguridad del loader de
  // @nestjs/event-emitter 3.x (por defecto ya evita unhandledRejection).
  @OnEvent('workshop.claimed', { suppressErrors: true })
  async handle(event: WorkshopClaimedEvent) {
    try {
      const workshop = await this.prisma.workshop.findUnique({
        where: { id: event.workshopId },
        select: { id: true, name: true },
      });

      if (!workshop) return;

      await this.mailService.sendWorkshopClaimedEmail(
        event.email,
        workshop.name,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send workshop claimed email (workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}