import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/database/prisma.module';
import { SuperadminBootstrapService } from './common/init/superadmin-bootstrap.service';
import { MailModule } from './common/mail/mail.module';
import { AuthorizationModule } from './common/authorization.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { WorkshopsModule } from './modules/workshops/workshops.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { envs } from './config/envs';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    WorkshopsModule,
    MaintenanceModule,
    AdministrationModule,
    ThrottlerModule.forRoot([
      {
        ttl: envs.THROTTLE_TTL * 1000,
        limit: envs.THROTTLE_LIMIT,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SuperadminBootstrapService,
    {
      provide: 'APP_GUARD',
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
