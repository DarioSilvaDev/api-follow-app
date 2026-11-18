/**
 * Patrones de URL que transportan secretos one-shot (tokens) cuyo valor NUNCA
 * debe aparecer en los logs (SC-2). El reemplazo loguea la ruta base con un
 * placeholder y conserva la información útil para debugging del resto.
 *
 * - Path tokens: `/api/dealerships/wizard/invitations/{token}`,
 *   `/api/workshops/wizard/invitations/{token}`,
 *   `/api/users/wizard/invitations/{token}` y el token del QR de transferencia
 *   `GET/POST /api/vehicles/transfer/qr/{token}` (+ `/accept`).
 * - Query tokens: `?token=...` (verify-email, reset-password, etc.).
 */
const SENSITIVE_URL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(\/dealerships\/wizard\/invitations\/)[^/?#]+/, '$1{token}'],
  [/(\/workshops\/wizard\/invitations\/)[^/?#]+/, '$1{token}'],
  [/(\/users\/wizard\/invitations\/)[^/?#]+/, '$1{token}'],
  // SC-2 (A1): el token one-shot del QR de transferencia es un path param. Se
  // redacta solo el segmento del token y se conserva el resto de la ruta
  // (p. ej. el sufijo `/accept`), para no perder contexto de debugging.
  [/(\/vehicles\/transfer\/qr\/)[^/?#]+/, '$1{token}'],
  // C-2: el token del reclamo público viaja como path param en las cuatro
  // rutas (`/vehicle-claims/public/{token}[/challenge|/verify|/commit]`). Se
  // redacta sólo el segmento del token y se conserva el sufijo de la acción.
  [/(\/vehicle-claims\/public\/)[^/?#]+/, '$1{token}'],
  [/([?&]token=)[^&#]*/g, '$1[REDACTED]'],
];

/**
 * Redacta secretos (tokens) del request.url antes de loguearlo. Para rutas
 * con placeholder (`{token}`) y para query `?token=` (`[REDACTED]`).
 */
export function sanitizeUrl(url: string): string {
  let sanitized = url;
  for (const [pattern, replacement] of SENSITIVE_URL_REPLACEMENTS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}
