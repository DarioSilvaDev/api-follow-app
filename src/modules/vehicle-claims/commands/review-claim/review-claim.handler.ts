import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VehicleClaimStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  CLAIM_ACCOUNT_REQUIRED_MESSAGE,
  CLAIM_BLOCKED_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import type { WorkshopClaimReviewResponse } from '../../dto/workshop-claim-response.dto';
import { VehicleClaimBlockedEvent } from '../../events/vehicle-claim-blocked.event';
import { VehicleClaimClaimedEvent } from '../../events/vehicle-claim-claimed.event';
import { VehicleClaimRevokedEvent } from '../../events/vehicle-claim-revoked.event';
import { effectiveClaimStatus } from '../../utils/effective-claim-status';
import { ReviewClaimCommand } from './review-claim.command';

interface ScopedInvite {
  id: string;
  vehicleId: string;
  workshopId: string;
  status: VehicleClaimStatus;
  expiresAt: Date;
  claimantUserId: string | null;
}

/**
 * ReviewClaimHandler — `approve` (T11) y `reject` (T12) de la revisión manual.
 *
 * Ambas acciones exigen que el invite siga en `manual_review` (estado
 * efectivo: un invite vencido no se aprueba). Un invite de otro taller
 * responde 404. El `approve` requiere cuenta vinculada (`claimantUserId`) y
 * replica la transacción de T7; un `P2002` del índice parcial de ownership se
 * traduce a `claim_blocked` (T9) sin tocar el titular existente.
 */
@Injectable()
export class ReviewClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: ReviewClaimCommand,
  ): Promise<WorkshopClaimReviewResponse> {
    const invite = await this.findScoped(command.id, command.workshopId);
    if (!invite) {
      throw new NotFoundException(CLAIM_NOT_FOUND_MESSAGE);
    }

    if (command.action === 'reject') {
      return this.reject(invite, command.userId);
    }

    return this.approve(invite);
  }

  private async approve(
    invite: ScopedInvite,
  ): Promise<WorkshopClaimReviewResponse> {
    if (!this.isManualReview(invite)) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    const claimantUserId = invite.claimantUserId;
    if (!claimantUserId) {
      throw new ConflictException(CLAIM_ACCOUNT_REQUIRED_MESSAGE);
    }

    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.vehicleClaimInvite.updateMany({
          where: {
            id: invite.id,
            workshopId: invite.workshopId,
            status: 'manual_review',
          },
          data: {
            status: 'claimed',
            usedAt: now,
            claimOutcome: 'ownership_created',
            claimantUserId,
          },
        });
        if (updated.count === 0) {
          throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
        }

        await tx.vehicleOwnership.create({
          data: {
            vehicleId: invite.vehicleId,
            userId: claimantUserId,
            type: 'owner',
            startsAt: now,
            endsAt: null,
            acquiredByClaimInviteId: invite.id,
          },
        });
        await tx.vehicleClaimAttempt.create({
          data: { inviteId: invite.id, outcome: 'claim_success' },
        });
      });
    } catch (error) {
      if (this.isActivePrimaryConflict(error)) {
        await this.markBlocked(invite, claimantUserId, now);
        this.eventEmitter.emit(
          'vehicle-claim.blocked',
          new VehicleClaimBlockedEvent(
            invite.id,
            invite.vehicleId,
            invite.workshopId,
            claimantUserId,
          ),
        );
        throw new ConflictException(CLAIM_BLOCKED_MESSAGE);
      }
      throw error;
    }

    this.eventEmitter.emit(
      'vehicle-claim.claimed',
      new VehicleClaimClaimedEvent(
        invite.id,
        invite.vehicleId,
        invite.workshopId,
        claimantUserId,
        'ownership_created',
      ),
    );

    return { data: { status: 'claimed', outcome: 'ownership_created' } };
  }

  private async reject(
    invite: ScopedInvite,
    userId: string,
  ): Promise<WorkshopClaimReviewResponse> {
    if (!this.isManualReview(invite)) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    const now = new Date();
    const updated = await this.prisma.vehicleClaimInvite.updateMany({
      where: {
        id: invite.id,
        workshopId: invite.workshopId,
        status: 'manual_review',
      },
      data: {
        status: 'revoked',
        revokedAt: now,
        revokeReason: 'manual_review_rejected',
        revokedByUserId: userId,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    this.eventEmitter.emit(
      'vehicle-claim.revoked',
      new VehicleClaimRevokedEvent(
        invite.id,
        invite.vehicleId,
        invite.workshopId,
        'manual_review_rejected',
        false,
      ),
    );

    return { data: { status: 'revoked', reason: 'manual_review_rejected' } };
  }

  private async findScoped(
    id: string,
    workshopId: string,
  ): Promise<ScopedInvite | null> {
    return this.prisma.vehicleClaimInvite.findFirst({
      where: { id, workshopId },
      select: {
        id: true,
        vehicleId: true,
        workshopId: true,
        status: true,
        expiresAt: true,
        claimantUserId: true,
      },
    });
  }

  /** `manual_review` vigente (no vencido). */
  private isManualReview(invite: ScopedInvite): boolean {
    return (
      effectiveClaimStatus(invite.status, invite.expiresAt) === 'manual_review'
    );
  }

  /** P2002 del índice parcial de ownership primario (D-155). */
  private isActivePrimaryConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  /**
   * Marca `claim_blocked` en una transacción aparte (la original hizo rollback
   * por el P2002). No toca el ownership existente.
   */
  private async markBlocked(
    invite: ScopedInvite,
    claimantUserId: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleClaimInvite.updateMany({
        where: {
          id: invite.id,
          workshopId: invite.workshopId,
          status: 'manual_review',
        },
        data: {
          status: 'claim_blocked',
          blockedAt: now,
          claimantUserId,
        },
      });
      if (updated.count === 0) return;

      await tx.vehicleClaimAttempt.create({
        data: { inviteId: invite.id, outcome: 'claim_blocked' },
      });
    });
  }
}
