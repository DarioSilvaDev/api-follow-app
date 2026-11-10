import type { VehicleClaimStatus } from '@prisma/client';
import type {
  ClaimChallengeOption,
  ClaimFactor,
} from '../services/claim-challenge.service';

/** `GET /public/:token` — contrato AC-3: sólo `status` + `canVerify`. */
export interface PublicClaimResponse {
  data: {
    status: VehicleClaimStatus;
    canVerify: boolean;
  };
}

/** `GET /public/:token/challenge` — sólo el factor y las opciones. */
export interface ClaimChallengeResponse {
  data: {
    factor: ClaimFactor;
    options: ClaimChallengeOption[];
  };
}

export type VerifyClaimResponse =
  | {
      data: { status: 'verified'; ticket: string; expiresIn: number };
    }
  | {
      data: { status: 'manual_review'; ticket: string };
    };

export type CommitClaimResponse =
  | {
      data: {
        status: 'claimed';
        outcome: 'ownership_created' | 'already_owner';
      };
    }
  | {
      data: { status: 'manual_review' };
    };
