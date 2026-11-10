import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleClaimBlockedEvent } from '../events/vehicle-claim-blocked.event';
import { loadActiveOwner, loadClaimMailInvite } from './claim-mail-context';

/**
 * C-4: reclamo bloqueado (§3.3 + §3.2.c).
 *
 * El destinatario del mail de titular es el OWNER ACTIVO leído de la BD, nunca
 * `event.claimantUserId`: en este evento ese id es el reclamante BLOQUEADO, no
 * el titular. Confundirlos le mandaría al atacante el aviso del dueño.
 *
 * D-109: el bloqueo ya está persistido; un fallo de SMTP no lo revierte.
 */
@Injectable()
export class VehicleClaimBlockedListener {
  private readonly logger = new Logger(VehicleClaimBlockedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle-claim.blocked', { async: true })
  async handle(event: VehicleClaimBlockedEvent): Promise<void> {
    try {
      const invite = await loadClaimMailInvite(this.prisma, event.inviteId);
      if (!invite) {
        this.logger.warn(
          `Blocked mail skipped: invite not found (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        );
        return;
      }

      const owner = await loadActiveOwner(this.prisma, invite.vehicleId);
      if (owner?.user) {
        await this.mailService.sendVehicleClaimBlockedOwnerEmail(
          owner.user.email,
          owner.user.firstName,
          invite.vehicle.licensePlate,
          {
            inviteId: invite.id,
            vehicleId: invite.vehicleId,
            workshopId: invite.workshopId,
            userId: owner.user.id,
          },
        );
      } else {
        this.logger.warn(
          `Blocked owner mail skipped: no active owner user (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
      }

      if (invite.workshop.email) {
        await this.mailService.sendVehicleClaimWorkshopNotificationEmail(
          invite.workshop.email,
          'blocked',
          {
            vehicleId: invite.vehicleId,
            licensePlate: invite.vehicle.licensePlate,
            careEpisodeId: invite.careEpisodeId,
          },
          {
            inviteId: invite.id,
            vehicleId: invite.vehicleId,
            workshopId: invite.workshopId,
            userId: invite.claimantUserId ?? undefined,
          },
        );
      } else {
        this.logger.warn(
          `Blocked workshop mail skipped: workshop email missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Blocked mail failed unexpectedly (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
