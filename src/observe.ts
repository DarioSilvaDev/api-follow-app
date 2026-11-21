import { createObserveModule } from '@nestjs/observe';
import { resolveRequestId } from './common/utils/request-id';

/**
 * Fábrica de módulo de Observe. Se crea una sola vez, a nivel de aplicación.
 *
 * Decisiones:
 * - MISMO id que pino: `traceIdGenerator` usa el resolver compartido, con la
 *   misma validación de `x-request-id` y el mismo `randomUUID()` de fallback.
 *   Como Observe corre antes que pino-http, el ID que minta acá es el que
 *   después adopta `genReqId`; no hay dos UUID para un mismo request.
 * - `sourceContext: false`: no mandar fragmentos del código fuente al APM.
 * - `attachTraceIdToLogs: false`: el parche de Observe sólo alcanza a
 *   ConsoleLogger y acá el logger es pino; la correlación se agrega con un
 *   `mixin` en `LoggerModule.forRootAsync()` (ver app.module.ts).
 */
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  traceIdGenerator: (req) => resolveRequestId(req),
  sourceContext: false,
  attachTraceIdToLogs: false,
});
