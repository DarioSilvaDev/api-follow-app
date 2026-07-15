import { Provider } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

export function createModuleLoggerToken(moduleName: string): string {
  return `${moduleName.toUpperCase()}_LOGGER`;
}

export function createModuleLoggerProvider(moduleName: string): Provider {
  return {
    provide: createModuleLoggerToken(moduleName),
    useFactory: () => {
      const logger = new PinoLogger({});
      logger.setContext(moduleName);
      return logger;
    },
  };
}
