import { randomUUID } from 'node:crypto';

/**
 * Identificador de correlación único para el request.
 *
 * Pino (`genReqId`) y Observe (`traceIdGenerator`) corren en momentos distintos
 * del ciclo de vida: el hook de request de Observe se registra en el adapter y
 * corre ANTES de cualquier middleware de Nest, mientras que pino-http corre
 * como middleware. Por eso la resolución vive acá y no en cada módulo: el
 * primero que la necesita la calcula, la guarda en un WeakMap por requesting
 * object y el otro la reutiliza. Así no hay dos UUID distintos cuando el
 * cliente no envió `x-request-id`.
 *
 * La validación es la misma que ya usaba Fase 1: se adopta el header entrante
 * sólo si tiene un formato acotado (anti log-injection / ids arbitrarios en
 * telemetría); en cualquier otro caso se minta un UUID v4.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Mínimo 8 caracteres, máximo 128; arranca con alfanumérico. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

const requestIds = new WeakMap<object, string>();

type HeaderCarrier = {
  headers?: Record<string, string | string[] | undefined>;
};

/**
 * Devuelve (y memoiza) el ID de correlación del request. Acepta el objeto de
 * request que entrega Express o el `unknown` del `traceIdGenerator` de Observe.
 */
export function resolveRequestId(req: unknown): string {
  if (req === null || (typeof req !== 'object' && typeof req !== 'function')) {
    return randomUUID();
  }

  const request = req as HeaderCarrier;
  const alreadyResolved = requestIds.get(request);
  if (alreadyResolved && REQUEST_ID_PATTERN.test(alreadyResolved)) {
    return alreadyResolved;
  }

  const header = request.headers?.[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const id =
    typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
      ? value
      : randomUUID();

  requestIds.set(request, id);
  return id;
}
