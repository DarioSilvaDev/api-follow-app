import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { VehicleTransferRequestedEvent } from '../events/vehicle-transfer-requested.event';

@Injectable()
export class TransferRequestEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('vehicle.transfer.requested')
  async handle(event: VehicleTransferRequestedEvent) {
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

    await this.mailService.sendTransferRequestEmail(
      toUser.email,
      toUser.firstName,
      fromUser.firstName,
      vehicleName,
      vehicle.licensePlate,
    );
  }
}
