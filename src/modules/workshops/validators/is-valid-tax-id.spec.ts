import { isValidArgentineTaxId, normalizeTaxId } from './is-valid-tax-id';

describe('isValidArgentineTaxId', () => {
  it('normalizes taxId by removing non-digits', () => {
    expect(normalizeTaxId('30-72010012-2')).toBe('30720100122');
    expect(normalizeTaxId('30 72010012 2')).toBe('30720100122');
  });

  it('validates known CUIT values', () => {
    expect(isValidArgentineTaxId('30-72010012-2')).toBe(true);
    expect(isValidArgentineTaxId('27334270136')).toBe(true);
  });

  it('rejects invalid length', () => {
    expect(isValidArgentineTaxId('3072010012')).toBe(false);
    expect(isValidArgentineTaxId('307201001221')).toBe(false);
  });

  it('rejects wrong verifier digit', () => {
    expect(isValidArgentineTaxId('30720100123')).toBe(false);
  });

  it('accepts empty/null when optional', () => {
    expect(isValidArgentineTaxId('')).toBe(false);
    expect(isValidArgentineTaxId(null)).toBe(false);
    expect(isValidArgentineTaxId(undefined)).toBe(false);
  });
});
