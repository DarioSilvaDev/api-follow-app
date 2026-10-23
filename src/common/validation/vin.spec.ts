/**
 * Vectores de prueba para validador VIN (formato - D-145).
 * SIN dígito verificador. SOLO longitud 17 y caracteres [A-HJ-NPR-Z0-9] sin I,O,Q.
 */
import { isValidVin, normalizeVin } from './vin';

describe('vin validation (format only)', () => {
  const VALID_VINS = [
    '1HGCM82633A123456',
    '1FTFW1ET7BFB12345',
    '5YJ3E1EA7HF123456',
    'JM1NC2MF8F0134567',
    'WVWZZZ1HZKW123456',
    '2HGES267X5H123456',
    '1GNEK13ZX3R123456',
  ];

  const INVALID_VINS = [
    '1HGCM82633A12345', // 16 chars
    '1HGCM82633A1234567', // 18 chars
    '1HGCM8263I123456', // contains I
    '1HGCM8263O123456', // contains O
    '1HGCM8263Q123456', // contains Q
    '1HGCM8263 123456', // space
    '1HGCM8263-123456', // dash
    '1HGCM8263*123456', // symbol
    'VIN1234567890ABCD', // contains I (invalid)
    '',
  ];

  it('normalizeVin trims and uppercases', () => {
    expect(normalizeVin('  1HGCM82633A123456  ')).toBe('1HGCM82633A123456');
  });

  it('accepts valid format VINs', () => {
    for (const v of VALID_VINS) {
      expect(isValidVin(v)).toBe(true);
    }
  });

  it('rejects invalid format VINs', () => {
    for (const v of INVALID_VINS) {
      expect(isValidVin(v)).toBe(false);
    }
  });
});
