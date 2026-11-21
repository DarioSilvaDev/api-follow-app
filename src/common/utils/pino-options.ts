import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';
import { envs } from '../../config/envs';
import { shouldIgnoreHealth } from './ignore-health';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';
import { sanitizeUrl } from './sanitize-url';

/**
 * nestjs-pino 4.6.1 trae por defecto `{ path: '*' }`, un patrón legacy que
 * Nest 11 + Express 5 rechaza ("Unsupported route path"). Sin esta declaración
 * explícita el middleware de pino-http NO se registra: no hay `x-request-id`
 * ni logs de request, aunque el logger de bootstrap funcione.
 *
 * `{*splat}` es la sintaxis soportada por path-to-regexp v8. Se agrega `/`
 * aparte porque, con el prefijo global `api`, `{*splat}` no cubre la raíz
 * exacta `/api`.
 */
export const LOGGER_FOR_ROUTES = [
  { path: '/', method: RequestMethod.ALL },
  { path: '{*splat}', method: RequestMethod.ALL },
];

/** Opciones de `LoggerModule.forRootAsync`, aisladas para poder probarlas. */
export function buildPinoOptions(tracer: TracerService) {
  return {
    forRoutes: LOGGER_FOR_ROUTES,
    pinoHttp: {
      level: envs.LOG_LEVEL,
      // Mismo resolver que el `traceIdGenerator` de Observe. Observe corre
      // primero (hook del adapter), así que acá se reutiliza su ID cuando el
      // cliente no mandó header; si no, se minta acá y Observe lo lee.
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = resolveRequestId(req);
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      // `attachTraceIdToLogs` de Observe sólo parchea ConsoleLogger; el logger
      // global es pino, así que inyectamos el trace activo acá. Fuera de un
      // trace devuelve null y no agregamos el campo.
      mixin: () => {
        const traceId = tracer.currentTraceId();
        return traceId ? { traceId } : {};
      },
      // Defensa en profundidad (capa 1): nada de Authorization/cookies/
      // password en las líneas de log. Observe redacta además por su lado.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'res.headers["set-cookie"]',
          'password',
          '*.password',
          'accessToken',
          'refreshToken',
          '*.accessToken',
          '*.refreshToken',
          '*.passwordHash',
        ],
        censor: '[REDACTED]',
      },
      autoLogging: {
        // Readiness/liveness: ruido sin payload. Tampoco genera trace.
        ignore: shouldIgnoreHealth,
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: sanitizeUrl(req.url ?? ''),
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
