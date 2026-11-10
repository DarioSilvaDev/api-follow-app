import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CreateClaimInviteCommand } from '../commands/create-claim-invite/create-claim-invite.command';
import { CreateClaimInviteHandler } from '../commands/create-claim-invite/create-claim-invite.handler';
import { ReviewClaimCommand } from '../commands/review-claim/review-claim.command';
import { ReviewClaimHandler } from '../commands/review-claim/review-claim.handler';
import { RevokeClaimCommand } from '../commands/revoke-claim/revoke-claim.command';
import { RevokeClaimHandler } from '../commands/revoke-claim/revoke-claim.handler';
import { CreateClaimInviteDto } from '../dto/create-claim-invite.dto';
import { RevokeClaimDto } from '../dto/revoke-claim.dto';
import { GetClaimHandler } from '../queries/get-claim/get-claim.handler';
import { ListClaimsHandler } from '../queries/list-claims/list-claims.handler';

/**
 * VehicleClaimsController — API autenticada del taller (C-3).
 *
 * Guards: `JwtAuthGuard` + `ContextGuard` en la clase; `WorkshopOnlyGuard` +
 * `PermissionsGuard` por método, con `WorkshopOnly` SIEMPRE antes de
 * `Permissions` (anti-bypass de `super_admin`, D-024 A2). El `workshopId` sale
 * del contexto activo, nunca de la URL.
 */
@Controller('vehicle-claims')
@UseGuards(JwtAuthGuard, ContextGuard)
export class VehicleClaimsController {
  constructor(
    private readonly createHandler: CreateClaimInviteHandler,
    private readonly listHandler: ListClaimsHandler,
    private readonly getHandler: GetClaimHandler,
    private readonly reviewHandler: ReviewClaimHandler,
    private readonly revokeHandler: RevokeClaimHandler,
  ) {}

  /**
   * 201 si emitió un token nuevo; 200 si reutilizó un invite vigente o
   * reactivó uno vencido (D-TL-VC-9). `link`/`whatsappUrl` sólo viajan acá.
   */
  @Post()
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.create')
  async create(
    @Body() dto: CreateClaimInviteDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    const result = await this.createHandler.execute(
      new CreateClaimInviteCommand(dto, ctx, user),
    );
    res.status(result.reused ? HttpStatus.OK : HttpStatus.CREATED);
    return { data: result.data };
  }

  @Get()
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.list')
  async list(
    @ActiveContext() ctx: CurrentContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    return this.listHandler.execute({
      workshopId: ctx.workshopId,
      page: this.toInt(page),
      limit: this.toInt(limit),
      status,
    });
  }

  @Get(':id')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.list')
  async get(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    return this.getHandler.execute({
      id,
      workshopId: ctx.workshopId,
      userId: user.id,
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.review')
  async approve(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    return this.reviewHandler.execute(
      new ReviewClaimCommand(
        id,
        ctx.workshopId,
        ctx.memberId,
        user.id,
        'approve',
      ),
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.review')
  async reject(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    return this.reviewHandler.execute(
      new ReviewClaimCommand(
        id,
        ctx.workshopId,
        ctx.memberId,
        user.id,
        'reject',
      ),
    );
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('vehicle-claim.revoke')
  async revoke(
    @Param('id') id: string,
    @Body() dto: RevokeClaimDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }

    return this.revokeHandler.execute(
      new RevokeClaimCommand(id, ctx.workshopId, user.id, dto.reason ?? null),
    );
  }

  private toInt(value?: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
