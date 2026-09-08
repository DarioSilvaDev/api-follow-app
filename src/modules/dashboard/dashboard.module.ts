import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { SuperAdminStatsHandler } from './queries/super-admin-stats.handler';
import { WorkshopStatsHandler } from './queries/workshop-stats.handler';
import { MechanicStatsHandler } from './queries/mechanic-stats.handler';
import { OwnerStatsHandler } from './queries/owner-stats.handler';
import { AuthorizationModule } from '../../common/authorization.module';

@Module({
  imports: [AuthorizationModule],
  controllers: [DashboardController],
  providers: [
    SuperAdminStatsHandler,
    WorkshopStatsHandler,
    MechanicStatsHandler,
    OwnerStatsHandler,
  ],
})
export class DashboardModule {}
