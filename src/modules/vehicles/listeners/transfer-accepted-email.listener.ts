import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { VehicleTransferAcceptedEvent } from '../events/vehicle-transfer-accepted.event';

/**
 * Notificación al ex-titular (persona) por email.
 *
 * Fase 1a consignación: en ventas a concesionaria (take) no hay ex-titular
 * persona necesariamente (o el extremo puede ser dealership) → solo se
 * notifica cuando existe fromUserId. La cadena take/sale/return NO depende
 * de este correo (es informativo); por eso el listener es null-safe.
 *
 * D-119: el fallo no cambia el contrato HTTP del accept (D-081) ni abre un
 * canal in-app. D-109: la transferencia ya está aceptada en BD.
 */
@Injectable()
export class TransferAcceptedEmailListener {
  private readonly logger = new Logger(TransferAcceptedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle.transfer.accepted')
  async handle(
    event: VehicleTransferAcceptedEvent,
  ): Promise<MailSendResult | undefined> {
    if (!event.fromUserId) return undefined;

    try {
      const [vehicle, fromUser, toUser] = await Promise.all([
        this.prisma.vehicle.findUnique({
          where: { id: event.vehicleId },
          include: {
            version: {
              include: { model: { include: { brand: true } } },
            },
          },
        }),
        this.prisma.user.findUnique({ where: { id: event.fromUserId } }),
        this.prisma.user.findUnique({ where: { id: event.toUserId } }),
      ]);

      if (!vehicle || !fromUser || !toUser) {
        this.logger.warn(
          `Transfer accepted email skipped, actor or vehicle missing (transferId=${event.transferId}, vehicleId=${event.vehicleId})`,
        );
        return undefined;
      }

      const vehicleName = vehicle.version
        ? `${vehicle.version.model.brand.name} ${vehicle.version.model.name} ${vehicle.version.name}`
        : vehicle.licensePlate;

      return await this.mailService.sendTransferAcceptedEmail(
        fromUser.email,
        fromUser.firstName,
        toUser.firstName,
        vehicleName,
        vehicle.licensePlate,
        { vehicleId: event.vehicleId, userId: event.fromUserId },
      );
    } catch (error) {
      this.logger.error(
        `Transfer accepted email failed unexpectedly (transferId=${event.transferId}, vehicleId=${event.vehicleId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
