import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class ModuleLogger extends PinoLogger {
  constructor(context: string) {
    super({});
    this.setContext(context);
  }
}
