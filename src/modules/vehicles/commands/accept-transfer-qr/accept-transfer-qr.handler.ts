import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferQrExpiredEvent } from '../../events/vehicle-transfer-qr-expired.event';
import { VehicleTransferAcceptedEvent } from '../../events/vehicle-transfer-accepted.event';
import { VehicleConsignmentSoldEvent } from '../../events/vehicle-consignment-sold.event';
import { VehicleConsignmentReturnedEvent } from '../../events/vehicle-consignment-returned.event';
import { AcceptTransferQrCommand } from './accept-transfer-qr.command';
import { AcceptConsignmentTakeQrCommand } from '../accept-consignment-take/accept-consignment-take.command';
import { AcceptConsignmentTakeQrHandler } from '../accept-consignment-take/accept-consignment-take.handler';

/**
 * AcceptTransferQrHandler — aceptación de QRs de transferencia.
 *
 * Fase 2b (cadena de consignación, DECISION-REGISTER §30 §3) — enruta por
 * `purpose` + contexto activo:
 *
 * - purpose `take`:
 *   - contexto DEALERSHIP (miembro en representación) → delega a
 *     `AcceptConsignmentTakeQr` (D-TL-14).
 *   - contexto PERSONA → 409 (A1: blindaje del flujo clásico — un QR de toma
 *     NO puede aceptarse como transferencia persona→persona).
 * - purpose `sale` (comprador persona): origen dinámico dealership titular;
 *   409 si el aceptante es miembro activo de la concesionaria titular (D-TL-16).
 * - purpose `return` (vendedor original): solo el vendedor original acepta
 *   (D-TL-16); 403 en caso contrario.
 * - purpose NULL: flujo clásico persona→persona sin cambios.
 *
 * M3: en la misma transacción de `sold`/`returned` se revoca el VehicleAccess
 * de solo lectura del vendedor (D-107/RB-09).
 *
 * M4/D-TL-17: tramos de consignación emiten eventos dedicados
 * `vehicle.consignment.sold/returned` (solo IDs); NO se reemite el clásico
 * `vehicle.transfer.accepted` con la dealership como origen.
 */
