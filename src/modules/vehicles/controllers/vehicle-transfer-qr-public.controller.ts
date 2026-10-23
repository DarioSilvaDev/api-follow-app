import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PreviewTransferQrCommand } from '../commands/preview-transfer-qr/preview-transfer-qr.command';
import { PreviewTransferQrHandler } from '../commands/preview-transfer-qr/preview-transfer-qr.handler';

/**
 * Gap 1 — D-09: preview del QR de transferencia presencial (Fase 3,
 * D-079..D-083), movido a un controller **público** para que un receptor
 * anónimo pueda consultarlo antes de autenticarse.
 *
 * Se sigue el precedente de `wizard.controller.ts`: controller separado, SIN
 * `JwtAuthGuard` a nivel de clase. La ruta y el límite son idénticos a los
 * vigentes (`GET /api/vehicles/transfer/qr/:token`, 10 req / 60 s por IP);
 * solo cambia dónde se declara. No se inyecta `@CurrentUser()`.
 *
 * El side effect de expiración (H-23) se mantiene y se acepta como riesgo
 * asumido (D-09 / §11): es terminal y ocurre a lo sumo una vez por QR.
 */
@Controller('vehicles/transfer/qr')
export class VehicleTransferQrPublicController {
  constructor(
    private readonly previewTransferQrHandler: PreviewTransferQrHandler,
  ) {}

  @Get(':token')
  // Wave P3: brute-force protection on the 32-hex QR token.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async preview(@Param('token') token: string) {
    return this.previewTransferQrHandler.execute(
      new PreviewTransferQrCommand(token),
    );
  }
}
