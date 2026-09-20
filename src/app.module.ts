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
import { DealershipsModule } from './modules/dealerships/dealerships.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { CareEpisodesModule } from './modules/care-episodes/care-episodes.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { VehicleCatalogModule } from './modules/vehicle-catalog/vehicle-catalog.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { envs } from './config/envs';

@Module({
  imports: [
    // Event bus in-process (decisión vigente: sin retry durable ni
    // infraestructura distribuida). SC-1: @nestjs/event-emitter 3.1.0 no
    // expone una opción `errorHandler` en forRoot(); su EventSubscribersLoader
    // envuelve todos los listeners con suppressErrors=true por defecto
    // (verificado en node_modules), por lo que un fallo en un listener NUNCA
    // deriva en unhandledRejection. Los listeners de mail de dealerships usan
    // además try/catch propio para loguear con correlación (dealershipId, sin
    // token) sin romper el flujo post-commit.
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
    DealershipsModule,
    MaintenanceModule,
    CareEpisodesModule,
    AdministrationModule,
    VehicleCatalogModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService, SuperadminBootstrapService],
})
export class AppModule {}
