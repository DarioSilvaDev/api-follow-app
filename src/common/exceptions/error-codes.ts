/**
 * Stable error codes for the standardized error envelope (D-025).
 *
 * These codes are consumed by the frontend to drive UX behavior:
 * - 403 never implies logout
 * - 401 triggers refresh → retry → redirect
 * - IMPERSONATION_EXPIRED triggers /impersonation-expired flow
 * - INVALID_CONTEXT reserves for D-004/D-021 recovery UX
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
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
