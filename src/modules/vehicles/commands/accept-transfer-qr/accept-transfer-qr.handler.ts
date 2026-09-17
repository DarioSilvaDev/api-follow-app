import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferQrExpiredEvent } from '../../events/vehicle-transfer-qr-expired.event';
import { VehicleTransferAcceptedEvent } from '../../events/vehicle-transfer-accepted.event';
import { AcceptTransferQrCommand } from './accept-transfer-qr.command';

@Injectable()
export class AcceptTransferQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: AcceptTransferQrCommand) {
    const qr = await this.prisma.vehicleTransferQr.findUnique({
      where: { token: command.token },
    });

    if (!qr) {
      throw new NotFoundException('QR inválido o expirado');
    }

    const now = new Date();

    // Lazy-expire: if pending but expiresAt is in the past, mark expired.
    if (qr.status === 'pending' && qr.expiresAt < now) {
      await this.prisma.vehicleTransferQr.update({
        where: { id: qr.id },
        data: { status: 'expired' },
      });

      this.eventEmitter.emit(
        'vehicle.transfer.qr_expired',
        new VehicleTransferQrExpiredEvent(
          qr.id,
          qr.vehicleId,
          qr.createdByUserId,
        ),
      );

      throw new NotFoundException('QR inválido o expirado');
    }

    if (qr.status === 'expired') {
      throw new NotFoundException('QR inválido o expirado');
    }

    if (qr.status === 'revoked') {
      throw new GoneException('Este QR ha sido revocado');
    }

    if (qr.status === 'consumed') {
      throw new ConflictException('Este QR ya fue utilizado');
    }

    if (qr.createdByUserId === command.userId) {
      throw new BadRequestException('No podés aceptar tu propio QR');
    }

    if (!command.dto.confirmation) {
      throw new BadRequestException('Debes confirmar la transferencia');
    }

    // AC7.5 §2: no existing alive pending email transfer for this vehicle.
    const existingPendingEmailTransfer =
      await this.prisma.vehicleTransfer.findFirst({
        where: {
          vehicleId: qr.vehicleId,
          status: 'pending',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });

    if (existingPendingEmailTransfer) {
      throw new ConflictException(
        'Ya existe una solicitud de transferencia pendiente para este vehículo',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // H1 (race fix): el gate `status='pending'` vive DENTRO de la transacción.
      // Dos accepts concurrentes con el mismo token se serializan en este
      // updateMany: solo el primero matchea status='pending' → count=1. El
      // perdedor ve count=0 → 409 y hace rollback (sin duplicar transfer/ownership).
      const { count } = await tx.vehicleTransferQr.updateMany({
        where: { id: qr.id, status: 'pending' },
        data: {
          status: 'consumed',
          consumedAt: now,
          consumedByUserId: command.userId,
        },
      });

      if (count !== 1) {
        throw new ConflictException('Este QR ya fue utilizado');
      }

      const currentOwnership = await tx.vehicleOwnership.findFirst({
        where: { vehicleId: qr.vehicleId, endsAt: null },
      });

      if (currentOwnership) {
        await tx.vehicleOwnership.update({
          where: { id: currentOwnership.id },
          data: { endsAt: now },
        });
      }

      const transfer = await tx.vehicleTransfer.create({
        data: {
          vehicleId: qr.vehicleId,
          fromUserId: qr.createdByUserId,
          toUserId: command.userId,
          status: 'completed',
          requestedAt: now,
          respondedAt: now,
          completedAt: now,
          expiresAt: null,
          notes: null,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'requested',
          performedByUserId: qr.createdByUserId,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'ownership_closed',
          performedByUserId: command.userId,
        },
      });

      await tx.vehicleOwnership.create({
        data: {
          vehicleId: qr.vehicleId,
          userId: command.userId,
          type: 'owner',
          startsAt: now,
          acquiredByTransferId: transfer.id,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'ownership_created',
          performedByUserId: command.userId,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'completed',
          performedByUserId: command.userId,
        },
      });

      return transfer;
    });

    this.eventEmitter.emit(
      'vehicle.transfer.accepted',
      new VehicleTransferAcceptedEvent(
        result.id,
        qr.vehicleId,
        qr.createdByUserId,
        command.userId,
      ),
    );

    return {
      transferId: result.id,
      status: 'completed',
    };
  }
}
