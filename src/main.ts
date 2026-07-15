import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      colors: true,
      json: true,
      logLevels: ['error', 'log'],
    }),
  });

  app.setGlobalPrefix('api');
  await app.listen(envs.PORT);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
