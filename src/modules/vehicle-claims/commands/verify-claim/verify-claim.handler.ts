import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_VERIFY_FAILED_MESSAGE,
} from '../../claim-messages';
import type { VerifyClaimResponse } from '../../dto/public-claim-response.dto';
import { VehicleClaimManualReviewEvent } from '../../events/vehicle-claim-manual-review.event';
import { VehicleClaimRevokedEvent } from '../../events/vehicle-claim-revoked.event';
import { VehicleClaimVerifiedEvent } from '../../events/vehicle-claim-verified.event';
import { VehicleClaimVerifyFailedEvent } from '../../events/vehicle-claim-verify-failed.event';
import {
  ClaimChallengeService,
  type ClaimFactor,
} from '../../services/claim-challenge.service';
import {
  ClaimInviteSnapshot,
  ClaimStateService,
} from '../../services/claim-state.service';
import {
  CLAIM_TICKET_TTL_SECONDS,
  ClaimTokenService,
} from '../../services/claim-token.service';
import { normalizeLicensePlate, normalizeVin } from '../../utils/claim-input';
import { VerifyClaimCommand } from './verify-claim.command';

/**
 * VerifyClaimHandler — T3/T4/T5/T6/T19 del reclamo público.
 *
 * Precedencia de factores (F-2/F-3):
 * - con VIN registrado sólo cuentan los últimos 4 del VIN (`mileageRangeId` se
 *   ignora por completo);
 * - sin VIN y con `mileageIn` en la última atención → multiple choice;
 * - sin ninguno de los dos → `manual_review` (nunca `verified`).
 *
 * Todos los fallos de comparación devuelven el MISMO 400 (anti-enumeración,
 * §6.6). El `verify` exitoso NO consume el single-use: `usedAt` sólo se setea
 * en el commit (F-10).
 */
@Injectable()
export class VerifyClaimHandler {
  constructor(
    private readonly state: ClaimStateService,
    private readonly challenge: ClaimChallengeService,
    private readonly tokenService: ClaimTokenService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: VerifyClaimCommand): Promise<VerifyClaimResponse> {
    const { token, dto, ip, userAgent } = command;

    const invite = await this.state.loadByToken(token);
    if (!invite) {
      throw new NotFoundException(CLAIM_LINK_INVALID_MESSAGE);
    }

    // T15/T16 ya se aplicaron en `loadByToken` (lazy). Los estados terminales
    // no se pueden verificar.
    this.state.assertOpen(invite);
    this.state.assertNotLocked(invite);

    const plateMatches =
      normalizeLicensePlate(dto.licensePlate) ===
      normalizeLicensePlate(invite.vehicle.licensePlate);
    const factor = this.challenge.resolveFactor(
      invite.vehicle.vin,
      invite.mileageIn,
    );

    let outcome: 'verified' | 'manual_review' | 'invalid' = 'invalid';

    if (plateMatches) {
      outcome = this.evaluateFactor(invite, factor, dto);
    }

    if (outcome === 'manual_review') {
      await this.state.markManualReview(invite);
      this.eventEmitter.emit(
        'vehicle-claim.manual-review',
        new VehicleClaimManualReviewEvent(
          invite.id,
          invite.vehicleId,
          invite.workshopId,
        ),
      );
      return {
        data: {
          status: 'manual_review',
          ticket: this.tokenService.signTicket(invite.id, invite.vehicleId),
        },
      };
    }

    if (outcome === 'invalid') {
      const failure = await this.state.registerFailure(invite, {
        ip,
        userAgent,
        plateInput: normalizeLicensePlate(dto.licensePlate),
      });

      this.eventEmitter.emit(
        'vehicle-claim.verify-failed',
        new VehicleClaimVerifyFailedEvent(
          invite.id,
          invite.vehicleId,
          invite.workshopId,
          failure.failedAttempts,
          failure.locked,
          failure.autoRevoked,
        ),
      );

      if (failure.autoRevoked) {
        this.eventEmitter.emit(
          'vehicle-claim.revoked',
          new VehicleClaimRevokedEvent(
            invite.id,
            invite.vehicleId,
            invite.workshopId,
            'max_attempts',
            true,
          ),
        );
      }

      throw new BadRequestException(CLAIM_VERIFY_FAILED_MESSAGE);
    }

    await this.state.markVerified(invite);
    this.eventEmitter.emit(
      'vehicle-claim.verified',
      new VehicleClaimVerifiedEvent(
        invite.id,
        invite.vehicleId,
        invite.workshopId,
      ),
    );

    return {
      data: {
        status: 'verified',
        ticket: this.tokenService.signTicket(invite.id, invite.vehicleId),
        expiresIn: CLAIM_TICKET_TTL_SECONDS,
      },
    };
  }

  /**
   * Aplica el factor ya resuelto. Devuelve `manual_review` sólo cuando la
   * patente coincide y no hay ningún dato verificable (o el usuario eligió
   * "No lo sé"), sin gastar un intento.
   */
  private evaluateFactor(
    invite: ClaimInviteSnapshot,
    factor: ClaimFactor,
    dto: VerifyClaimCommand['dto'],
  ): 'verified' | 'manual_review' | 'invalid' {
    if (factor === 'vin') {
      if (!dto.vinLast4) return 'invalid';
      const expected = normalizeVin(invite.vehicle.vin ?? '').slice(-4);
      return normalizeVin(dto.vinLast4) === expected ? 'verified' : 'invalid';
    }

    if (factor === 'mileage') {
      if (!dto.mileageRangeId) return 'invalid';
      const result = this.challenge.verifyRange(
        invite.id,
        invite.mileageIn as number,
        dto.mileageRangeId,
      );
      if (result === 'manual_review') return 'manual_review';
      return result === 'valid' ? 'verified' : 'invalid';
    }

    // Sin VIN y sin odómetro: la patente sola nunca alcanza (D-VC-2/AC-25).
    return 'manual_review';
  }
}
