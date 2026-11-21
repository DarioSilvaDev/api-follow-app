import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ObserveInstrument } from './observe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // bufferLogs: los logs de bootstrap (módulos cargados, mapeo de rutas…)
    // se bufferean y se vuelcan por pino apenas useLogger() está activo.
    bufferLogs: true,
    // Instrumentación del SDK de Observe: NOTE la creación de instancias para
    // abrir spans sobre providers, handlers y queries. Convive con pino.
    instrument: ObserveInstrument,
    cors: {
      origin:
        envs.NODE_ENV === 'production'
          ? [envs.CORS_ORIGIN]
          : ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
    },
  });

  // El logger global pasa a ser pino (JSON estructurado, correlación por
  // x-request-id). A partir de aquí, `new Logger(...)` de @nestjs/common
  // escribe por pino y pino-http loguea cada request automáticamente.
  app.useLogger(app.get(Logger));

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  // Necesario para que el SDK de Observe cierre el worker y haga flush del
  // buffer de telemetría antes de que el proceso muera.
  app.enableShutdownHooks();
  await app.listen(envs.PORT);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
