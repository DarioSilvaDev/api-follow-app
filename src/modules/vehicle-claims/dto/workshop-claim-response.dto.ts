import type {
  VehicleClaimOutcome,
  VehicleClaimRevokeReason,
  VehicleClaimStatus,
} from '@prisma/client';

/**
 * Respuesta del alta manual (POST /api/vehicle-claims).
 *
 * `link` y `whatsappUrl` sólo se incluyen cuando se emitió un token nuevo
 * (creación o reactivación). En la reutilización idempotente de un invite
 * vigente el token ya no se puede recuperar: el panel re-muestra el QR
 * (`qrImageUrl`) y ofrece revocar/generar uno nuevo (S-1).
 */
export interface WorkshopClaimCreateData {
  id: string;
  vehicleId: string;
  licensePlate: string;
  status: VehicleClaimStatus;
  link?: string;
  whatsappUrl?: string | null;
  qrImageUrl: string | null;
  ownerPhone: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface WorkshopClaimCreateResponse {
  data: WorkshopClaimCreateData;
}

export interface WorkshopClaimListItem {
  id: string;
  vehicleId: string;
  licensePlate: string;
  status: VehicleClaimStatus;
  claimOutcome: VehicleClaimOutcome | null;
  ownerPhone: string | null;
  openedAt: Date | null;
  verifiedAt: Date | null;
  usedAt: Date | null;
  failedAttempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkshopClaimListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: Record<VehicleClaimStatus, number>;
}

export interface WorkshopClaimListResponse {
  data: WorkshopClaimListItem[];
  meta: WorkshopClaimListMeta;
}

export interface WorkshopClaimAttemptItem {
  id: string;
  outcome: string;
  createdAt: Date;
}

export interface WorkshopClaimDetail {
  id: string;
  vehicleId: string;
  careEpisodeId: string | null;
  status: VehicleClaimStatus;
  claimOutcome: VehicleClaimOutcome | null;
  ownerPhone: string | null;
  claimantUserId: string | null;
  openedAt: Date | null;
  verifiedAt: Date | null;
  usedAt: Date | null;
  failedAttempts: number;
  lastFailedAt: Date | null;
  verificationLockedAt: Date | null;
  lockoutCount: number;
  expiresAt: Date;
  blockedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: VehicleClaimRevokeReason | null;
  createdAt: Date;
  updatedAt: Date;
  qrImageUrl: string | null;
  attempts: WorkshopClaimAttemptItem[];
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
  claimant?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface WorkshopClaimDetailResponse {
  data: WorkshopClaimDetail;
}

export type WorkshopClaimReviewResponse =
  | {
      data: { status: 'claimed'; outcome: VehicleClaimOutcome };
    }
  | {
      data: { status: 'revoked'; reason: VehicleClaimRevokeReason };
    };

export interface WorkshopClaimRevokeResponse {
  data: {
    status: 'revoked';
    reason: VehicleClaimRevokeReason;
    ownershipUndone: boolean;
  };
}
