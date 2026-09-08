import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/types/auth.types';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { SuperAdminStatsHandler } from '../queries/super-admin-stats.handler';
import { WorkshopStatsHandler } from '../queries/workshop-stats.handler';
import { MechanicStatsHandler } from '../queries/mechanic-stats.handler';
import { OwnerStatsHandler } from '../queries/owner-stats.handler';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ContextGuard)
export class DashboardController {
  constructor(
    private readonly superAdminStats: SuperAdminStatsHandler,
    private readonly workshopStats: WorkshopStatsHandler,
    private readonly mechanicStats: MechanicStatsHandler,
    private readonly ownerStats: OwnerStatsHandler,
  ) {}

  @Get('super-admin')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.dashboard')
  async getSuperAdminDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.superAdminStats.execute();
  }

  @Get('workshop')
  async getWorkshopDashboard(
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId: string,
  ) {
    const effectiveWorkshopId =
      ctx.type === 'WORKSHOP' ? ctx.workshopId : workshopId;
    return this.workshopStats.execute(effectiveWorkshopId, user.id);
  }

  @Get('mechanic')
  async getMechanicDashboard(
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId: string,
  ) {
    const effectiveWorkshopId =
      ctx.type === 'WORKSHOP' ? ctx.workshopId : workshopId;
    return this.mechanicStats.execute(effectiveWorkshopId, user.id);
  }

  @Get('owner')
  async getOwnerDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.ownerStats.execute(user.id);
  }
}
