/**
 * Nombre visible de un vehículo — B-1 del MVP "taller primero".
 *
 * Precedencia (D-TL-B4 / §3.1 a del plan 02):
 * 1. Versión de catálogo: `version.model.brand.name` + `version.model.name`.
 * 2. Texto libre cargado por el taller: `brandName` + `modelName`.
 * 3. Patente.
 *
 * Helper puro (sin Prisma ni Nest) para reusarlo en handlers, panel y mails.
 * Nunca devuelve los literales "null" ni "undefined".
 */

export interface VehicleDisplayNameInput {
  version?: {
    name?: string | null;
    model?: {
      name?: string | null;
      brand?: { name?: string | null } | null;
    } | null;
  } | null;
  brandName?: string | null;
  modelName?: string | null;
  licensePlate?: string | null;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function joinParts(parts: Array<string | null>): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length > 0 ? present.join(' ') : null;
}

/**
 * Devuelve el nombre visible con la precedencia catálogo → texto libre → patente.
 * Si no hay ningún dato, devuelve cadena vacía.
 */
export function resolveVehicleDisplayName(
  input: VehicleDisplayNameInput,
): string {
  const fromCatalog = joinParts([
    clean(input.version?.model?.brand?.name),
    clean(input.version?.model?.name),
  ]);
  if (fromCatalog) return fromCatalog;

  const fromFreeText = joinParts([
    clean(input.brandName),
    clean(input.modelName),
  ]);
  if (fromFreeText) return fromFreeText;

  return clean(input.licensePlate) ?? '';
}
