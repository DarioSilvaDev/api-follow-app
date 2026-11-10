import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CLAIM_LINK_INVALID_MESSAGE } from '../../claim-messages';
import type { PublicClaimResponse } from '../../dto/public-claim-response.dto';
import {
  CLAIM_OPEN_STATUSES,
  ClaimStateService,
} from '../../services/claim-state.service';

/**
 * GetPublicClaimHandler — bootstrap `GET /api/vehicle-claims/public/:token`.
 *
 * Contrato AC-3/D-VC-4: devuelve EXCLUSIVAMENTE `status` y `canVerify`. El
 * formulario es estático en el frontend; acá no se revela patente, vehículo,
 * taller, kilometraje ni marca/modelo.
 *
 * Side-effect T2: el primer GET de un invite `pending` lo pasa a
 * `verification_required` y setea `openedAt` (métrica del piloto). La
 * expiración y la baja del vehículo se resuelven en `loadByToken` (lazy).
 */
@Injectable()
export class GetPublicClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: ClaimStateService,
  ) {}

  async execute(token: string): Promise<PublicClaimResponse> {
    const invite = await this.state.loadByToken(token);
    if (!invite) {
      throw new NotFoundException(CLAIM_LINK_INVALID_MESSAGE);
    }

    let status = invite.status;

    if (status === 'pending') {
      const updated = await this.prisma.vehicleClaimInvite.updateMany({
        where: { id: invite.id, status: 'pending' },
        data: {
          status: 'verification_required',
          openedAt: invite.openedAt ?? new Date(),
        },
      });
      if (updated.count > 0) {
        status = 'verification_required';
      }
    }

    return {
      data: {
        status,
        canVerify: CLAIM_OPEN_STATUSES.includes(status),
      },
    };
  }
}
