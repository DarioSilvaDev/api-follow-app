import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { SearchWorkshopsHandler } from '../queries/search-workshops/search-workshops.handler';

/**
 * WorkshopSearchController — GET /api/workshops/search?q=
 *
 * Controlador SEPARADO y registrado ANTES de WorkshopsController: evita que
 * `@Get(':id')` capture `search` como id (patrón F-012). Guard básico de
 * autenticación (cualquier cuenta válida) + throttle.
 */
@Controller('workshops')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class WorkshopSearchController {
  constructor(
    private readonly searchWorkshopsHandler: SearchWorkshopsHandler,
  ) {}

  @Get('search')
  async search(@Query('q') q?: string) {
    return this.searchWorkshopsHandler.execute(q ?? '');
  }
}
