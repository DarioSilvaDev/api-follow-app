import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleTransferQrExpiredEvent } from '../events/vehicle-transfer-qr-expired.event';

@Injectable()
export class TransferQrExpiredEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle.transfer.qr_expired')
  async handle(event: VehicleTransferQrExpiredEvent) {
    const [vehicle, createdBy] = await Promise.all([
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
      this.prisma.user.findUnique({ where: { id: event.createdByUserId } }),
    ]);

    if (!vehicle || !createdBy) return;

    const vehicleName = vehicle.version
      ? `${vehicle.version.model.brand.name} ${vehicle.version.model.name} ${vehicle.version.name}`
      : vehicle.licensePlate;

    await this.mailService.sendTransferQrExpiredEmail(
      createdBy.email,
      createdBy.firstName,
      vehicleName,
      vehicle.licensePlate,
    );
  }
}