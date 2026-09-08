import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ERROR_CODES } from './error-codes';

/**
 * Standardized HTTP exception with a stable error code (D-025).
 *
 * The `code` field is a stable identifier consumed by the frontend.
 * The `errors` field carries structured validation details when applicable.
 */
export class CodedHttpException extends HttpException {
  constructor(
    status: number,
    message: string,
    code: ErrorCode,
    errors?: Record<string, unknown>,
  ) {
    super({ statusCode: status, message, code, errors }, status);
  }

  getCode(): ErrorCode {
    return (this.getResponse() as { code: ErrorCode }).code;
  }
}

// ─── Factory exceptions ──────────────────────────────────────────────

export class InvalidContextException extends CodedHttpException {
  constructor(
    message = 'Invalid or unauthorized active context',
  ) {
    super(
      HttpStatus.FORBIDDEN,
      message,
      ERROR_CODES.INVALID_CONTEXT,
    );
  }
}

export class SessionExpiredException extends CodedHttpException {
  constructor(message = 'Session expired') {
    super(
      HttpStatus.UNAUTHORIZED,
      message,
      ERROR_CODES.SESSION_EXPIRED,
    );
  }
}

export class ImpersonationExpiredException extends CodedHttpException {
  constructor(message = 'Impersonation session expired') {
    super(
      HttpStatus.UNAUTHORIZED,
      message,
      ERROR_CODES.IMPERSONATION_EXPIRED,
    );
  }
}

export class InvalidCredentialsException extends CodedHttpException {
  constructor(message = 'Invalid credentials') {
    super(
      HttpStatus.UNAUTHORIZED,
      message,
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }
}
