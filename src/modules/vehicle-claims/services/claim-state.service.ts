import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VehicleClaimStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  CLAIM_EXPIRED_MESSAGE,
  CLAIM_LOCKED_MESSAGE,
  CLAIM_REVOKED_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../claim-messages';
import { VehicleClaimRevokedEvent } from '../events/vehicle-claim-revoked.event';
import { ClaimTokenService } from './claim-token.service';

/** Ventana de conteo de fallos (S-3/§6.4). */
export const CLAIM_LOCK_WINDOW_MS = 15 * 60 * 1000;
/** Auto-liberación del lock (lazy, sin cron). */
export const CLAIM_LOCK_DURATION_MS = 30 * 60 * 1000;
/** Fallos dentro de la ventana que disparan lock. */
export const CLAIM_MAX_FAILED_ATTEMPTS = 5;
/** Lockouts acumulados que disparan auto-revocación (T19). */
export const CLAIM_MAX_LOCKOUTS = 3;

/** Estados sin retorno (el índice parcial los deja fuera de "vigente"). */
const TERMINAL_STATUSES: VehicleClaimStatus[] = [
  'claimed',
  'claim_blocked',
  'revoked',
];

/** Estados donde todavía tiene sentido leer/verificar/reclamar. */
export const CLAIM_OPEN_STATUSES: VehicleClaimStatus[] = [
  'pending',
  'verification_required',
  'verified',
  'manual_review',
];

/** Alias interno (se mantiene el nombre corto en el resto del servicio). */
const OPEN_STATUSES = CLAIM_OPEN_STATUSES;

export type ClaimDb = Prisma.TransactionClient;

export interface ClaimInviteSnapshot {
  id: string;
  vehicleId: string;
  workshopId: string;
  careEpisodeId: string | null;
  status: VehicleClaimStatus;
  expiresAt: Date;
  openedAt: Date | null;
  verifiedAt: Date | null;
  failedAttempts: number;
  lastFailedAt: Date | null;
  verificationLockedAt: Date | null;
  lockoutCount: number;
  usedAt: Date | null;
  claimantUserId: string | null;
  vehicle: {
    id: string;
    licensePlate: string;
    vin: string | null;
    deletedAt: Date | null;
  };
  /** Odómetro de la última atención con lectura (fuente del multiple choice). */
  mileageIn: number | null;
}

export interface ClaimFailureMeta {
  ip: string | null;
  userAgent: string | null;
  plateInput: string | null;
}

export interface ClaimFailureResult {
  status: VehicleClaimStatus;
  locked: boolean;
  autoRevoked: boolean;
  failedAttempts: number;
}

/**
 * ClaimStateService — expiración lazy, auto-liberación del lock y escalera de
 * intentos fallidos (T2-T4, T15, T19).
 *
 * Sin cron: cada acceso pasa por `loadByToken`, que aplica la expiración y la
 * liberación del lock si corresponde. Los contadores viven en la fila del
 * invite (`failedAttempts`, `lastFailedAt`, `verificationLockedAt`,
 * `lockoutCount`), no en memoria.
 */
