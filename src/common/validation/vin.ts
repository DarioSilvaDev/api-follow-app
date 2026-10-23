/**
 * VIN validation utilities - D-145 (Formato vigente).
 *
 * Reglas: únicamente formato. SIN dígito verificador, SIN allowlist WMI.
 * VIN = 17 caracteres, alfanuméricos con exclusión de I, O, Q.
 */

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Normaliza VIN: trim + uppercase.
 */
export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase();
}

/**
 * Valida formato de VIN: 17 chars [A-HJ-NPR-Z0-9]. SIN dígito verificador.
 */
export function isValidVin(vin: string): boolean {
  if (!vin || typeof vin !== 'string') return false;
  const normalized = normalizeVin(vin);
  return VIN_REGEX.test(normalized);
}
