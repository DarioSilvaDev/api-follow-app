import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CreateCareEpisodeDto } from '../dto/create-care-episode.dto';
import { CreateOwnerCareEpisodeDto } from '../dto/create-owner-care-episode.dto';
import { CreateCareEpisodeCommand } from '../commands/create-care-episode/create-care-episode.command';
import { CreateCareEpisodeHandler } from '../commands/create-care-episode/create-care-episode.handler';
import { CreateOwnerCareEpisodeCommand } from '../commands/create-owner-care-episode/create-owner-care-episode.command';
import { CreateOwnerCareEpisodeHandler } from '../commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeCommand } from '../commands/verify-care-episode/verify-care-episode.command';
import { VerifyCareEpisodeHandler } from '../commands/verify-care-episode/verify-care-episode.handler';
import { LookupVehicleHandler } from '../queries/lookup-vehicle/lookup-vehicle.handler';
import { ListVerificationsHandler } from '../queries/list-verifications/list-verifications.handler';

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
    private readonly createOwnerCareEpisodeHandler: CreateOwnerCareEpisodeHandler,
    private readonly lookupVehicleHandler: LookupVehicleHandler,
    private readonly listVerificationsHandler: ListVerificationsHandler,
    private readonly verifyCareEpisodeHandler: VerifyCareEpisodeHandler,
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
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
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

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/owner — Registrar servicio del propietario
  // ──────────────────────────────────────────────────────────

  @Post('owner')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createOwner(
    @Body() dto: CreateOwnerCareEpisodeDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createOwnerCareEpisodeHandler.execute(
      new CreateOwnerCareEpisodeCommand(dto, user),
      ctx,
    );
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/verifications — Cola de verificaciones del taller
  // ──────────────────────────────────────────────────────────

  @Get('verifications')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.verify')
  async listVerifications(
    @ActiveContext() ctx: CurrentContext,
    @Query('limit') limit?: string,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return this.listVerificationsHandler.execute(ctx.workshopId, parsedLimit);
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/:id/verify — Confirmar verificación
  // ──────────────────────────────────────────────────────────
  // Foot-gun (F-012): la ruta estática `GET verifications` se declara ANTES de
  // que F-021/F-022 agregue `GET :id` (Express matchea por orden de registro:
  // si `:id` llegara antes, capturaría `verifications` como id). Hoy el único
  // `:id` es POST :id/verify (2 segmentos → no colisiona).

  @Post(':id/verify')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.verify')
  async verify(@Param('id') id: string, @ActiveContext() ctx: CurrentContext) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    return this.verifyCareEpisodeHandler.execute(
      new VerifyCareEpisodeCommand(id, ctx.workshopId, ctx.memberId),
    );
  }
}
