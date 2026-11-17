import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ListWorkshopCatalogHandler } from '../queries/list-workshop-catalog/list-workshop-catalog.handler';

/**
 * WorkshopCatalogController — GET /api/workshops/catalog?q=&page=&limit=
 *
 * Controlador SEPARADO y registrado ANTES de WorkshopsController: evita
 * que `@Get(':id')` capture `catalog` como id (patrón F-012, igual que
 * WorkshopSearchController). Guard básico de autenticación (cualquier
 * cuenta válida) + throttle.
 *
 * Listado público acotado y PAGINADO de talleres activos para el selector
 * de "Taller responsable" (sugerencias + bottom sheet con carga
 * incremental). Mismo criterio de PII mínima que /workshops/search.
 * `q` opcional (min 2 chars si está presente); sin `q` → catálogo
 * completo ordenado alfabéticamente.
 */
@Controller('workshops')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class WorkshopCatalogController {
  constructor(
    private readonly listWorkshopCatalogHandler: ListWorkshopCatalogHandler,
  ) {}

  @Get('catalog')
  async catalog(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listWorkshopCatalogHandler.execute({
      q,
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
    });
  }
}
