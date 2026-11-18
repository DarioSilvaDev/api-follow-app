import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CodedHttpException } from '../exceptions/coded.exception';
import { ErrorCode, ERROR_CODES } from '../exceptions/error-codes';
import { sanitizeUrl } from '../utils/sanitize-url';

// Token redaction logic shared with the pino-http req serializer lives in
// `src/common/utils/sanitize-url.ts` (single source of truth).

/**
 * Global exception filter that maps all errors to the standardized
 * error envelope contract (D-025).
 *
 * Registered as APP_FILTER in main.ts.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const envelope = this.toEnvelope(exception);

    this.logger.error(
      `[${request.method}] ${sanitizeUrl(request.url)} → ${envelope.statusCode} [${envelope.code}]`,
      // The raw exception stack can echo the FULL raw URL (with tokens), so
      // it is sanitized too. The envelope contract (`msg`) is already clean.
      exception instanceof Error && exception.stack
        ? sanitizeUrl(exception.stack)
        : undefined,
    );

    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): {
    statusCode: number;
    message: string;
    code: ErrorCode;
    errors?: Record<string, unknown>;
  } {
    // ── CodedHttpException (our own) ──
    if (exception instanceof CodedHttpException) {
      const res = exception.getResponse() as {
        statusCode: number;
        message: string;
        code: ErrorCode;
        errors?: Record<string, unknown>;
      };
      return {
        statusCode: res.statusCode,
        message: res.message,
        code: res.code,
        errors: res.errors,
      };
    }

    // ── NestJS HttpException with object response (ValidationPipe, etc.) ──
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;

        // ValidationPipe: message is string[]
        if (
          status === HttpStatus.BAD_REQUEST &&
          Array.isArray(obj['message'])
        ) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Validation failed',
            code: ERROR_CODES.VALIDATION_ERROR,
            errors: { fields: obj['message'] },
          };
        }

        // HttpException that already carries a shape we can preserve
        return {
          statusCode: status,
          message: (obj['message'] as string) ?? exception.message,
          code: this.statusToCode(status),
        };
      }

      // Bare HttpException with string message
      return {
        statusCode: status,
        message: exception.message,
        code: this.statusToCode(status),
      };
    }

    // ── Multer upload errors (multipart) — S4 evidence uploads ──
    // FileInterceptor propaga MulterError (no es HttpException): sin este
    // mapeo, un archivo > límite se respondería 500. El MIME inválido es
    // rechazado por evidenceFileFilter como BadRequestException (400) y ya
    // pasa por la rama HttpException. ERROR_CODES no define PAYLOAD_TOO_LARGE;
    // se reutiliza VALIDATION_ERROR (cambio de contrato requeriría TL).
    if (this.isMulterError(exception)) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        return {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          message: 'El archivo excede el tamaño máximo permitido',
          code: ERROR_CODES.VALIDATION_ERROR,
        };
      }
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          exception.code === 'LIMIT_FILE_COUNT' ||
          exception.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Cantidad de archivos inválida para el request'
            : exception.message,
        code: ERROR_CODES.VALIDATION_ERROR,
      };
    }

    // ── Prisma P2002 unique constraint violation ──
    if (this.isPrismaError(exception) && exception.code === 'P2002') {
      const target = (exception.meta as { target?: string[] })?.target;
      return {
        statusCode: HttpStatus.CONFLICT,
        message: `Unique constraint violation${target?.length ? ` on: ${target.join(', ')}` : ''}`,
        code: ERROR_CODES.CONFLICT,
      };
    }

    // ── Fallback: generic 500 ──
    // NOTE: INTERNAL_ERROR is used as a pragmatic fallback code. The approved
    // D-025 code set (error-codes.ts) defines 8 stable codes and does not include
    // a generic server-error code — surfaced to Tech Lead for confirmation.
    // El error se loguea una sola vez, en el punto de catch() (arriba).
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }

  /**
   * Maps bare HTTP status codes to stable error codes.
   */
  private statusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.SESSION_EXPIRED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.PERMISSION_DENIED;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private isPrismaError(
    exception: unknown,
  ): exception is { code: string; meta?: unknown } {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>)['code'] === 'string'
    );
  }

  private isMulterError(
    exception: unknown,
  ): exception is { code: string; message: string } {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as Record<string, unknown>)['name'] === 'MulterError' &&
      typeof (exception as Record<string, unknown>)['code'] === 'string'
    );
  }
}
