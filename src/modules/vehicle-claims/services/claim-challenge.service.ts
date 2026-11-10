import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/** Ancho de cada rango de kilometraje (D-TL-VC-13). */
export const CLAIM_RANGE_WIDTH_KM = 250;

export type ClaimFactor = 'vin' | 'mileage' | 'manual_review';

export interface ClaimChallengeOption {
  id: string;
  label: string;
}

export interface ClaimChallenge {
  factor: ClaimFactor;
  options: ClaimChallengeOption[];
}

export type ClaimRangeVerification = 'valid' | 'manual_review' | 'invalid';

interface RangeOption extends ClaimChallengeOption {
  start: number;
  end: number;
  correct: boolean;
}

/**
 * ClaimChallengeService — factor aplicable y multiple choice de odómetro.
 *
 * Precedencia (F-2/F-3): con VIN registrado el único factor son los últimos 4
 * del VIN; sin VIN se usan rangos de ~250 km sobre el odómetro de la última
 * atención; sin ninguno de los dos → revisión manual.
 *
 * El orden de los rangos es estable por invite (semilla = `inviteId`), así que
 * reintentos del mismo link ven las mismas opciones y el `verify` puede
 * revalidar el `mileageRangeId` sin persistir el challenge. Nunca se revela
 * cuál es el rango correcto.
 */
@Injectable()
export class ClaimChallengeService {
  resolveFactor(vin: string | null, mileageIn: number | null): ClaimFactor {
    if (vin && vin.trim().length > 0) return 'vin';
    if (mileageIn !== null && Number.isFinite(mileageIn)) return 'mileage';
    return 'manual_review';
  }

  /** Challenge de odómetro: 4-6 rangos + "No lo sé". */
  build(inviteId: string, mileageIn: number): ClaimChallenge {
    const ranges = this.buildRanges(inviteId, mileageIn);
    return {
      factor: 'mileage',
      options: [
        ...ranges.map(({ id, label }) => ({ id, label })),
        { id: 'unknown', label: 'No lo sé' },
      ],
    };
  }

  /**
   * Valida un `mileageRangeId` contra las opciones que emitiría el challenge
   * para ese invite. `unknown` deriva a revisión manual (T6) sin revelar nada.
   */
  verifyRange(
    inviteId: string,
    mileageIn: number,
    rangeId: string,
  ): ClaimRangeVerification {
    if (rangeId === 'unknown') return 'manual_review';

    const range = this.buildRanges(inviteId, mileageIn).find(
      (option) => option.id === rangeId,
    );
    if (!range) return 'invalid';
    return range.correct ? 'valid' : 'invalid';
  }

  private buildRanges(inviteId: string, mileageIn: number): RangeOption[] {
    const random = this.mulberry32(this.seedFrom(inviteId));
    const count = 4 + Math.floor(random() * 3); // 4..6
    const base =
      Math.floor(mileageIn / CLAIM_RANGE_WIDTH_KM) * CLAIM_RANGE_WIDTH_KM;

    // La posición del rango correcto se sortea, pero no puede haber más rangos
    // debajo de 0 km. `below` queda acotado por la cantidad de múltiplos de
    // 250 disponibles antes de `base`, sin mover nunca el rango correcto.
    const desiredBelow = Math.floor(random() * count);
    const below = Math.min(
      desiredBelow,
      Math.floor(base / CLAIM_RANGE_WIDTH_KM),
    );
    const above = count - 1 - below;

    const ranges: RangeOption[] = [];
    let displayIndex = 0;
    for (let k = -below; k <= above; k++) {
      const start = base + k * CLAIM_RANGE_WIDTH_KM;
      ranges.push({
        id: `r${displayIndex + 1}`,
        label: `${formatKm(start)}–${formatKm(start + CLAIM_RANGE_WIDTH_KM)} km`,
        start,
        end: start + CLAIM_RANGE_WIDTH_KM,
        correct: k === 0,
      });
      displayIndex++;
    }
    return ranges;
  }

  private seedFrom(inviteId: string): number {
    return createHash('sha256')
      .update(inviteId, 'utf8')
      .digest()
      .readUInt32BE(0);
  }

  /** PRNG determinista y barato (mulberry32). */
  private mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

/** `45000` → `45.000` (separador de miles rioplatense). */
function formatKm(value: number): string {
  return Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
