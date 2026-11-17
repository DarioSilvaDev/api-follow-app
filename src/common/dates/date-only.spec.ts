import { formatDateOnly, isDateOnly, parseDateOnly } from './date-only';

/**
 * Helpers de fecha calendario (Plan 05 — B-TZ-1).
 *
 * Contrato: `YYYY-MM-DD` ↔ `Date` a medianoche UTC. `formatDateOnly` nunca
 * lanza (dato corrupto → `null`, nunca 500).
 */
describe('date-only — helpers de fecha calendario (D-TZ-1/D-TZ-4)', () => {
  describe('parseDateOnly', () => {
    it('parsea YYYY-MM-DD a medianoche UTC', () => {
      const date = parseDateOnly('2026-11-11');

      expect(date.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    });

    it('es independiente de la TZ del proceso (UTC-3 → mismo instante)', () => {
      // El bug original nacía de interpretar el string en la TZ del servidor.
      expect(parseDateOnly('2026-11-11').getTime()).toBe(
        Date.UTC(2026, 10, 11),
      );
    });

    it('rechaza una fecha inexistente por overflow (2026-02-30)', () => {
      expect(() => parseDateOnly('2026-02-30')).toThrow(RangeError);
    });

    it('rechaza un date-time ISO completo', () => {
      expect(() => parseDateOnly('2026-11-11T00:00:00Z')).toThrow(RangeError);
    });

    it('rechaza un date-time ISO sin offset (parseo no determinista)', () => {
      expect(() => parseDateOnly('2026-11-11T00:00:00')).toThrow(RangeError);
    });

    it('rechaza formato local (11/11/2026)', () => {
      expect(() => parseDateOnly('11/11/2026')).toThrow(RangeError);
    });

    it('rechaza años no representables (< 100)', () => {
      // Date.UTC(26, 10, 11) → 1926, el round-trip ya no es fiel.
      expect(() => parseDateOnly('0026-11-11')).toThrow(RangeError);
    });

    it('rechaza strings vacíos o no-string', () => {
      expect(() => parseDateOnly('')).toThrow(RangeError);
      expect(() => parseDateOnly(undefined as unknown as string)).toThrow(
        RangeError,
      );
    });

    it('acepta los bordes de mes/año', () => {
      expect(parseDateOnly('2026-01-01').toISOString()).toBe(
        '2026-01-01T00:00:00.000Z',
      );
      expect(parseDateOnly('2024-02-29').toISOString()).toBe(
        '2024-02-29T00:00:00.000Z',
      );
      expect(parseDateOnly('2026-12-31').toISOString()).toBe(
        '2026-12-31T00:00:00.000Z',
      );
    });
  });

  describe('isDateOnly', () => {
    it('acepta solo la forma canónica', () => {
      expect(isDateOnly('2026-11-11')).toBe(true);
      expect(isDateOnly('2026-02-30')).toBe(false);
      expect(isDateOnly('2026-11-11T00:00:00Z')).toBe(false);
      expect(isDateOnly('11/11/2026')).toBe(false);
      expect(isDateOnly(new Date())).toBe(false);
      expect(isDateOnly(null)).toBe(false);
      expect(isDateOnly(undefined)).toBe(false);
    });
  });

  describe('formatDateOnly', () => {
    it('formatea un Date como YYYY-MM-DD en UTC', () => {
      const formatted = formatDateOnly(new Date('2026-11-11T00:00:00.000Z'));

      expect(formatted).toBe('2026-11-11');
      expect(formatted).toHaveLength(10);
    });

    it('usa el día calendario UTC aunque el Date tenga hora', () => {
      // 2026-11-11T09:00Z (seed) sigue siendo 11/11, no 10/11.
      expect(formatDateOnly(new Date('2026-11-11T09:00:00.000Z'))).toBe(
        '2026-11-11',
      );
    });

    it('devuelve null para null', () => {
      expect(formatDateOnly(null)).toBeNull();
    });

    it('devuelve null para Invalid Date sin lanzar RangeError', () => {
      expect(() => formatDateOnly(new Date(NaN))).not.toThrow();
      expect(formatDateOnly(new Date(NaN))).toBeNull();
    });
  });
});
