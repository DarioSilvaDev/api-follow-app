import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { DealershipClaimedEvent } from '../events/dealership-claimed.event';

/**
 * D-109: confirma al dueño por email que la concesionaria quedó operativa
 * después de completar el wizard de onboarding (status active / claimed_at).
 *
 * D-TL-5: si la concesionaria tiene un taller vinculado (alta conjunta), se
 * envía la variante combinada `sendDealershipGroupClaimedEmail` (copy §13.D,
 * 2 CTAs). El listener de workshop tiene guard `dealershipId` para NUNCA
 * duplicar la confirmación: el claim combinado emite `dealership.claimed` +
 * `workshop.claimed`, y el mail combinado lo manda SOLO este listener.
 *
 * D-109: la concesionaria ya está activa en BD cuando este listener corre; el
 * fallo de SMTP no la revierte. El try/catch cubre la lectura Prisma y la red
 * de seguridad del contrato de MailService, no el SMTP en sí.
 */
@Injectable()
export class DealershipClaimedEmailListener {
  private readonly logger = new Logger(DealershipClaimedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('dealership.claimed', { suppressErrors: true })
  async handle(
    event: DealershipClaimedEvent,
  ): Promise<MailSendResult | undefined> {
    try {
      const dealership = await this.prisma.dealership.findUnique({
        where: { id: event.dealershipId },
        select: { id: true, name: true },
      });

      if (!dealership) return undefined;

      // D-TL-5: alta conjunta → taller vinculado → variante combinada.
      const workshop = await this.prisma.workshop.findFirst({
        where: { dealershipId: event.dealershipId },
        select: { id: true, name: true },
      });

      if (workshop) {
        return await this.mailService.sendDealershipGroupClaimedEmail(
          event.email,
          dealership.name,
          workshop.name,
          { dealershipId: event.dealershipId, workshopId: workshop.id },
        );
      }

      return await this.mailService.sendDealershipClaimedEmail(
        event.email,
        dealership.name,
        { dealershipId: event.dealershipId },
      );
    } catch (error) {
      this.logger.error(
        `Dealership claimed email failed unexpectedly (dealershipId=${event.dealershipId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
