import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleClaimManualReviewEvent } from '../events/vehicle-claim-manual-review.event';
import { claimantName, loadClaimMailInvite } from './claim-mail-context';

/**
 * C-4: reclamo a revisar (§3.2.d). Sólo al taller: el reclamante todavía no
 * tiene resultado que confirmar. Si no hay `Workshop.email` no hay canal.
 *
 * `claimant` suele ser `null` acá (el invite pasó a `manual_review` antes del
 * commit con sesión); el método de mail cae a "Alguien" (D-2).
 */
@Injectable()
export class VehicleClaimManualReviewListener {
  private readonly logger = new Logger(VehicleClaimManualReviewListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle-claim.manual-review', { async: true })
  async handle(event: VehicleClaimManualReviewEvent): Promise<void> {
    try {
      const invite = await loadClaimMailInvite(this.prisma, event.inviteId);
      if (!invite) {
        this.logger.warn(
          `Manual-review mail skipped: invite not found (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        );
        return;
      }

      if (!invite.workshop.email) {
        this.logger.warn(
          `Manual-review mail skipped: workshop email missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
        return;
      }

      await this.mailService.sendVehicleClaimWorkshopNotificationEmail(
        invite.workshop.email,
        'manual_review',
        {
          vehicleId: invite.vehicleId,
          licensePlate: invite.vehicle.licensePlate,
          careEpisodeId: invite.careEpisodeId,
          claimantName: claimantName(invite.claimant),
          claimantEmail: invite.claimant?.email ?? null,
        },
        {
          inviteId: invite.id,
          vehicleId: invite.vehicleId,
          workshopId: invite.workshopId,
          userId: invite.claimantUserId ?? undefined,
        },
      );
    } catch (error) {
      this.logger.error(
        `Manual-review mail failed unexpectedly (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
