import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { VehicleTransferQrExpiredEvent } from '../events/vehicle-transfer-qr-expired.event';

/**
 * D-088 / D-094: el QR vencido se notifica SOLO al emisor, porque es el único
 * actor que puede actuar (regenerar el QR). Copy en voseo, sin datos del
 * receptor (D-082: el QR nunca nombra al destinatario).
 *
 * D-119: un fallo no altera el status del endpoint que disparó la expiración
 * (el panel in-app ya muestra "Expirada" + acción Reintentar).
 */
@Injectable()
export class TransferQrExpiredEmailListener {
  private readonly logger = new Logger(TransferQrExpiredEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle.transfer.qr_expired')
  async handle(
    event: VehicleTransferQrExpiredEvent,
  ): Promise<MailSendResult | undefined> {
    try {
      const [vehicle, createdBy] = await Promise.all([
        this.prisma.vehicle.findUnique({
          where: { id: event.vehicleId },
          include: {
            version: {
              include: { model: { include: { brand: true } } },
            },
          },
        }),
        this.prisma.user.findUnique({ where: { id: event.createdByUserId } }),
      ]);

      if (!vehicle || !createdBy) {
        this.logger.warn(
          `Transfer QR expired email skipped, user or vehicle missing (qrId=${event.qrId}, vehicleId=${event.vehicleId})`,
        );
        return undefined;
      }

      const vehicleName = vehicle.version
        ? `${vehicle.version.model.brand.name} ${vehicle.version.model.name} ${vehicle.version.name}`
        : vehicle.licensePlate;

      return await this.mailService.sendTransferQrExpiredEmail(
        createdBy.email,
        createdBy.firstName,
        vehicleName,
        vehicle.licensePlate,
        { vehicleId: event.vehicleId, userId: event.createdByUserId },
      );
    } catch (error) {
      this.logger.error(
        `Transfer QR expired email failed unexpectedly (qrId=${event.qrId}, vehicleId=${event.vehicleId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
