import {
  ClaimChallengeService,
  CLAIM_RANGE_WIDTH_KM,
} from './claim-challenge.service';

describe('ClaimChallengeService — precedencia y multiple choice (F-3)', () => {
  const service = new ClaimChallengeService();
  const inviteId = '11111111-1111-1111-1111-111111111111';

  describe('resolveFactor', () => {
    it('VIN registrado gana sobre el odómetro (F-2)', () => {
      expect(service.resolveFactor('8AJHA9CD0P1234567', 45_000)).toBe('vin');
    });

    it('sin VIN usa el odómetro de la última atención', () => {
      expect(service.resolveFactor(null, 45_000)).toBe('mileage');
      expect(service.resolveFactor('   ', 45_000)).toBe('mileage');
    });

    it('sin VIN y sin odómetro cae a revisión manual', () => {
      expect(service.resolveFactor(null, null)).toBe('manual_review');
    });
  });

  describe('build', () => {
    it('devuelve entre 4 y 6 rangos más "No lo sé"', () => {
      for (let i = 0; i < 20; i++) {
        const challenge = service.build(`invite-${i}`, 45_000);
        const ranges = challenge.options.filter((o) => o.id !== 'unknown');
        expect(ranges.length).toBeGreaterThanOrEqual(4);
        expect(ranges.length).toBeLessThanOrEqual(6);
        expect(challenge.options.at(-1)).toEqual({
          id: 'unknown',
          label: 'No lo sé',
        });
      }
    });

    it('es determinista para el mismo invite (semilla = inviteId)', () => {
      const first = service.build(inviteId, 45_000);
      const second = service.build(inviteId, 45_000);
      expect(second).toEqual(first);
    });

    it('formatea los rangos en km rioplatense', () => {
      const challenge = service.build(inviteId, 45_000);
      for (const option of challenge.options) {
        if (option.id === 'unknown') continue;
        expect(option.label).toMatch(
          /^\d{1,3}(\.\d{3})*–\d{1,3}(\.\d{3})* km$/,
        );
      }
    });

    it('no genera rangos negativos cerca de 0 km', () => {
      const challenge = service.build(inviteId, 100);
      for (const option of challenge.options) {
        if (option.id === 'unknown') continue;
        expect(option.label.startsWith('-')).toBe(false);
      }
    });

    it('nunca revela el valor real ni marca el rango correcto', () => {
      const challenge = service.build(inviteId, 45_123);
      const serialized = JSON.stringify(challenge);
      expect(serialized).not.toContain('45123');
      expect(serialized).not.toContain('correct');
    });
  });

  describe('verifyRange', () => {
    it('acepta exactamente un rango y marca "unknown" como manual', () => {
      const mileageIn = 45_123;
      const challenge = service.build(inviteId, mileageIn);
      const results = challenge.options
        .filter((o) => o.id !== 'unknown')
        .map((o) => service.verifyRange(inviteId, mileageIn, o.id));

      expect(results.filter((r) => r === 'valid')).toHaveLength(1);
      expect(results.filter((r) => r === 'invalid')).toHaveLength(
        results.length - 1,
      );
      expect(service.verifyRange(inviteId, mileageIn, 'unknown')).toBe(
        'manual_review',
      );
    });

    it('el rango correcto es el que contiene el odómetro registrado', () => {
      const mileageIn = 45_123;
      const challenge = service.build(inviteId, mileageIn);
      const validId = challenge.options
        .filter((o) => o.id !== 'unknown')
        .find(
          (o) => service.verifyRange(inviteId, mileageIn, o.id) === 'valid',
        )?.id;

      expect(validId).toBeDefined();
      const label = challenge.options.find((o) => o.id === validId)?.label;
      expect(label).toBe('45.000–45.250 km');
      expect(Math.floor(mileageIn / CLAIM_RANGE_WIDTH_KM) * 250).toBe(45_000);
    });

    it('un id que no pertenece al challenge es inválido', () => {
      expect(service.verifyRange(inviteId, 45_123, 'r99')).toBe('invalid');
    });
  });
});
