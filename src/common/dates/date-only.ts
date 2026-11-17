/**
 * Fechas calendario (date-only) — Plan 05 / D-TZ-1, D-TZ-4.
 *
 * Regla del contrato (congelada):
 *   - Una **fecha calendario** viaja como `YYYY-MM-DD` (`CareEpisode.serviceDate`).
 *   - Un **instante** viaja como ISO-8601 con `Z` (`checkedInAt`, `createdAt`, ...).
 *
 * Este módulo es el ÚNICO camino de parseo/formato de fechas calendario:
 * `new Date('2026-11-11')` produce medianoche UTC por especificación, pero
 * `new Date('2026-11-11T00:00:00')` (sin offset) se interpreta en la TZ del
 * servidor — parseo no determinista que causó el bug. `parseDateOnly` acepta
 * exclusivamente la forma canónica `YYYY-MM-DD`.
 *
 * NO usar estos helpers para instantes: truncarían la hora.
 */

/** Forma canónica en el wire. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Años < 100 no son representables: `Date.UTC(26, ...)` los mapea a 1926 y el
 * round-trip dejaría de ser fiel al string de entrada.
 */
const MIN_REPRESENTABLE_YEAR = 100;

/**
 * Parseo interno: devuelve `null` ante cualquier forma no canónica, fecha
 * inexistente (`2026-02-30`) o año no representable.
 */
function parseOrNull(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_REPRESENTABLE_YEAR) return null;

  // `Date.UTC` normaliza overflow (2026-02-30 → 2026-03-02): el round-trip
  // contra los componentes de entrada es lo que rechaza esas fechas.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Type guard de fecha calendario válida en el wire.
 *
 * Es la validación que debe usar el borde del handler (400 propio) antes de
 * llamar a `parseDateOnly`, que asume entrada ya validada.
 */
export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && parseOrNull(value) !== null;
}

/**
 * `YYYY-MM-DD` → `Date` a medianoche **UTC** (`2026-11-11` →
 * `2026-11-11T00:00:00.000Z`). Determinista e independiente de la TZ del
 * servidor / del proceso.
 *
 * @throws RangeError si el valor no es una fecha calendario canónica.
 *   Llamar antes con `isDateOnly` para responder 400 sin excepciones.
 */
export function parseDateOnly(value: string): Date {
  const parsed = parseOrNull(value);
  if (!parsed) {
    throw new RangeError(
      `Invalid date-only value ${JSON.stringify(value)}: expected YYYY-MM-DD`,
    );
  }
  return parsed;
}

/**
 * `Date` (persistida) → `YYYY-MM-DD` para el wire.
 *
 * `null` pasa de largo. Una `Invalid Date` devuelve `null` en lugar de lanzar:
 * `toISOString()` lanza `RangeError` y un dato corrupto en DB se convertiría en
 * un 500 (R6 del review).
 */
export function formatDateOnly(date: Date | null): string | null {
  if (!date) return null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
