/**
 * Catálogo de tipos de documento vehicular.
 *
 * DECISIÓN (Tarea 1 — GET /vehicles/documents/types):
 * catálogo ESTÁTICO en código, NO un enum en Prisma.
 *
 * Razón: `VehicleDocument.documentType` es `String @db.VarChar(50)` (texto
 * libre) en schema.prisma y así permanece en el MVP. Migrar a enum de Prisma
 * exigiría:
 *   - una migración con mapeo de datos existentes (fixtures usan valores
 *     libres como 'insurance'; el frontend hoy envía texto libre);
 *   - romper el contrato vigente de POST /:id/documents hasta que el
 *     frontend se actualice.
 * El catálogo en código aporta el vocabulario para el dropdown del frontend
 * sin tocar persistencia ni migraciones. Es la fuente única que en el futuro
 * podrá usarse para validar escrituras si el PM lo decide.
 *
 * Extensibilidad: agregar un entry aquí equivale a habilitar ese tipo
 * (ej. futuros: seguro, verificación ambiental, etc.).
 */
export const VEHICLE_DOCUMENT_TYPE_CATALOG = [
  {
    value: 'VTV',
    label: 'VTV — Verificación Técnica Vehicular',
  },
] as const;

/**
 * Unión de valores permitidos del catálogo. Derivada del array para que
 * agregar un tipo lo propague al typecheck automáticamente.
 */
export type VehicleDocumentType =
  (typeof VEHICLE_DOCUMENT_TYPE_CATALOG)[number]['value'];
