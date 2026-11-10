import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_VERIFY_FAILED_MESSAGE,
} from '../../claim-messages';
import type { ClaimChallengeResponse } from '../../dto/public-claim-response.dto';
import { ClaimChallengeService } from '../../services/claim-challenge.service';
import { ClaimStateService } from '../../services/claim-state.service';
import { normalizeLicensePlate } from '../../utils/claim-input';

/**
 * GetClaimChallengeHandler — `GET /public/:token/challenge?licensePlate=`.
 *
 * Plate-gated: si la patente no coincide con la del invite, responde el mismo
 * 400 único que `verify` (anti-enumeración). Devuelve el factor aplicable y,
 * sólo para odómetro, las 4-6 opciones + "No lo sé" (F-3/D-TL-VC-13).
 *
 * Con VIN registrado el factor es `vin` y `options` queda vacío: el frontend
 * muestra el input de últimos 4. Sin VIN ni odómetro → `manual_review` sin
 * opciones. El backend nunca indica cuál rango es el correcto.
 */
@Injectable()
export class GetClaimChallengeHandler {
  constructor(
    private readonly state: ClaimStateService,
    private readonly challenge: ClaimChallengeService,
  ) {}

  async execute(
    token: string,
    rawLicensePlate: string | undefined,
  ): Promise<ClaimChallengeResponse> {
    const invite = await this.state.loadByToken(token);
    if (!invite) {
      throw new NotFoundException(CLAIM_LINK_INVALID_MESSAGE);
    }

    this.state.assertOpen(invite);
    this.state.assertNotLocked(invite);

    const plate =
      typeof rawLicensePlate === 'string' ? rawLicensePlate.trim() : '';
    if (
      plate.length === 0 ||
      normalizeLicensePlate(plate) !==
        normalizeLicensePlate(invite.vehicle.licensePlate)
    ) {
      throw new BadRequestException(CLAIM_VERIFY_FAILED_MESSAGE);
    }

    const factor = this.challenge.resolveFactor(
      invite.vehicle.vin,
      invite.mileageIn,
    );

    const mileageIn = invite.mileageIn;
    if (factor === 'mileage' && mileageIn !== null) {
      return { data: this.challenge.build(invite.id, mileageIn) };
    }

    return { data: { factor, options: [] } };
  }
}
