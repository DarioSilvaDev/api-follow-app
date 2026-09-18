import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleTransferAcceptedEvent } from '../events/vehicle-transfer-accepted.event';

@Injectable()
export class TransferAcceptedEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Notificación al ex-titular (persona) por email.
   *
   * Fase 1a consignación: en ventas a concesionaria (take) no hay ex-titular
   * persona necesariamente (o el extremo puede ser dealership) → solo se
   * notifica cuando existe fromUserId. La cadena take/sale/return NO depende
   * de este correo (es informativo); por eso el listener es null-safe.
   */
  @OnEvent('vehicle.transfer.accepted')
  async handle(event: VehicleTransferAcceptedEvent) {
    if (!event.fromUserId) return;

    const [vehicle, fromUser, toUser] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: event.vehicleId },
        include: {
          version: {
            include: {
              model: { include: { brand: true } },
            },
          },
        },
      }),
      this.prisma.user.findUnique({ where: { id: event.fromUserId } }),
      this.prisma.user.findUnique({ where: { id: event.toUserId } }),
    ]);

    if (!vehicle || !fromUser || !toUser) return;

    const vehicleName = vehicle.version
      ? `${vehicle.version.model.brand.name} ${vehicle.version.model.name} ${vehicle.version.name}`
      : vehicle.licensePlate;

    await this.mailService.sendTransferAcceptedEmail(
      fromUser.email,
      fromUser.firstName,
      toUser.firstName,
      vehicleName,
      vehicle.licensePlate,
    );
  }
}