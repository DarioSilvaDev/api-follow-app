import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleClaimVerifyFailedEvent } from '../events/vehicle-claim-verify-failed.event';
import { loadClaimMailInvite } from './claim-mail-context';

/**
 * C-4: aviso al taller de cada intento fallido de reclamo (§3.2.b). Es un
 * indicio de fuga o de reenvío indebido del link, por eso se manda en cada
 * fallo. Sin `Workshop.email` no hay canal: se loguea el skip y se sigue.
 *
 * D-109: el fallo de verificación ya está persistido; este mail nunca revierte
 * nada. Se loguea sólo por ids, nunca por email/nombre/token/hash.
 */
@Injectable()
export class VehicleClaimVerifyFailedListener {
  private readonly logger = new Logger(VehicleClaimVerifyFailedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle-claim.verify-failed', { async: true })
  async handle(event: VehicleClaimVerifyFailedEvent): Promise<void> {
    try {
      const invite = await loadClaimMailInvite(this.prisma, event.inviteId);
      if (!invite) {
        this.logger.warn(
          `Verify-failed mail skipped: invite not found (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        );
        return;
      }

      if (!invite.workshop.email) {
        this.logger.warn(
          `Verify-failed mail skipped: workshop email missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
        return;
      }

      await this.mailService.sendVehicleClaimWorkshopNotificationEmail(
        invite.workshop.email,
        'verify_failed',
        {
          vehicleId: invite.vehicleId,
          licensePlate: invite.vehicle.licensePlate,
          careEpisodeId: invite.careEpisodeId,
          failedAttempts: event.failedAttempts,
        },
        {
          inviteId: invite.id,
          vehicleId: invite.vehicleId,
          workshopId: invite.workshopId,
        },
      );
    } catch (error) {
      this.logger.error(
        `Verify-failed mail failed unexpectedly (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
