import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { WorkshopClaimedEvent } from '../events/workshop-claimed.event';

/**
 * D-109: confirma al dueño por email que el taller quedó operativo después de
 * completar el wizard de onboarding (status active / claimed_at).
 *
 * D-109: el taller ya está activo en BD cuando este listener corre; el fallo
 * de SMTP no lo revierte. El try/catch cubre la lectura Prisma y la red de
 * seguridad del contrato de MailService, no el SMTP en sí.
 */
@Injectable()
export class WorkshopClaimedEmailListener {
  private readonly logger = new Logger(WorkshopClaimedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('workshop.claimed', { suppressErrors: true })
  async handle(
    event: WorkshopClaimedEvent,
  ): Promise<MailSendResult | undefined> {
    try {
      const workshop = await this.prisma.workshop.findUnique({
        where: { id: event.workshopId },
        select: { id: true, name: true },
      });

      if (!workshop) return undefined;

      return await this.mailService.sendWorkshopClaimedEmail(
        event.email,
        workshop.name,
        { workshopId: event.workshopId },
      );
    } catch (error) {
      this.logger.error(
        `Workshop claimed email failed unexpectedly (workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
