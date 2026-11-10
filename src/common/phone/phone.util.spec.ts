import { buildE164, isValidPair, maskPhone } from './phone.util';

describe('phone util (D-173)', () => {
  describe('buildE164', () => {
    it('normaliza los dos ejemplos del piloto sin longitud fija', () => {
      expect(
        buildE164({
          areaCode: '336',
          nationalNumber: '4687486',
          countryCode: '+54',
        }),
      ).toBe('+543364687486');

      expect(
        buildE164({
          areaCode: '11',
          nationalNumber: '22681000',
          countryCode: '+54',
        }),
      ).toBe('+541122681000');
    });

    it('limpia separadores y paréntesis', () => {
      expect(
        buildE164({
          areaCode: '(336)',
          nationalNumber: '468-7486',
          countryCode: '+54',
        }),
      ).toBe('+543364687486');
    });

    it('acepta el país sin "+" y lo normaliza', () => {
      expect(
        buildE164({
          areaCode: '11',
          nationalNumber: '22681000',
          countryCode: '54',
        }),
      ).toBe('+541122681000');
    });

    it('rechaza partes con menos de 2 dígitos', () => {
      expect(
        buildE164({ areaCode: '3', nationalNumber: '4687486', countryCode: '+54' }),
      ).toBeNull();
      expect(
        buildE164({ areaCode: '336', nationalNumber: '4', countryCode: '+54' }),
      ).toBeNull();
    });

    it('rechaza vacíos, nulos y país inválido', () => {
      expect(
        buildE164({ areaCode: '', nationalNumber: '', countryCode: '+54' }),
      ).toBeNull();
      expect(
        buildE164({ areaCode: null, nationalNumber: null, countryCode: '+54' }),
      ).toBeNull();
      expect(
        buildE164({ areaCode: '11', nationalNumber: '22681000', countryCode: '' }),
      ).toBeNull();
      expect(
        buildE164({
          areaCode: '11',
          nationalNumber: '22681000',
          countryCode: '+1234',
        }),
      ).toBeNull();
    });
  });

  describe('isValidPair', () => {
    it('acepta pares con al menos 2 dígitos por parte', () => {
      expect(isValidPair({ areaCode: '336', nationalNumber: '4687486' })).toBe(
        true,
      );
      expect(isValidPair({ areaCode: '11', nationalNumber: '22' })).toBe(true);
    });

    it('rechaza pares incompletos', () => {
      expect(isValidPair({ areaCode: '3', nationalNumber: '4687486' })).toBe(
        false,
      );
      expect(isValidPair({ areaCode: '336', nationalNumber: '4' })).toBe(false);
      expect(isValidPair({ areaCode: '', nationalNumber: '4687486' })).toBe(
        false,
      );
      expect(isValidPair({})).toBe(false);
    });
  });

  describe('maskPhone', () => {
    it('deja sólo los últimos 4 dígitos', () => {
      expect(maskPhone('+543364687486')).toBe('…7486');
      expect(maskPhone('+541122681000')).toBe('…1000');
    });

    it('devuelve null si no hay dígitos', () => {
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone(undefined)).toBeNull();
      expect(maskPhone('')).toBeNull();
      expect(maskPhone('+')).toBeNull();
    });

    it('no expone el número completo', () => {
      const masked = maskPhone('+543364687486');
      expect(masked).not.toContain('4687486');
    });
  });
});
