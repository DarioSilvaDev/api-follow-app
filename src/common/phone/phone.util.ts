/**
 * Celular del propietario — D-173.
 *
 * Reglas del MVP:
 * - País fijo (`DEFAULT_PHONE_COUNTRY_CODE`, default `+54`).
 * - Dos inputs separados: área y número. **Sin longitud fija.**
 * - Se aceptan espacios, guiones y paréntesis; se normaliza a dígitos.
 * - El valor canónico es E.164 (`+54` + área + número).
 *
 * Helpers puros (sin Prisma ni Nest).
 */

export interface PhonePairInput {
  areaCode?: string | null;
  nationalNumber?: string | null;
}

export interface BuildE164Input extends PhonePairInput {
  countryCode: string;
}

const MIN_DIGITS_PER_PART = 2;

function digitsOnly(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function normalizeCountryCode(countryCode: string): string | null {
  const digits = digitsOnly(countryCode);
  if (digits.length < 1 || digits.length > 3) return null;
  return `+${digits}`;
}

/**
 * Par área/número válido: ambos con al menos 2 dígitos.
 * No impone longitud fija (D-173).
 */
export function isValidPair(input: PhonePairInput): boolean {
  const area = digitsOnly(input.areaCode);
  const national = digitsOnly(input.nationalNumber);
  return (
    area.length >= MIN_DIGITS_PER_PART &&
    national.length >= MIN_DIGITS_PER_PART
  );
}

/**
 * Devuelve el E.164 canónico o `null` si el par o el país no son válidos.
 */
export function buildE164(input: BuildE164Input): string | null {
  const country = normalizeCountryCode(input.countryCode);
  if (!country || !isValidPair(input)) return null;

  return `${country}${digitsOnly(input.areaCode)}${digitsOnly(
    input.nationalNumber,
  )}`;
}

/**
 * Enmascara un teléfono dejando sólo los últimos 4 dígitos (`…2268`).
 * Devuelve `null` si no hay dígitos. Nunca expone el número completo.
 */
export function maskPhone(e164: string | null | undefined): string | null {
  const digits = digitsOnly(e164);
  if (digits.length === 0) return null;
  return `…${digits.slice(-4)}`;
}
