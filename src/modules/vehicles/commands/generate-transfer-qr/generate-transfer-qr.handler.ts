import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { VehicleTransferQrExpiredEvent } from '../../events/vehicle-transfer-qr-expired.event';
import { GenerateTransferQrCommand } from './generate-transfer-qr.command';
import { QR_TTL_SECONDS } from '../../constants/transfer-qr.constants';

const QR_TOKEN_BYTES = 16;

@Injectable()
export class GenerateTransferQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: GenerateTransferQrCommand) {
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

    // Lazy-expire any stale pending QRs (D-079): status='pending' but expiresAt
    // is in the past. They occupy the partial-unique index, so remove them first.
    const now = new Date();
    const stalePending = await this.prisma.vehicleTransferQr.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
        expiresAt: { lt: now },
      },
    });

    if (stalePending) {
      await this.prisma.vehicleTransferQr.update({
        where: { id: stalePending.id },
        data: { status: 'expired' },
      });

      this.eventEmitter.emit(
        'vehicle.transfer.qr_expired',
        new VehicleTransferQrExpiredEvent(
          stalePending.id,
          stalePending.vehicleId,
          stalePending.createdByUserId,
        ),
      );
    }

    // AC7.5 §1: no existing alive pending email transfer for this vehicle.
    const existingPendingEmailTransfer = await this.prisma.vehicleTransfer.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (existingPendingEmailTransfer) {
      throw new ConflictException(
        'Ya existe una solicitud de transferencia pendiente para este vehículo',
      );
    }

    // D-079: unique index en status='pending' garantiza max 1 pending.
    // Si tras lazy-expire sigue habiendo uno, es un QR activo → 409.
    const activePending = await this.prisma.vehicleTransferQr.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
      },
    });

    if (activePending) {
      throw new ConflictException(
        'Ya existe un QR de transferencia pendiente para este vehículo',
      );
    }

    const token = randomBytes(QR_TOKEN_BYTES).toString('hex');
    const ttlSeconds = QR_TTL_SECONDS[command.dto.source];
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const qr = await this.prisma.vehicleTransferQr.create({
      data: {
        vehicleId: command.vehicleId,
        createdByUserId: command.userId,
        token,
        status: 'pending',
        source: command.dto.source,
        expiresAt,
      },
    });

    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';

    return {
      id: qr.id,
      token: qr.token,
      url: `${frontendUrl}/transfer/qr/${qr.token}`,
      source: qr.source,
      expiresAt: qr.expiresAt.toISOString(),
      secondsRemaining: ttlSeconds,
    };
  }
}
