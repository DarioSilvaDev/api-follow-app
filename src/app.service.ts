import { Injectable } from '@nestjs/common';
import { MailService } from './common/mail/mail.service';

@Injectable()
export class AppService {
  constructor(private readonly mailService: MailService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * T-4 (PM): poder detectar una caída del servicio de correo sin depender de
   * un usuario quejándose.
   *
   * Mínimo privilegio deliberado: expone SOLO si el servicio está
   * configurado. No devuelve host, puerto, proveedor, último error ni contadores,
   * porque este endpoint es público y un oráculo de infraestructura en manos
   de un atacante es un activo, no una ayuda.
   *
   * Límite honesto de esta señal: la ALCANZABILIDAD real del relay no se puede
   * determinar desde acá sin enviar un correo de prueba, y un endpoint público
   * que dispara correos es un vector de spam. La alcanzabilidad llega por los
   * logs estructurados (`Mail accepted` / `Mail failed after retries`), que en
   * Fase 2 se complementan con el estado de entrega consultable por el admin.
   */
  health(): {
    status: 'ok' | 'degraded';
    smtp: { configured: boolean };
  } {
    const configured = this.mailService.isConfigured();

    return {
      // "degraded" es un estado de DEGRADACIÓN, no de caída: el servicio
      // sigue sirviendo requests, solo la capacidad de enviar email no está.
      status: configured ? 'ok' : 'degraded',
      smtp: { configured },
    };
  }
}
