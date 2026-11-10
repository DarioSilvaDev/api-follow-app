import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleClaimClaimedEvent } from '../events/vehicle-claim-claimed.event';
import { claimantName, loadClaimMailInvite } from './claim-mail-context';

/**
 * C-4: reclamo completado (§3.2.a + §3.4.a).
 *
 * Dos destinatarios independientes:
 *  - Taller: aviso pasivo (D-VC-5 / D-TL-VC-15), no requiere acción.
 *  - Reclamante: confirmación con link a su historial (si tiene cuenta).
 *
 * `already_owner` manda AMBOS mails; el aviso al taller omite la frase de
 * revocación porque no hay vínculo nuevo que revocar.
 *
 * D-109: el ownership ya está commiteado; un fallo de SMTP no lo revierte.
 */
@Injectable()
export class VehicleClaimClaimedListener {
  private readonly logger = new Logger(VehicleClaimClaimedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle-claim.claimed', { async: true })
  async handle(event: VehicleClaimClaimedEvent): Promise<void> {
    try {
      const invite = await loadClaimMailInvite(this.prisma, event.inviteId);
      if (!invite) {
        this.logger.warn(
          `Claimed mail skipped: invite not found (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        );
        return;
      }

      const context = {
        inviteId: invite.id,
        vehicleId: invite.vehicleId,
        workshopId: invite.workshopId,
        userId: invite.claimantUserId ?? undefined,
      };

      if (invite.workshop.email) {
        await this.mailService.sendVehicleClaimWorkshopNotificationEmail(
          invite.workshop.email,
          'claimed',
          {
            vehicleId: invite.vehicleId,
            licensePlate: invite.vehicle.licensePlate,
            careEpisodeId: invite.careEpisodeId,
            claimantName: claimantName(invite.claimant),
            claimantEmail: invite.claimant?.email ?? null,
            alreadyOwner: event.outcome === 'already_owner',
          },
          context,
        );
      } else {
        this.logger.warn(
          `Claimed workshop mail skipped: workshop email missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
      }

      if (invite.claimant) {
        await this.mailService.sendVehicleClaimResultEmail(
          invite.claimant.email,
          invite.claimant.firstName,
          invite.vehicle.licensePlate,
          'claimed',
          context,
        );
      } else {
        this.logger.warn(
          `Claimed result mail skipped: claimant missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Claimed mail failed unexpectedly (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
