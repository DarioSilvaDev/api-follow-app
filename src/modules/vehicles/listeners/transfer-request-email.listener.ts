import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import type { MailSendResult } from '../../../common/mail/mail.types';
import { VehicleTransferRequestedEvent } from '../events/vehicle-transfer-requested.event';

/**
 * D-087 / D-119: las notificaciones de transferencia usan email solamente y el
 * panel de transferencias es el respaldo in-app. Por eso un fallo de email NO
 * cambia el contrato HTTP del comando que originó la transferencia ni abre
 * un canal adicional (D-119: una notificación solo cuando falla sería peor
 * producto que el flujo normal).
 *
 * D-109: la transferencia ya está creada en BD cuando este listener corre.
 */
@Injectable()
export class TransferRequestEmailListener {
  private readonly logger = new Logger(TransferRequestEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle.transfer.requested')
  async handle(
    event: VehicleTransferRequestedEvent,
  ): Promise<MailSendResult | undefined> {
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

      // Actor borrado o vehículo eliminado entre el commit y el envío: no es un
      // error, simplemente no hay a quién notificar.
      if (!vehicle || !fromUser || !toUser) {
        this.logger.warn(
          `Transfer request email skipped, actor or vehicle missing (transferId=${event.transferId}, vehicleId=${event.vehicleId})`,
        );
        return undefined;
      }

      const vehicleName = vehicle.version
        ? `${vehicle.version.model.brand.name} ${vehicle.version.model.name} ${vehicle.version.name}`
        : vehicle.licensePlate;

      return await this.mailService.sendTransferRequestEmail(
        toUser.email,
        toUser.firstName,
        fromUser.firstName,
        vehicleName,
        vehicle.licensePlate,
        { vehicleId: event.vehicleId, userId: event.toUserId },
      );
    } catch (error) {
      this.logger.error(
        `Transfer request email failed unexpectedly (transferId=${event.transferId}, vehicleId=${event.vehicleId})`,
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
  }
}
