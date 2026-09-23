import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { CodedHttpException } from '../exceptions/coded.exception';
import { ERROR_CODES } from '../exceptions/error-codes';

describe('AllExceptionsFilter — D-025 / SC-2 redacción de tokens en logs', () => {
  let filter: AllExceptionsFilter;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  const createHost = (url: string, method = 'GET') => {
    const req = { url, method } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const host = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;
    return { req, res, host };
  };

  const lastLoggedMessage = (): string =>
    loggerSpy.mock.calls[loggerSpy.mock.calls.length - 1][0] as string;

  it('redacta el token de invitación del wizard en el path (SC-2)', () => {
    const { host } = createHost(
      '/api/dealerships/wizard/invitations/token-inv-123',
    );
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);

    const msg = lastLoggedMessage();
    expect(msg).toContain('/dealerships/wizard/invitations/{token}');
    expect(msg).not.toContain('token-inv-123');
  });

  it('redacta el token query de verify-email / reset-password (SC-2)', () => {
    const { host } = createHost('/api/auth/verify-email?token=abc-token-xyz');
    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);

    const msg = lastLoggedMessage();
    expect(msg).toContain('token=[REDACTED]');
    expect(msg).not.toContain('abc-token-xyz');
  });

  it('redacta el token de invitación del wizard de usuarios en el path (SC-2)', () => {
    const { host } = createHost('/api/users/wizard/invitations/token-user-456');
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);

    const msg = lastLoggedMessage();
    expect(msg).toContain('/users/wizard/invitations/{token}');
    expect(msg).not.toContain('token-user-456');
  });

  it('redacta el token aunque haya query adicional después', () => {
    const { host } = createHost(
      '/api/auth/reset-password?token=reset-abc&lang=es',
    );
    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);

    const msg = lastLoggedMessage();
    expect(msg).toContain('token=[REDACTED]&lang=es');
    expect(msg).not.toContain('reset-abc');
  });

  it('mantiene la URL completa para rutas sin token (debugging)', () => {
    const { host } = createHost('/api/vehicles/123/documents?page=2');
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);

    const msg = lastLoggedMessage();
    expect(msg).toContain('[GET] /api/vehicles/123/documents?page=2');
    expect(msg).toContain('→ 404 [NOT_FOUND]');
  });

  it('conserva el envelope de respuesta estandarizado (D-025)', () => {
    const { res, host } = createHost('/api/foo');
    filter.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'nope',
        code: 'NOT_FOUND',
      }),
    );
  });

  it('D-A: serializa DEALERSHIP_CUIT_LOCKED como 409 con el code exacto del contrato', () => {
    const { res, host } = createHost('/api/admin/dealerships/d1');
    filter.catch(
      new CodedHttpException(
        HttpStatus.CONFLICT,
        'El CUIT no puede modificarse porque la concesionaria ya fue reclamada y está activa',
        ERROR_CODES.DEALERSHIP_CUIT_LOCKED,
      ),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        code: 'DEALERSHIP_CUIT_LOCKED',
        message:
          'El CUIT no puede modificarse porque la concesionaria ya fue reclamada y está activa',
      }),
    );
  });

  // ──────────────────────────────────────────────────────
  // Multer upload errors (S4 evidence uploads)
  // ──────────────────────────────────────────────────────

  const multerError = (code: string) => {
    const err = new Error(`Multer error ${code}`);
    Object.assign(err, { name: 'MulterError', code });
    return err;
  };

  it('mapea LIMIT_FILE_SIZE a 413 (Payload Too Large)', () => {
    const { res, host } = createHost('/api/care-episodes/x/attachments');
    filter.catch(multerError('LIMIT_FILE_SIZE'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'El archivo excede el tamaño máximo permitido',
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('mapea LIMIT_FILE_COUNT a 400', () => {
    const { res, host } = createHost('/api/care-episodes/x/attachments');
    filter.catch(multerError('LIMIT_FILE_COUNT'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
      }),
    );
  });

  it('NO mapea errors no-Multer como si fueran Multer (500 genérico preservado)', () => {
    const { res, host } = createHost('/api/foo');
    filter.catch(new Error('boom'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    );
  });
});
