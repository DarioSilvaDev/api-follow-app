import { isIP } from 'net';

/**
 * Normaliza la patente para comparar (D-037/D-042): `trim().toUpperCase()` de
 * ambos lados. El DTO ya transforma el body; el query del challenge no pasa por
 * DTO, así que se normaliza acá.
 */
export function normalizeLicensePlate(value: string): string {
  return value.trim().toUpperCase();
}

/** Normaliza el VIN (o sus últimos 4) antes de comparar. */
export function normalizeVin(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Trunca la IP antes de persistirla en `VehicleClaimAttempt` (S-2): /24 para
 * IPv4 y /48 para IPv6. Devuelve `null` si el valor no es una IP válida.
 */
export function truncateIp(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim();
  // Express puede entregar IPv4 mapeada a IPv6 (`::ffff:127.0.0.1`).
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) {
    value = value.slice(7);
  }

  const version = isIP(value);
  if (version === 4) {
    const [a, b, c] = value.split('.');
    return `${a}.${b}.${c}.0`;
  }

  if (version === 6) {
    const [head] = value.split('::');
    const groups = head.split(':').filter(Boolean);
    while (groups.length < 3) groups.push('0');
    return `${groups.slice(0, 3).join(':')}::`;
  }

  return null;
}
