import type { VehicleClaimStatus } from '@prisma/client';
import { CLAIM_OPEN_STATUSES } from '../services/claim-state.service';

/**
 * Todos los estados del invite, en el orden del enum de Prisma.
 *
 * El listado y el detalle del taller trabajan con el estado **efectivo**: un
 * invite abierto cuyo `expiresAt` ya pasó se muestra `expired` aunque la fila
 * todavía diga `pending` (expiración lazy, D-TL-VC-7/T15).
 */
export const CLAIM_STATUSES: readonly VehicleClaimStatus[] = [
  'pending',
  'verification_required',
  'verified',
  'manual_review',
  'claimed',
  'claim_blocked',
  'expired',
  'revoked',
];

export function isClaimStatus(value: string): value is VehicleClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function effectiveClaimStatus(
  status: VehicleClaimStatus,
  expiresAt: Date,
  now: Date = new Date(),
): VehicleClaimStatus {
  if (
    CLAIM_OPEN_STATUSES.includes(status) &&
    expiresAt.getTime() <= now.getTime()
  ) {
    return 'expired';
  }
  return status;
}
