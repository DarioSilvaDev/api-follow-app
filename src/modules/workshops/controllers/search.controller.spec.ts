import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WorkshopSearchController } from './search.controller';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

/**
 * WorkshopSearchController — GET /api/workshops/search?q=
 *
 * Registro ANTES de WorkshopsController en `workshops.module.ts` (verificado
 * manualmente): si el orden fuera inverso, `@Get(':id')` capturaría `search`
 * como id (patrón F-012). No se importa el módulo aquí porque arrastra el
 * grafo completo de handlers (uuid=ESM) que Jest no transforma en CommonJS.
 * Guard básico: JwtAuthGuard (cualquier cuenta) + ThrottlerGuard; SIN
 * PermissionsGuard (la búsqueda es pública acotada, RF-8).
 */
describe('WorkshopSearchController — RF-8 search route', () => {
  const classGuards = Reflect.getMetadata(
    GUARDS_METADATA,
    WorkshopSearchController,
  ) as Function[] | undefined;

  const proto = WorkshopSearchController.prototype as Record<string, unknown>;
  const searchMethod = proto['search'] as object;

  it('is mounted at /workshops (route: GET search)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkshopSearchController)).toBe(
      'workshops',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, searchMethod)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, searchMethod)).toBe('search');
  });

  it('applies JwtAuthGuard + ThrottlerGuard at class level', () => {
    expect(classGuards).toContain(JwtAuthGuard);
    expect(classGuards).toContain(ThrottlerGuard);
  });

  it('does NOT apply PermissionsGuard (public bounded search, no workshop permission)', () => {
    expect(classGuards).not.toContain(PermissionsGuard);
  });
});
