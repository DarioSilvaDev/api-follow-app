import { IncomingMessage } from 'node:http';
import { sanitizeUrl } from './sanitize-url';

/**
 * Readiness/liveness: no queremos ruido de health checks ni en pino ni en
 * Observe. Compartir la condición evita que un lado ignore `/api/health` y el
 * otro siga reportándolo.
 */
export function shouldIgnoreHealth(req: IncomingMessage): boolean {
  return !!req.url && sanitizeUrl(req.url).startsWith('/api/health');
}
