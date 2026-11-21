import { RequestMethod } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';
import { buildPinoOptions, LOGGER_FOR_ROUTES } from './pino-options';

const tracer = (currentTraceId: string | null) =>
  ({ currentTraceId: () => currentTraceId }) as unknown as TracerService;

describe('buildPinoOptions', () => {
  it('registra middleware con rutas compatibles con Nest 11 + Express 5', () => {
    // Regresión: el DEFAULT_ROUTES de nestjs-pino 4.6.1 (`'*'`) es rechazado
    // por Express 5 y deja la app sin request logging ni x-request-id.
    expect(LOGGER_FOR_ROUTES).toEqual([
      { path: '/', method: RequestMethod.ALL },
      { path: '{*splat}', method: RequestMethod.ALL },
    ]);
    expect(LOGGER_FOR_ROUTES.some((route) => route.path === '*')).toBe(false);
    expect(buildPinoOptions(tracer(null)).forRoutes).toBe(LOGGER_FOR_ROUTES);
  });

  it('adopta un x-request-id válido y lo publica como header de respuesta', () => {
    const { genReqId } = buildPinoOptions(tracer(null)).pinoHttp;
    const res = { setHeader: jest.fn() } as any;

    const id = genReqId(
      { headers: { 'x-request-id': 'cliente-123456' } } as any,
      res,
    );

    expect(id).toBe('cliente-123456');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('genera un UUID y lo publica cuando el header no es válido', () => {
    const { genReqId } = buildPinoOptions(tracer(null)).pinoHttp;
    const res = { setHeader: jest.fn() } as any;

    const id = genReqId({ headers: { 'x-request-id': 'no válido' } } as any, res);

    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('agrega el traceId activo al log y lo omite fuera de un trace', () => {
    expect(buildPinoOptions(tracer('traza-123')).pinoHttp.mixin()).toEqual({
      traceId: 'traza-123',
    });
    expect(buildPinoOptions(tracer(null)).pinoHttp.mixin()).toEqual({});
  });

  it('redacta credenciales e ignora el health check', () => {
    const { redact, autoLogging } = buildPinoOptions(tracer(null)).pinoHttp;

    expect(redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.refreshToken',
      ]),
    );
    expect(redact.censor).toBe('[REDACTED]');
    expect(autoLogging.ignore({ url: '/api/health' } as any)).toBe(true);
    expect(autoLogging.ignore({ url: '/api/auth/login' } as any)).toBe(false);
  });
});
