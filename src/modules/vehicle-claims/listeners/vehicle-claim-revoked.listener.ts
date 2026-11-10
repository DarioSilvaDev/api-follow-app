import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleClaimRevokedEvent } from '../events/vehicle-claim-revoked.event';
import {
  ClaimMailInvite,
  loadClaimMailInvite,
  wasClaimOwnershipUndone,
} from './claim-mail-context';

/**
 * C-4: revocación de un reclamo (§3.2.e + §3.4.b). El destino depende del
 * `reason`, no del flag `autoRevoked`:
 *
 *  - `max_attempts`           → taller (`auto_revoked`).
 *  - `by_workshop`            → reclamante sólo si se creó ownership Y se
 *                               deshizo; si no, no hay nada que comunicar
 *                               (variante `revoked`).
 *  - `manual_review_rejected` → reclamante (si tiene cuenta, variante
 *                               `review_rejected`: nunca hubo ownership).
 *  - `by_admin`, `vehicle_deleted`, `dispute_lost` → sin mail, sólo warn.
 *
 * D-109: la revocación ya está persistida; un fallo de SMTP no la revierte.
 */
@Injectable()
export class VehicleClaimRevokedListener {
  private readonly logger = new Logger(VehicleClaimRevokedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle-claim.revoked', { async: true })
  async handle(event: VehicleClaimRevokedEvent): Promise<void> {
    try {
      const invite = await loadClaimMailInvite(this.prisma, event.inviteId);
      if (!invite) {
        this.logger.warn(
          `Revoked mail skipped: invite not found (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId}, reason=${event.reason})`,
        );
        return;
      }

      switch (event.reason) {
        case 'max_attempts':
          await this.sendWorkshopAutoRevoked(invite, event);
          return;

        case 'by_workshop':
          await this.sendClaimantRevokedIfOwnershipUndone(invite, event);
          return;

        case 'manual_review_rejected':
          await this.sendClaimantRevoked(invite, event, 'review_rejected');
          return;

        case 'by_admin':
        case 'vehicle_deleted':
        case 'dispute_lost':
          this.logger.warn(
            `Revoked mail skipped: reason not notifiable (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${event.reason})`,
          );
          return;

        default:
          this.logger.warn(
            `Revoked mail skipped: unknown reason (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${String(event.reason)})`,
          );
          return;
      }
    } catch (error) {
      this.logger.error(
        `Revoked mail failed unexpectedly (inviteId=${event.inviteId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId}, reason=${event.reason})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** `max_attempts`: link auto-revocado tras 3 bloqueos → aviso al taller. */
  private async sendWorkshopAutoRevoked(
    invite: ClaimMailInvite,
    event: VehicleClaimRevokedEvent,
  ): Promise<void> {
    if (!invite.workshop.email) {
      this.logger.warn(
        `Auto-revoked mail skipped: workshop email missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${event.reason})`,
      );
      return;
    }

    await this.mailService.sendVehicleClaimWorkshopNotificationEmail(
      invite.workshop.email,
      'auto_revoked',
      {
        vehicleId: invite.vehicleId,
        licensePlate: invite.vehicle.licensePlate,
        careEpisodeId: invite.careEpisodeId,
      },
      {
        inviteId: invite.id,
        vehicleId: invite.vehicleId,
        workshopId: invite.workshopId,
      },
    );
  }

  /**
   * `by_workshop`: sólo avisa si se creó un ownership y la revocación lo
   * cerró. Un invite que nunca se reclamó (T14) no tiene a quién notificar.
   */
  private async sendClaimantRevokedIfOwnershipUndone(
    invite: ClaimMailInvite,
    event: VehicleClaimRevokedEvent,
  ): Promise<void> {
    if (invite.claimOutcome !== 'ownership_created') {
      this.logger.log(
        `Revoked claimant mail skipped: outcome not ownership_created (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${event.reason})`,
      );
      return;
    }

    const undone = await wasClaimOwnershipUndone(this.prisma, invite.id);
    if (!undone) {
      this.logger.log(
        `Revoked claimant mail skipped: ownership not undone (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${event.reason})`,
      );
      return;
    }

    await this.sendClaimantRevoked(invite, event, 'revoked');
  }

  /**
   * Mail de resultado al reclamante; sin cuenta no hay a quién avisar.
   *
   * `review_rejected` distingue el rechazo de una revisión manual: el
   * reclamante nunca tuvo ownership, así que el copy no puede decir "ya no
   * figura a tu nombre".
   */
  private async sendClaimantRevoked(
    invite: ClaimMailInvite,
    event: VehicleClaimRevokedEvent,
    outcome: 'revoked' | 'review_rejected',
  ): Promise<void> {
    if (!invite.claimant) {
      this.logger.warn(
        `Revoked claimant mail skipped: claimant missing (inviteId=${invite.id}, vehicleId=${invite.vehicleId}, workshopId=${invite.workshopId}, reason=${event.reason})`,
      );
      return;
    }

    await this.mailService.sendVehicleClaimResultEmail(
      invite.claimant.email,
      invite.claimant.firstName,
      invite.vehicle.licensePlate,
      outcome,
      {
        inviteId: invite.id,
        vehicleId: invite.vehicleId,
        workshopId: invite.workshopId,
        userId: invite.claimantUserId ?? undefined,
      },
    );
  }
}