@Injectable()
export class AcceptTransferQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly acceptConsignmentTakeQr: AcceptConsignmentTakeQrHandler,
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

    // ------------------------------------------------------------------
    // A1: routing por purpose. Los QRs de consignación se habilitan SOLO
    // con el accept clásico ya ramificado.
    // ------------------------------------------------------------------
    if (qr.purpose === 'take') {
      if (!command.ctx || command.ctx.type !== 'DEALERSHIP') {
        throw new ConflictException(
          'Este QR de toma solo puede aceptarse en contexto de concesionaria',
        );
      }

      if (!command.dto.confirmation) {
        throw new BadRequestException('Debes confirmar la transferencia');
      }

      return this.acceptConsignmentTakeQr.execute(
        new AcceptConsignmentTakeQrCommand(qr, command.userId, command.ctx),
      );
    }

    // ------------------------------------------------------------------
    // Rama persona (sale | return | clásico sin purpose).
    // ------------------------------------------------------------------
    if (command.ctx?.type === 'DEALERSHIP') {
      throw new ForbiddenException(
        'La venta y la devolución se aceptan desde una cuenta personal',
      );
    }

    if (qr.createdByUserId === command.userId) {
      throw new BadRequestException('No podés aceptar tu propio QR');
    }

    if (!command.dto.confirmation) {
      throw new BadRequestException('Debes confirmar la transferencia');
    }

    // D-TL-16: venta — el aceptante NO puede ser miembro activo de la
    // concesionaria titular (evita que la dealership se venda a sí misma
    // mediante un empleado).
    if (qr.purpose === 'sale' && qr.createdByDealershipId) {
      const member = await this.prisma.dealershipMember.findUnique({
        where: {
          dealershipId_userId: {
            dealershipId: qr.createdByDealershipId,
            userId: command.userId,
          },
        },
        select: { status: true },
      });

      if (member?.status === 'active') {
        throw new ConflictException(
          'Un miembro activo de la concesionaria no puede aceptar el QR de venta',
        );
      }
    }

    // D-TL-16: devolución — solo el vendedor original (D-105/RB-07).
    if (qr.purpose === 'return') {
      const originalSellerId = await this.resolveOriginalSeller(
        qr.vehicleId,
        qr.createdByDealershipId,
      );

      if (!originalSellerId || originalSellerId !== command.userId) {
        throw new ForbiddenException(
          'Solo el vendedor original puede aceptar la devolución',
        );
      }
    }

    // Integridad: venta/devolución exigen que la dealership que emitió el QR
    // siga siendo la titular actual (de lo contrario el QR es huérfano → 409).
    if (qr.purpose === 'sale' || qr.purpose === 'return') {
      const currentOwnership = await this.prisma.vehicleOwnership.findFirst({
        where: { vehicleId: qr.vehicleId, endsAt: null },
      });

      if (
        !currentOwnership ||
        currentOwnership.dealershipId !== qr.createdByDealershipId
      ) {
        throw new ConflictException(
          'La concesionaria ya no es titular de este vehículo',
        );
      }
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
      // H1 (race fix): gate `status='pending'` DENTRO de la transacción.
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

      // Origen dinámico persona|dealership (D-TL-14): los tramos de
      // consignación tienen origen organizacional.
      const isConsignmentLeg = qr.purpose === 'sale' || qr.purpose === 'return';

      const transfer = await tx.vehicleTransfer.create({
        data: {
          vehicleId: qr.vehicleId,
          fromUserId: isConsignmentLeg ? null : qr.createdByUserId,
          toUserId: command.userId,
          fromDealershipId: isConsignmentLeg ? qr.createdByDealershipId : null,
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

      // M3: revocar el VehicleAccess de solo lectura del vendedor en la misma
      // transacción del sold (y del returned).
      if (qr.purpose === 'return') {
        // El aceptante ES el vendedor original; recupera titularidad.
        await tx.vehicleAccess.updateMany({
          where: {
            vehicleId: qr.vehicleId,
            userId: command.userId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      } else if (qr.purpose === 'sale' && qr.createdByDealershipId) {
        const takeTransfer = await tx.vehicleTransfer.findFirst({
          where: {
            vehicleId: qr.vehicleId,
            toDealershipId: qr.createdByDealershipId,
            status: 'completed',
            fromUserId: { not: null },
          },
          orderBy: { completedAt: 'desc' },
          select: { fromUserId: true },
        });

        if (takeTransfer?.fromUserId) {
          await tx.vehicleAccess.updateMany({
            where: {
              vehicleId: qr.vehicleId,
              userId: takeTransfer.fromUserId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
        }
      }

      return transfer;
    });

    // M4/D-TL-17: eventos dedicados para tramos de consignación (solo IDs).
    if (qr.purpose === 'sale' && qr.createdByDealershipId) {
      this.eventEmitter.emit(
        'vehicle.consignment.sold',
        new VehicleConsignmentSoldEvent(
          result.id,
          qr.vehicleId,
          qr.createdByDealershipId,
          command.userId,
        ),
      );
    } else if (qr.purpose === 'return' && qr.createdByDealershipId) {
      this.eventEmitter.emit(
        'vehicle.consignment.returned',
        new VehicleConsignmentReturnedEvent(
          result.id,
          qr.vehicleId,
          qr.createdByDealershipId,
          command.userId,
        ),
      );
    } else {
      this.eventEmitter.emit(
        'vehicle.transfer.accepted',
        new VehicleTransferAcceptedEvent(
          result.id,
          qr.vehicleId,
          qr.createdByUserId,
          command.userId,
        ),
      );
    }

    return {
      transferId: result.id,
      status: 'completed',
    };
  }

  /**
   * Devuelve el vendedor original de la cadena: la persona que transfirió el
   * vehículo a la concesionaria (fromUserId del take transfer más reciente).
   */
  private async resolveOriginalSeller(
    vehicleId: string,
    dealershipId: string | null,
  ): Promise<string | null> {
    if (!dealershipId) return null;

    const takeTransfer = await this.prisma.vehicleTransfer.findFirst({
      where: {
        vehicleId,
        toDealershipId: dealershipId,
        status: 'completed',
        fromUserId: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      select: { fromUserId: true },
    });

    return takeTransfer?.fromUserId ?? null;
  }
}
