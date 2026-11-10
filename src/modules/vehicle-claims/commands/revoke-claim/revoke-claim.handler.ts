import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  VehicleClaimOutcome,
  VehicleClaimRevokeReason,
  VehicleClaimStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  CLAIM_MANUAL_REVIEW_REJECT_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import type { WorkshopClaimRevokeResponse } from '../../dto/workshop-claim-response.dto';
import { VehicleClaimRevokedEvent } from '../../events/vehicle-claim-revoked.event';
import { CLAIM_OPEN_STATUSES } from '../../services/claim-state.service';
import { effectiveClaimStatus } from '../../utils/effective-claim-status';
import { RevokeClaimCommand } from './revoke-claim.command';

interface ScopedInvite {
  id: string;
  vehicleId: string;
  workshopId: string;
  status: VehicleClaimStatus;
  expiresAt: Date;
  claimOutcome: VehicleClaimOutcome | null;
}

/**
 * RevokeClaimHandler — `POST /api/vehicle-claims/:id/revoke` (T13/T14).
 *
 * Se permite sobre `pending`, `verification_required` y `verified`, y sobre
 * `claimed`. Sobre `claimed` con `ownership_created` cierra en la misma
 * transacción el ownership creado por este invite (`acquiredByClaimInviteId`,
 * guard `endsAt: null`) y devuelve `ownershipUndone: true` (D-TL-VC-11).
 * `already_owner` no toca ownership.
 *
 * `manual_review` NO se revoca: se rechaza con `POST /:id/reject` (T12), que
 * emite `manual_review_rejected` y le avisa al reclamante. Revocarlo acá
 * emitiría `by_workshop`, que el listener descarta porque no hay ownership
 * que deshacer, y el rechazo quedaría silencioso.
 *
 * `expired`, `revoked` y `claim_blocked` ya no tienen link vivo: 409.
 * El texto libre del body no se persiste (no hay columna); el motivo canónico
 * del enum es `by_workshop` (taller) o `by_admin` (plataforma).
 *
 * C-6 / F-8 — contexto admin (`POST /api/admin/vehicle-claims/:id/revoke`,
 * permiso `admin.vehicle-claims.manage`): el mismo handler sin scope de
 * taller (lookup solo por `id`, el admin ve cualquier invite) y con motivo
 * `by_admin`. Las reglas de estado, el cierre de ownership y los 409
 * (`manual_review`, no vigente, carrera) son idénticos al revoke del taller.
 */
@Injectable()
export class RevokeClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: RevokeClaimCommand,
  ): Promise<WorkshopClaimRevokeResponse> {
    const invite = await this.findScoped(command.id, command.workshopId);
    if (!invite) {
      throw new NotFoundException(CLAIM_NOT_FOUND_MESSAGE);
    }

    const status = effectiveClaimStatus(invite.status, invite.expiresAt);
    if (status === 'manual_review') {
      throw new ConflictException(CLAIM_MANUAL_REVIEW_REJECT_MESSAGE);
    }

    const revocable =
      status === 'claimed' || CLAIM_OPEN_STATUSES.includes(status);
    if (!revocable) {
      throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
    }

    const revokeReason: VehicleClaimRevokeReason =
      command.context.type === 'admin' ? 'by_admin' : 'by_workshop';

    const now = new Date();

    const ownershipUndone = await this.prisma.$transaction(async (tx) => {
      let undone = false;

      if (status === 'claimed' && invite.claimOutcome === 'ownership_created') {
        const closed = await tx.vehicleOwnership.updateMany({
          where: {
            acquiredByClaimInviteId: invite.id,
            endsAt: null,
          },
          data: { endsAt: now },
        });
        undone = closed.count > 0;
      }

      const updated = await tx.vehicleClaimInvite.updateMany({
        where: {
          id: invite.id,
          workshopId: invite.workshopId,
          status: invite.status,
        },
        data: {
          status: 'revoked',
          revokedAt: now,
          revokeReason,
          revokedByUserId: command.userId,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
      }

      return undone;
    });

    this.eventEmitter.emit(
      'vehicle-claim.revoked',
      new VehicleClaimRevokedEvent(
        invite.id,
        invite.vehicleId,
        invite.workshopId,
        revokeReason,
        false,
      ),
    );

    return {
      data: {
        status: 'revoked',
        reason: revokeReason,
        ownershipUndone,
      },
    };
  }

  /**
   * Workshop: scope por `workshopId` (404 si es de otro taller). Admin (C-6):
   * lookup solo por `id` — el permiso `admin.vehicle-claims.manage` es la
   * frontera de autorización, no el taller.
   */
  private async findScoped(
    id: string,
    workshopId: string | null,
  ): Promise<ScopedInvite | null> {
    return this.prisma.vehicleClaimInvite.findFirst({
      where: workshopId ? { id, workshopId } : { id },
      select: {
        id: true,
        vehicleId: true,
        workshopId: true,
        status: true,
        expiresAt: true,
        claimOutcome: true,
      },
    });
  }
}
