import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WorkshopCatalogController } from './catalog.controller';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

/**
 * WorkshopCatalogController — GET /api/workshops/catalog?q=&page=&limit=
 *
 * Registro ANTES de WorkshopsController en `workshops.module.ts` (verificado
 * manualmente): si el orden fuera inverso, `@Get(':id')` capturaría `catalog`
 * como id (patrón F-012). No se importa el módulo aquí porque arrastra el
 * grafo completo de handlers (uuid=ESM) que Jest no transforma en CommonJS.
 * Guard básico: JwtAuthGuard (cualquier cuenta) + ThrottlerGuard; SIN
 * PermissionsGuard (catálogo público acotado, espejo de RF-8 search).
 */
describe('WorkshopCatalogController — paginated catalog route', () => {
  const classGuards = Reflect.getMetadata(
    GUARDS_METADATA,
    WorkshopCatalogController,
  ) as Function[] | undefined;

  const proto = WorkshopCatalogController.prototype as unknown as Record<
    string,
    unknown
  >;
  const catalogMethod = proto['catalog'] as object;

  it('is mounted at /workshops (route: GET catalog)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkshopCatalogController)).toBe(
      'workshops',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, catalogMethod)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, catalogMethod)).toBe('catalog');
  });

  it('applies JwtAuthGuard + ThrottlerGuard at class level', () => {
    expect(classGuards).toContain(JwtAuthGuard);
    expect(classGuards).toContain(ThrottlerGuard);
  });

  it('does NOT apply PermissionsGuard (public bounded catalog, no workshop permission)', () => {
    expect(classGuards).not.toContain(PermissionsGuard);
  });
});
