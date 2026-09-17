import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { RevokeTransferQrCommand } from './revoke-transfer-qr.command';

@Injectable()
export class RevokeTransferQrHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeTransferQrCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
      include: {
        ownerships: { where: { endsAt: null }, take: 1 },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', command.vehicleId);
    }

    const ownership = vehicle.ownerships[0];
    if (!ownership || ownership.userId !== command.userId) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    const pendingQr = await this.prisma.vehicleTransferQr.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
      },
    });

    // D-079: revoke idempotente. Si no hay pending, no hay nada que revocar
    // (ya consumido, revocado o expirado via lazy).
    if (!pendingQr) {
      return { revoked: false };
    }

    const updated = await this.prisma.vehicleTransferQr.update({
      where: { id: pendingQr.id },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    return {
      revoked: true,
      id: updated.id,
    };
  }
}