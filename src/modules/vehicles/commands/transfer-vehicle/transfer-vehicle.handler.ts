import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { TRANSFER_RECIPIENT_TYPE_ALIAS } from '../../dto/transfer-vehicle.dto';
import { VehicleTransferRequestedEvent } from '../../events/vehicle-transfer-requested.event';
import { TransferVehicleCommand } from './transfer-vehicle.command';

@Injectable()
export class TransferVehicleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: TransferVehicleCommand) {
    const { type, value } = command.dto.recipient;

    // Canal: email (comportamiento histórico conservado) o alias (contrato PM).
    // El alias se normaliza SIEMPRE (trim + lowercase); la unicidad
    // case-insensitive ya está garantizada por el índice funcional LOWER(alias),
    // por lo que el where usa el valor normalizado tal cual (sin LOWER extra).
    let toUserId: string;
    if (type === TRANSFER_RECIPIENT_TYPE_ALIAS) {
      const normalizedAlias = value.trim().toLowerCase();
      const aliasUser = await this.prisma.user.findUnique({
        where: { alias: normalizedAlias },
      });
      if (!aliasUser) {
        throw this.recipientNotFound();
      }
      toUserId = aliasUser.id;
    } else {
      const emailUser = await this.prisma.user.findUnique({
        where: { email: value },
      });
      if (!emailUser) {
        throw this.recipientNotFound();
      }
      toUserId = emailUser.id;
    }

    if (toUserId === command.fromUserId) {
      throw this.selfTransfer();
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
      include: {
        ownerships: { where: { endsAt: null }, take: 1 },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', command.vehicleId);
    }

    const currentOwnership = vehicle.ownerships[0];
    if (!currentOwnership || currentOwnership.userId !== command.fromUserId) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    // D-092: an expired pending transfer must NOT block creating a new one.
    // Only a pending that is still alive (expiresAt null or in the future)
    // counts as an active blocker.
    const existingPending = await this.prisma.vehicleTransfer.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existingPending) {
      throw this.pendingTransfer();
    }

    const transfer = await this.prisma.vehicleTransfer.create({
      data: {
        vehicleId: command.vehicleId,
        fromUserId: command.fromUserId,
        toUserId,
        status: 'pending',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes: command.dto.notes,
      },
    });

    await this.prisma.vehicleTransferEvent.create({
      data: {
        transferId: transfer.id,
        type: 'requested',
        performedByUserId: command.fromUserId,
        // Canal de resolución del destinatario (trazabilidad). Nunca el
        // valor (email/alias) — sin PII en el evento.
        metadata: { recipientLookup: type },
      },
    });

    this.eventEmitter.emit(
      'vehicle.transfer.requested',
      new VehicleTransferRequestedEvent(
        transfer.id,
        command.vehicleId,
        command.fromUserId,
        toUserId,
      ),
    );

    return transfer;
  }

  /**
   * Security Review #12 (P1): mensaje genérico para no revelar si el canal
   * (email o alias) existe (anti-enumeración). Paridad verificada por test:
   * alias inexistente responde idéntico a email inexistente.
   */
  private recipientNotFound(): CodedHttpException {
    return new CodedHttpException(
      HttpStatus.BAD_REQUEST,
      'Unable to transfer the vehicle to the specified recipient',
      ERROR_CODES.VALIDATION_ERROR,
      { code: 'TRANSFER_RECIPIENT_NOT_FOUND' },
    );
  }

  private selfTransfer(): CodedHttpException {
    return new CodedHttpException(
      HttpStatus.BAD_REQUEST,
      'Cannot transfer vehicle to yourself',
      ERROR_CODES.VALIDATION_ERROR,
      { code: 'TRANSFER_SELF' },
    );
  }

  private pendingTransfer(): CodedHttpException {
    return new CodedHttpException(
      HttpStatus.BAD_REQUEST,
      'There is already a pending transfer for this vehicle',
      ERROR_CODES.VALIDATION_ERROR,
      { code: 'TRANSFER_PENDING' },
    );
  }
}
