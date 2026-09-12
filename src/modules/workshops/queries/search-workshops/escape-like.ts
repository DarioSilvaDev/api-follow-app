/**
 * escapeLike — Escapa caracteres comodín de LIKE para búsqueda tipo "contains".
 *
 * Antes: `LIKE '%' + q + '%'` con un `%` en la query del usuario permitía
 * inyección de patrón (p.ej. q="%" matchea todo). Ahora los comodines de la
 * entrada se tratan literalmente (escape con backslash + ESCAPE '\' de
 * PostgreSQL / Prisma `contains`).
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