@Injectable()
export class ClaimStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: ClaimTokenService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Busca por `sha256(token)` (nunca por token crudo), aplica expiración lazy
   * y devuelve un snapshot con el vehículo y el último odómetro conocido.
   */
  async loadByToken(token: string): Promise<ClaimInviteSnapshot | null> {
    const tokenHash = this.tokenService.hashToken(token);
    const raw = await this.prisma.vehicleClaimInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        vehicleId: true,
        workshopId: true,
        careEpisodeId: true,
        status: true,
        expiresAt: true,
        openedAt: true,
        verifiedAt: true,
        failedAttempts: true,
        lastFailedAt: true,
        verificationLockedAt: true,
        lockoutCount: true,
        usedAt: true,
        claimantUserId: true,
        vehicle: {
          select: {
            id: true,
            licensePlate: true,
            vin: true,
            deletedAt: true,
            careEpisodes: {
              where: { mileageIn: { not: null } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { mileageIn: true },
            },
          },
        },
      },
    });

    if (!raw) return null;

    const snapshot: ClaimInviteSnapshot = {
      id: raw.id,
      vehicleId: raw.vehicleId,
      workshopId: raw.workshopId,
      careEpisodeId: raw.careEpisodeId,
      status: raw.status,
      expiresAt: raw.expiresAt,
      openedAt: raw.openedAt,
      verifiedAt: raw.verifiedAt,
      failedAttempts: raw.failedAttempts,
      lastFailedAt: raw.lastFailedAt,
      verificationLockedAt: raw.verificationLockedAt,
      lockoutCount: raw.lockoutCount,
      usedAt: raw.usedAt,
      claimantUserId: raw.claimantUserId,
      vehicle: {
        id: raw.vehicle.id,
        licensePlate: raw.vehicle.licensePlate,
        vin: raw.vehicle.vin,
        deletedAt: raw.vehicle.deletedAt,
      },
      mileageIn: raw.vehicle.careEpisodes[0]?.mileageIn ?? null,
    };

    return this.refresh(snapshot);
  }

  /**
   * Expiración lazy (T15) y auto-liberación del lock (T4). No toca estados
   * terminales. Si el invite ya está `expired`, no reescribe.
   */
  async refresh(invite: ClaimInviteSnapshot): Promise<ClaimInviteSnapshot> {
    if (TERMINAL_STATUSES.includes(invite.status)) return invite;

    const now = new Date();

    // T16: vehículo dado de baja (soft-delete, ADR-005). Se revoca antes de
    // evaluar la expiración para que el dueño no vea "vencido" un vehículo que
    // ya no existe. El evento lo consume C-4 (mail al taller).
    if (invite.vehicle.deletedAt !== null) {
      const revoked = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.vehicleClaimInvite.updateMany({
          // T16 aplica a cualquier estado no-terminal, incluido `expired`.
          where: { id: invite.id, status: { notIn: TERMINAL_STATUSES } },
          data: {
            status: 'revoked',
            revokedAt: now,
            revokeReason: 'vehicle_deleted',
            verificationLockedAt: null,
          },
        });
        return updated.count > 0;
      });

      if (revoked) {
        this.eventEmitter.emit(
          'vehicle-claim.revoked',
          new VehicleClaimRevokedEvent(
            invite.id,
            invite.vehicleId,
            invite.workshopId,
            'vehicle_deleted',
            false,
          ),
        );
        return { ...invite, status: 'revoked' };
      }
    }

    if (
      invite.status !== 'expired' &&
      invite.expiresAt.getTime() <= now.getTime()
    ) {
      await this.prisma.vehicleClaimInvite.updateMany({
        where: { id: invite.id, status: { in: OPEN_STATUSES } },
        data: { status: 'expired' },
      });
      return { ...invite, status: 'expired' };
    }

    if (invite.status === 'expired') return invite;

    if (
      invite.verificationLockedAt !== null &&
      invite.verificationLockedAt.getTime() + CLAIM_LOCK_DURATION_MS <=
        now.getTime()
    ) {
      const released = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.vehicleClaimInvite.updateMany({
          where: {
            id: invite.id,
            verificationLockedAt: invite.verificationLockedAt,
          },
          data: {
            failedAttempts: 0,
            lastFailedAt: null,
            verificationLockedAt: null,
          },
        });
        if (updated.count === 0) return false;

        await tx.vehicleClaimAttempt.create({
          data: { inviteId: invite.id, outcome: 'lockout_released' },
        });
        return true;
      });

      if (released) {
        return {
          ...invite,
          failedAttempts: 0,
          lastFailedAt: null,
          verificationLockedAt: null,
        };
      }
    }

    return invite;
  }

  /** Rechaza estados terminales con el status HTTP del contrato público. */
  assertOpen(invite: ClaimInviteSnapshot): void {
    if (invite.status === 'expired') {
      throw new GoneException(CLAIM_EXPIRED_MESSAGE);
    }
    if (invite.status === 'revoked') {
      throw new GoneException(CLAIM_REVOKED_MESSAGE);
    }
    if (invite.status === 'claimed' || invite.status === 'claim_blocked') {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }
  }

  /** 409 de lock temporal (T4). */
  assertNotLocked(invite: ClaimInviteSnapshot): void {
    if (invite.verificationLockedAt !== null) {
      throw new ConflictException(CLAIM_LOCKED_MESSAGE);
    }
  }

  /**
   * Registra un fallo de verificación y aplica la escalera F-4:
   * 5 fallos en 15 min → lock 30 min; 3 lockouts → auto-revocación (T19).
   *
   * La ventana se reinicia si pasaron más de 15 min desde el último fallo.
   */
  async registerFailure(
    invite: ClaimInviteSnapshot,
    meta: ClaimFailureMeta,
  ): Promise<ClaimFailureResult> {
    const now = new Date();
    const withinWindow =
      invite.lastFailedAt !== null &&
      now.getTime() - invite.lastFailedAt.getTime() <= CLAIM_LOCK_WINDOW_MS;
    const failedAttempts = (withinWindow ? invite.failedAttempts : 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const attemptBase = {
        inviteId: invite.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        plateInput: meta.plateInput,
      };

      if (failedAttempts < CLAIM_MAX_FAILED_ATTEMPTS) {
        await tx.vehicleClaimInvite.update({
          where: { id: invite.id },
          data: { failedAttempts, lastFailedAt: now },
        });
        await tx.vehicleClaimAttempt.create({
          data: { ...attemptBase, outcome: 'verification_failed' },
        });
        return {
          status: invite.status,
          locked: false,
          autoRevoked: false,
          failedAttempts,
        };
      }

      const updated = await tx.vehicleClaimInvite.update({
        where: { id: invite.id },
        data: {
          failedAttempts,
          lastFailedAt: now,
          verificationLockedAt: now,
          lockoutCount: { increment: 1 },
        },
        select: { lockoutCount: true },
      });

      await tx.vehicleClaimAttempt.create({
        data: { ...attemptBase, outcome: 'verification_failed' },
      });

      if (updated.lockoutCount >= CLAIM_MAX_LOCKOUTS) {
        await tx.vehicleClaimInvite.update({
          where: { id: invite.id },
          data: {
            status: 'revoked',
            revokedAt: now,
            revokeReason: 'max_attempts',
            verificationLockedAt: null,
          },
        });
        await tx.vehicleClaimAttempt.create({
          data: { inviteId: invite.id, outcome: 'auto_revoked' },
        });
        return {
          status: 'revoked',
          locked: false,
          autoRevoked: true,
          failedAttempts,
        };
      }

      await tx.vehicleClaimAttempt.create({
        data: { inviteId: invite.id, outcome: 'lockout_started' },
      });
      return {
        status: 'verification_required',
        locked: true,
        autoRevoked: false,
        failedAttempts,
      };
    });
  }

  /** T5: `verified` sin consumir el single-use (`usedAt` queda intacto). */
  async markVerified(invite: ClaimInviteSnapshot): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleClaimInvite.updateMany({
        where: { id: invite.id, status: { in: OPEN_STATUSES } },
        data: {
          status: 'verified',
          verifiedAt: now,
          failedAttempts: 0,
          lastFailedAt: null,
          verificationLockedAt: null,
        },
      });
      await tx.vehicleClaimAttempt.create({
        data: { inviteId: invite.id, outcome: 'verification_passed' },
      });
    });
  }

  /** T6: sin dato verificable o "No lo sé". Nunca aprueba automáticamente. */
  async markManualReview(invite: ClaimInviteSnapshot): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleClaimInvite.updateMany({
        where: { id: invite.id, status: { in: OPEN_STATUSES } },
        data: { status: 'manual_review', verifiedAt: now },
      });
      await tx.vehicleClaimAttempt.create({
        data: { inviteId: invite.id, outcome: 'manual_review' },
      });
    });
  }

  /** T20: ticket vencido/inválido devuelve el invite a verificación. */
  async resetVerifiedAfterTicketExpiry(
    invite: ClaimInviteSnapshot,
  ): Promise<void> {
    if (invite.status !== 'verified') return;
    await this.prisma.vehicleClaimInvite.updateMany({
      where: { id: invite.id, status: 'verified' },
      data: { status: 'verification_required', verifiedAt: null },
    });
  }
}
