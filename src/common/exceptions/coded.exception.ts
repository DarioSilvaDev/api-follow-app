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
  constructor(message = 'Invalid or unauthorized active context') {
    super(HttpStatus.FORBIDDEN, message, ERROR_CODES.INVALID_CONTEXT);
  }
}

export class SessionExpiredException extends CodedHttpException {
  constructor(message = 'Session expired') {
    super(HttpStatus.UNAUTHORIZED, message, ERROR_CODES.SESSION_EXPIRED);
  }
}

export class ImpersonationExpiredException extends CodedHttpException {
  constructor(message = 'Impersonation session expired') {
    super(HttpStatus.UNAUTHORIZED, message, ERROR_CODES.IMPERSONATION_EXPIRED);
  }
}

export class InvalidCredentialsException extends CodedHttpException {
  constructor(message = 'Invalid credentials') {
    super(HttpStatus.UNAUTHORIZED, message, ERROR_CODES.INVALID_CREDENTIALS);
  }
}

export class PermissionDeniedException extends CodedHttpException {
  constructor(message = 'Permission denied') {
    super(HttpStatus.FORBIDDEN, message, ERROR_CODES.PERMISSION_DENIED);
  }
}

/**
 * D-106 wizard de onboarding: la operación requiere una sesión activa (la
 * cuenta invitada ya existe y está activa, pero no se envió sesión).
 * 401 con código explícito para que el frontend pueda disparar su flujo de
 * login sin depender únicamente del mapeo genérico de `statusToCode`.
 */
export class AuthRequiredException extends CodedHttpException {
  constructor(message = 'Authentication required') {
    super(HttpStatus.UNAUTHORIZED, message, ERROR_CODES.AUTH_REQUIRED);
  }
}

export class InvitationInvalidException extends CodedHttpException {
  constructor(message = 'Invitation not found') {
    super(HttpStatus.NOT_FOUND, message, ERROR_CODES.INVITATION_INVALID);
  }
}

export class InvitationExpiredException extends CodedHttpException {
  constructor(message = 'Invitation expired') {
    super(HttpStatus.BAD_REQUEST, message, ERROR_CODES.INVITATION_EXPIRED);
  }
}

export class InvitationUsedException extends CodedHttpException {
  constructor(message = 'Invitation has already been used') {
    super(HttpStatus.CONFLICT, message, ERROR_CODES.INVITATION_USED);
  }
}

export class InvitationCancelledException extends CodedHttpException {
  constructor(message = 'Invitation has been cancelled') {
    super(HttpStatus.CONFLICT, message, ERROR_CODES.INVITATION_CANCELLED);
  }
}
