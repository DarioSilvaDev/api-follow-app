import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CreateCareEpisodeDto } from '../dto/create-care-episode.dto';
import { CreateCareEpisodeCommand } from '../commands/create-care-episode/create-care-episode.command';
import { CreateCareEpisodeHandler } from '../commands/create-care-episode/create-care-episode.handler';
import { LookupVehicleHandler } from '../queries/lookup-vehicle/lookup-vehicle.handler';

/**
 * CareEpisodesController — Check-in de vehículos en taller (F-020).
 *
 * Guard chain:
 *   POST  — JwtAuthGuard + ContextGuard (clase), WorkshopOnlyGuard + PermissionsGuard (método)
 *           WorkshopOnly va ANTES de Permissions (evita bypass de super_admin — D-024 A2).
 *   GET lookup — JwtAuthGuard + ContextGuard (clase), WorkshopOnlyGuard + ThrottlerGuard (método)
 *
 * Decisión TL: el lookup vive en este módulo (NO en vehicles) para evitar el
 * foot-gun de @Get(':id') de vehicles.controller (F-012).
 */
@Controller('care-episodes')
@UseGuards(JwtAuthGuard, ContextGuard)
export class CareEpisodesController {
  constructor(
    private readonly createCareEpisodeHandler: CreateCareEpisodeHandler,
    private readonly lookupVehicleHandler: LookupVehicleHandler,
  ) {}

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes — Crear CareEpisode (check-in)
  // ──────────────────────────────────────────────────────────

  @Post()
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.create')
  async create(
    @Body() dto: CreateCareEpisodeDto,
    @ActiveContext() ctx: CurrentContext,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException('This operation requires a WORKSHOP context');
    }

    const careEpisode = await this.createCareEpisodeHandler.execute(
      new CreateCareEpisodeCommand(dto, ctx.workshopId, ctx.memberId),
    );

    return careEpisode;
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/lookup?plate= — Buscar vehículo por placa
  // ──────────────────────────────────────────────────────────

  @Get('lookup')
  @UseGuards(WorkshopOnlyGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async lookup(@Query('plate') plate: string) {
    return this.lookupVehicleHandler.execute(plate);
  }
}
