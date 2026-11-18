import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { sanitizeUrl } from './common/utils/sanitize-url';

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
import { VehicleClaimsModule } from './modules/vehicle-claims/vehicle-claims.module';
import { envs } from './config/envs';

@Module({
  imports: [
    // Logging estructurado (JSON) sobre Pino para TODA la app: request
    // logging vía pino-http, correlación por `x-request-id` y redacción de
    // secretos. Debe ser el primer módulo importado. Los logs de Nest
    // (`new Logger(...)`) se enrutan acá gracias a `app.useLogger()` en main.ts.
    LoggerModule.forRoot({
      pinoHttp: {
        level: envs.LOG_LEVEL,
        // genReqId: se adopta el `x-request-id` entrante SOLO si está bien
        // formado (anti-log-injection desde clientes arbitrarios); cualquier
        // otro valor se descarta y se genera un UUID v4. El ID se publica
        // además como header de respuesta para correlación cliente↔servidor.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const header = req.headers['x-request-id'];
          const value = Array.isArray(header) ? header[0] : header;
          const id =
            typeof value === 'string' &&
            /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(value)
              ? value
              : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Defensa en profundidad (capa 1): nada de Authorization/cookies/
        // password en las líneas de log. Observe redacta además por su lado.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'res.headers["set-cookie"]',
            'password',
            '*.password',
            'accessToken',
            'refreshToken',
            '*.accessToken',
            '*.refreshToken',
            '*.passwordHash',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: {
          // Readiness/liveness: ruido sin payload. Requests a la DB y al
          // storage los puede reportar Observe en la Fase 2.
          ignore: (req: IncomingMessage) =>
            !!req.url && sanitizeUrl(req.url).startsWith('/api/health'),
        },
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: sanitizeUrl(req.url ?? ''),
          }),
          res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        },
      },
    }),
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
      // Gap 1 — D-10: bucket por identidad para el alta de vehículo/QR de venta
      // (10/hora). `getTracker` requiere que JwtAuthGuard (clase) corra antes
      // que ThrottlerGuard (método) para que `req.user` exista; si faltara,
      // cae a IP en silencio.
      {
        name: 'dealershipVehicleCreate',
        ttl: 3_600_000,
        limit: 10,
        getTracker: (req: Record<string, any>) => req.user?.id ?? req.ip,
      },
      // C-2 — D-TL-C1/S-3: cuota por token del reclamo público. El valor de
      // módulo (5/300s) es el más estricto; cada ruta lo sobreescribe con
      // @Throttle (el bootstrap usa 10/60s). `getTracker` corre en el guard,
      // antes de los pipes, y `req.params.token` ya está resuelto por el router.
      {
        name: 'vehicleClaimToken',
        ttl: 300_000,
        limit: 5,
        getTracker: (req: Record<string, any>) =>
          String(req.params?.token ?? req.ip),
      },
      // Validación pre-auth del token de reset password (GET
      // /api/auth/reset-password/validate). Bucket por IP (10/5min) contra
      // brute force de tokens; sin getTracker propio → default req.ip.
      {
        name: 'resetPasswordValidate',
        ttl: 300_000,
        limit: 10,
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
    VehicleClaimsModule,
  ],
  controllers: [AppController],
  providers: [AppService, SuperadminBootstrapService],
})
export class AppModule {}
