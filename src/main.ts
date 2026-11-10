import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      colors: true,
      json: true,
      logLevels: ['error', 'log'],
    }),
    cors: {
      origin:
        // envs.NODE_ENV === 'production'
        //   ? [
        //       'https://autentia-4kwwsaisu-dariosilvadev-3781s-projects.vercel.app',
        //     ]
        //   : ['http://localhost:3000', 'http://192.168.18.48:3000'],
        [
          // 'https://autentia-gil71d1c3-dariosilvadev-3781s-projects.vercel.app/',
          'https://autentia-1rzruwev9-dariosilvadev-3781s-projects.vercel.app/',
          'http://localhost:3000',
        ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
    },
  });

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
  await app.listen(envs.PORT);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
