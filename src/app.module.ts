import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/database/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { SuperadminBootstrapService } from './common/init/superadmin-bootstrap.service';
import { MailModule } from './common/mail/mail.module';
import { AuthorizationModule } from './common/authorization.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { WorkshopsModule } from './modules/workshops/workshops.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { VehicleCatalogModule } from './modules/vehicle-catalog/vehicle-catalog.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { envs } from './config/envs';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    // Wave P2 — B4: rate limiting. ThrottlerModule is @Global(); ThrottlerGuard
    // is applied ONLY on sensitive endpoints (login, refresh, password reset,
    // impersonate) to protect against brute force / refresh bombing (D-001).
    // NOT global: a 10 req/60s global cap would break the SPA's parallel calls.
    ThrottlerModule.forRoot([
      {
        ttl: envs.THROTTLE_TTL * 1000,
        limit: envs.THROTTLE_LIMIT,
      },
    ]),
    PrismaModule,
    MailModule,
    StorageModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    WorkshopsModule,
    MaintenanceModule,
    AdministrationModule,
    VehicleCatalogModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SuperadminBootstrapService,
  ],
})
export class AppModule {}
