import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../common/database/prisma.service';

/**
 * MVP sin versiones de vehículo (decisión de producto): el alta/edición acepta
 * `brandId` + `modelId` del catálogo (ambos o ninguno) y persiste los nombres en
 * las columnas de texto libre `Vehicle.brandName`/`Vehicle.modelName` (D-160),
 * dejando `versionId = null`. Las columnas de catálogo/versiones se mantienen
 * para los vehículos legacy.
 */
export interface CatalogPairIds {
  brandId?: string | null;
  modelId?: string | null;
}

export interface ResolvedCatalogPair {
  brandName: string;
  modelName: string;
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Resuelve y valida el par marca/modelo del catálogo.
 *
 * Devuelve `null` cuando no viene ninguno (catálogo opcional, D-038). Si viene
 * uno solo → 400. Si vienen ambos: la marca y el modelo deben existir, estar
 * activos y el modelo debe pertenecer a la marca indicada; si no, 400 con
 * mensaje en español.
 */
export async function resolveCatalogBrandModel(
  prisma: PrismaService,
  ids: CatalogPairIds,
): Promise<ResolvedCatalogPair | null> {
  const brandId = hasValue(ids.brandId) ? ids.brandId : null;
  const modelId = hasValue(ids.modelId) ? ids.modelId : null;

  if (!brandId && !modelId) return null;

  if (!brandId || !modelId) {
    throw new BadRequestException('brandId y modelId deben enviarse juntos');
  }

  const [brand, model] = await Promise.all([
    prisma.vehicleBrand.findUnique({
      where: { id: brandId },
      select: { name: true, isActive: true },
    }),
    prisma.vehicleModel.findUnique({
      where: { id: modelId },
      select: { name: true, brandId: true, isActive: true },
    }),
  ]);
  if (!brand || !brand.isActive) {
    throw new BadRequestException(
      'La marca seleccionada no existe o está inactiva',
    );
  }

  if (!model || !model.isActive) {
    throw new BadRequestException(
      'El modelo seleccionado no existe o está inactivo',
    );
  }

  if (model.brandId !== brandId) {
    throw new BadRequestException(
      'El modelo no pertenece a la marca seleccionada',
    );
  }

  return { brandName: brand.name, modelName: model.name };
}

/**
 * Quita `brandId`/`modelId` antes de llegar a Prisma: los IDs de catálogo se
 * resuelven en el handler y Vehicle solo persiste `brandName`/`modelName`
 * (más `versionId`, que queda null en los vehículos nuevos).
 */
export function stripCatalogPair<T extends object>(
  data: T,
): Omit<T, 'brandId' | 'modelId'> {
  const source = data as unknown as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key === 'brandId' || key === 'modelId') {
      continue;
    }
    copy[key] = source[key];
  }
  return copy as unknown as Omit<T, 'brandId' | 'modelId'>;
}
