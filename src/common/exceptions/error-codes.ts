/**
 * Stable error codes for the standardized error envelope (D-025).
 *
 * These codes are consumed by the frontend to drive UX behavior:
 * - 403 never implies logout
 * - 401 triggers refresh → retry → redirect
 * - IMPERSONATION_EXPIRED triggers /impersonation-expired flow
 * - INVALID_CONTEXT reserves for D-004/D-021 recovery UX
 * - RATE_LIMITED maps HTTP 429 from @nestjs/throttler (D-025 Amendment)
 */
export const ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  IMPERSONATION_EXPIRED: 'IMPERSONATION_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // D-106 wizard de onboarding: la cuenta autenticada NO es la invitada.
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  // D-106 wizard de onboarding: token inválido / vencido / usado / cancelado.
  INVITATION_INVALID: 'INVITATION_INVALID',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_USED: 'INVITATION_USED',
  INVITATION_CANCELLED: 'INVITATION_CANCELLED',
  // D-A (PM confirmado): el CUIT de una concesionaria reclamada/operativa no
  // puede modificarse salvo super_admin. 409 con code propio para que el
  // frontend mapee copy exacta. NUNCA se emite para duplicados normales
  // (esos siguen usando CONFLICT).
  DEALERSHIP_CUIT_LOCKED: 'DEALERSHIP_CUIT_LOCKED',
  // C-2 reclamo público: el ticket de 20 min del flujo verify → commit venció o
  // no corresponde a este invite. El frontend vuelve a pedir verificación sin
  // gastar intentos (T20).
  TICKET_EXPIRED: 'TICKET_EXPIRED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
