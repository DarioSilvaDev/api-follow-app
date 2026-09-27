import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * T-4: detección de degradación del servicio de correo. Público y de solo
   * lectura; no expone credenciales, host ni detalles de error. Ver la
   * advertencia sobre alcance en AppService.health().
   */
  @Get('health')
  health() {
    return this.appService.health();
  }
}
