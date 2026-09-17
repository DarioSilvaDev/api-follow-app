/**
 * Fase 3 / D-080 — Parseo del deep link del QR de transferencia.
 *
 * El backend arma `FRONTEND_URL/transfer/qr/{token}` (D-080). El escáner
 * (RF-9) y el ingreso manual necesitan extraer el token tanto de la URL
 * completa como de un token crudo pegado por el usuario.
 */

const QR_DEEP_LINK_PREFIX = "/transfer/qr/";

/** Extrae el token de una URL de deep link (o de un token crudo). */
export function extractQrToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /(?:https?:\/\/[^/]+)?\/transfer\/qr\/([A-Za-z0-9]+)$/i,
  );
  if (match) return match[1];
  // Fallback: token crudo (hex/base alfanumérico de longitud razonable).
  if (/^[A-Za-z0-9]{16,64}$/.test(trimmed)) return trimmed;
  return null;
}

/** Construye la ruta interna del deep link a partir del token. */
export function qrDeepLink(token: string): string {
  return `${QR_DEEP_LINK_PREFIX}${token}`;
}
