import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  AuthRequiredException,
  TicketExpiredException,
} from '../../../../common/exceptions/coded.exception';
import {
  CLAIM_BLOCKED_MESSAGE,
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import type { CommitClaimResponse } from '../../dto/public-claim-response.dto';
import { VehicleClaimBlockedEvent } from '../../events/vehicle-claim-blocked.event';
import { VehicleClaimClaimedEvent } from '../../events/vehicle-claim-claimed.event';
import {
  ClaimInviteSnapshot,
  ClaimStateService,
} from '../../services/claim-state.service';
import {
  ClaimTicketPayload,
  ClaimTokenService,
} from '../../services/claim-token.service';
import { CommitClaimCommand } from './commit-claim.command';

type CommitKind = 'created' | 'already_owner' | 'blocked' | 'conflict';

/**
 * CommitClaimHandler — T7/T8/T9/T10/T20 del reclamo público.
 *
 * Orden de guardas (contrato §5.1/§6.5):
 * 1. 404 si el token no existe (nunca se revela si el formato es válido).
 * 2. 401 `AUTH_REQUIRED` si no hay sesión (el frontend redirige a login/registro
 *    preservando el token).
 * 3. 409/410 si el invite ya es terminal.
 * 4. 401 `TICKET_EXPIRED` si el ticket venció o no corresponde a este invite;
 *    si estaba `verified`, vuelve a `verification_required` sin gastar intentos
 *    (T20).
 * 5. Commit en `$transaction` interactiva con `updateMany(verified→claimed)`
 *    como guarda atómica del single-use (D-178 #1). Un `P2002` del índice
 *    `vehicle_ownerships_one_active_primary` se traduce a `claim_blocked` (T9)
 *    sin cerrar el ownership existente.
 *
 * `already_owner` sólo aplica cuando la sesión ES el titular activo y no es una
 * concesionaria (`type = 'company'`). Cualquier otro caso se bloquea.
 */
@Injectable()
export class CommitClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: ClaimStateService,
    private readonly tokenService: ClaimTokenService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CommitClaimCommand): Promise<CommitClaimResponse> {
    const { token, dto, sessionUserId } = command;

    const invite = await this.state.loadByToken(token);
    if (!invite) {
      throw new NotFoundException(CLAIM_LINK_INVALID_MESSAGE);
    }

    // Sin sesión no hay identidad: se corta ANTES de evaluar terminales para
    // que el frontend siempre pueda redirigir a login/registro.
    if (!sessionUserId) {
      throw new AuthRequiredException();
    }

    this.state.assertOpen(invite);

    const payload = await this.verifyTicketOrReset(invite, dto.ticket);
    if (
      payload.inviteId !== invite.id ||
      payload.vehicleId !== invite.vehicleId
    ) {
      await this.state.resetVerifiedAfterTicketExpiry(invite);
      throw new TicketExpiredException();
    }

    if (invite.status === 'manual_review') {
      return this.linkManualReview(invite, sessionUserId);
    }

    if (invite.status !== 'verified') {
      // Ticket válido sobre un invite que ya no está verificado (p. ej. otra
      // pestaña lo reseteó): se trata como ticket vencido, sin gastar intentos.
      await this.state.resetVerifiedAfterTicketExpiry(invite);
      throw new TicketExpiredException();
    }

    const now = new Date();
    let kind: CommitKind;

    try {
      kind = await this.prisma.$transaction(async (tx) => {
        const active = await tx.vehicleOwnership.findFirst({
          where: {
            vehicleId: invite.vehicleId,
            endsAt: null,
            type: { not: 'co_owner' },
          },
          orderBy: { startsAt: 'desc' },
          select: { id: true, userId: true, type: true },
        });

        if (active) {
          if (active.userId === sessionUserId && active.type !== 'company') {
            const updated = await tx.vehicleClaimInvite.updateMany({
              where: { id: invite.id, status: 'verified' },
              data: {
                status: 'claimed',
                usedAt: now,
                claimOutcome: 'already_owner',
                claimantUserId: sessionUserId,
              },
            });
            if (updated.count === 0) return 'conflict';

            await tx.vehicleClaimAttempt.create({
              data: { inviteId: invite.id, outcome: 'claim_already_owner' },
            });
            return 'already_owner';
          }

          const updated = await tx.vehicleClaimInvite.updateMany({
            where: { id: invite.id, status: 'verified' },
            data: {
              status: 'claim_blocked',
              blockedAt: now,
              claimantUserId: sessionUserId,
            },
          });
          if (updated.count === 0) return 'conflict';

          await tx.vehicleClaimAttempt.create({
            data: { inviteId: invite.id, outcome: 'claim_blocked' },
          });
          return 'blocked';
        }

        // Guarda atómica del single-use: sólo el primero que ve `verified`
        // gana. `usedAt` se setea acá y nunca en `verify` (F-10).
        const updated = await tx.vehicleClaimInvite.updateMany({
          where: { id: invite.id, status: 'verified' },
          data: {
            status: 'claimed',
            usedAt: now,
            claimOutcome: 'ownership_created',
            claimantUserId: sessionUserId,
          },
        });
        if (updated.count === 0) return 'conflict';

        await tx.vehicleOwnership.create({
          data: {
            vehicleId: invite.vehicleId,
            userId: sessionUserId,
            type: 'owner',
            startsAt: now,
            endsAt: null,
            acquiredByClaimInviteId: invite.id,
          },
        });
        await tx.vehicleClaimAttempt.create({
          data: { inviteId: invite.id, outcome: 'claim_success' },
        });
        return 'created';
      });
    } catch (error) {
      if (this.isActivePrimaryConflict(error)) {
        await this.markClaimBlocked(invite, sessionUserId, now);
        this.eventEmitter.emit(
          'vehicle-claim.blocked',
          new VehicleClaimBlockedEvent(
            invite.id,
            invite.vehicleId,
            invite.workshopId,
            sessionUserId,
          ),
        );
        throw new ConflictException(CLAIM_BLOCKED_MESSAGE);
      }
      throw error;
    }

    if (kind === 'conflict') {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    if (kind === 'blocked') {
      this.eventEmitter.emit(
        'vehicle-claim.blocked',
        new VehicleClaimBlockedEvent(
          invite.id,
          invite.vehicleId,
          invite.workshopId,
          sessionUserId,
        ),
      );
      throw new ConflictException(CLAIM_BLOCKED_MESSAGE);
    }

    this.eventEmitter.emit(
      'vehicle-claim.claimed',
      new VehicleClaimClaimedEvent(
        invite.id,
        invite.vehicleId,
        invite.workshopId,
        sessionUserId,
        kind === 'created' ? 'ownership_created' : 'already_owner',
      ),
    );

    return {
      data: {
        status: 'claimed',
        outcome: kind === 'created' ? 'ownership_created' : 'already_owner',
      },
    };
  }

  /** Verifica firma/expiración y, si falla, resetea T20 antes de propagar. */
  private async verifyTicketOrReset(
    invite: ClaimInviteSnapshot,
    ticket: string,
  ): Promise<ClaimTicketPayload> {
    try {
      return this.tokenService.verifyTicket(ticket);
    } catch (error) {
      if (error instanceof TicketExpiredException) {
        // T20: el estado vuelve a `verification_required` antes de responder
        // el 401, sin gastar intentos.
        await this.state.resetVerifiedAfterTicketExpiry(invite);
      }
      throw error;
    }
  }

  /**
   * T10: vincula la cuenta al invite en `manual_review`. No consume el
   * single-use: el claim recién se materializa con el `approve` del taller.
   */
  private async linkManualReview(
    invite: ClaimInviteSnapshot,
    sessionUserId: string,
  ): Promise<CommitClaimResponse> {
    if (invite.claimantUserId && invite.claimantUserId !== sessionUserId) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    const updated = await this.prisma.vehicleClaimInvite.updateMany({
      where: { id: invite.id, status: 'manual_review' },
      data: { claimantUserId: sessionUserId },
    });
    if (updated.count === 0) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    return { data: { status: 'manual_review' } };
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
  private async markClaimBlocked(
    invite: ClaimInviteSnapshot,
    sessionUserId: string,
    now: Date,
  ): Promise<void> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicleClaimInvite.updateMany({
        where: { id: invite.id, status: 'verified' },
        data: {
          status: 'claim_blocked',
          blockedAt: now,
          claimantUserId: sessionUserId,
        },
      });
      if (result.count === 0) return false;

      await tx.vehicleClaimAttempt.create({
        data: { inviteId: invite.id, outcome: 'claim_blocked' },
      });
      return true;
    });

    if (!updated) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }
  }
}
