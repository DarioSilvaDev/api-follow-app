import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/types/auth.types';
import { SuperAdminStatsHandler } from '../queries/super-admin-stats.handler';
import { WorkshopStatsHandler } from '../queries/workshop-stats.handler';
import { MechanicStatsHandler } from '../queries/mechanic-stats.handler';
import { OwnerStatsHandler } from '../queries/owner-stats.handler';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly superAdminStats: SuperAdminStatsHandler,
    private readonly workshopStats: WorkshopStatsHandler,
    private readonly mechanicStats: MechanicStatsHandler,
    private readonly ownerStats: OwnerStatsHandler,
  ) {}

  @Get('super-admin')
  async getSuperAdminDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.superAdminStats.execute();
  }

  @Get('workshop')
  async getWorkshopDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId: string,
  ) {
    return this.workshopStats.execute(workshopId, user.id);
  }

  @Get('mechanic')
  async getMechanicDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId: string,
  ) {
    return this.mechanicStats.execute(workshopId, user.id);
  }

  @Get('owner')
  async getOwnerDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.ownerStats.execute(user.id);
  }
}
