import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleConsignmentTakenEvent } from '../../events/vehicle-consignment-taken.event';
import { AcceptConsignmentTakeQrCommand } from './accept-consignment-take.command';

/**
 * AcceptConsignmentTakeQrHandler — QR de TOMA consumido por una concesionaria
 * (D-101/D-104, D-TL-14).
 *
 * En la misma transacción: gate one-shot `status='pending'` (patrón H1),
 * cierre del ownership del vendedor persona, creación del ownership de la
 * concesionaria (titular intermedio, type company), VehicleTransfer completed,
 * y VehicleAccess de SOLO LECTURA para el vendedor (D-107/RB-09, M3 — sin
 * resucitar accesos revocados).
 *
 * Evento dedicado `vehicle.consignment.taken` (solo IDs); NO se reemite el
 * clásico `vehicle.transfer.accepted` con el miembro como origen (D-TL-17/M4).
 */
@Injectable()
export class AcceptConsignmentTakeQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: AcceptConsignmentTakeQrCommand) {
    const { qr, userId, ctx } = command;
    const now = new Date();

    // P2: la concesionaria desactivada no puede consumir QRs de toma —
    // verificación antes de la transacción (fail-closed si no existe).
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: ctx.dealershipId },
      select: { isActive: true },
    });
    if (!dealership || !dealership.isActive) {
      throw new ForbiddenException('This dealership is inactive');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // H1: gate one-shot dentro de la transacción (solo el primero matchea).
      const { count } = await tx.vehicleTransferQr.updateMany({
        where: { id: qr.id, status: 'pending' },
        data: {
          status: 'consumed',
          consumedAt: now,
          // XOR de consumo: dealership + miembro actuante (D-DB-1).
          consumedByDealershipId: ctx.dealershipId,
          consumedByMemberId: ctx.memberId,
        },
      });

      if (count !== 1) {
        throw new ConflictException('Este QR ya fue utilizado');
      }

      const currentOwnership = await tx.vehicleOwnership.findFirst({
        where: { vehicleId: qr.vehicleId, endsAt: null },
      });

      // D-TL-16 / RB-03: la dealership ya es titular → auto-transfer → 409.
      if (currentOwnership?.dealershipId === ctx.dealershipId) {
        throw new ConflictException(
          'La concesionaria ya es titular de este vehículo',
        );
      }

      // El titular actual debe ser el vendedor que generó el QR de toma.
      if (!currentOwnership || currentOwnership.userId !== qr.createdByUserId) {
        throw new ConflictException(
          'El vendedor ya no es titular de este vehículo',
        );
      }

      await tx.vehicleOwnership.update({
        where: { id: currentOwnership.id },
        data: { endsAt: now },
      });

      const transfer = await tx.vehicleTransfer.create({
        data: {
          vehicleId: qr.vehicleId,
          fromUserId: qr.createdByUserId,
          toDealershipId: ctx.dealershipId,
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
          performedByUserId: userId,
        },
      });

      await tx.vehicleOwnership.create({
        data: {
          vehicleId: qr.vehicleId,
          dealershipId: ctx.dealershipId,
          type: 'company',
          startsAt: now,
          acquiredByTransferId: transfer.id,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'ownership_created',
          performedByUserId: userId,
        },
      });

      await tx.vehicleTransferEvent.create({
        data: {
          transferId: transfer.id,
          type: 'completed',
          performedByUserId: userId,
        },
      });

      // M3/D-107: VehicleAccess de solo lectura para el vendedor (banner +
      // historial durante la exhibición). NO reutilizar el upsert de
      // grant-access (que resucitaría accesos revocados): create directo; si
      // existe un acceso vigente se conserva; si existe uno revocado, P2002 →
      // se deja revocado (M3 — sin resucitar).
      const existingAccess = await tx.vehicleAccess.findFirst({
        where: {
          vehicleId: qr.vehicleId,
          userId: qr.createdByUserId,
          revokedAt: null,
        },
        select: { id: true },
      });

      if (!existingAccess) {
        try {
          await tx.vehicleAccess.create({
            data: {
              vehicleId: qr.vehicleId,
              userId: qr.createdByUserId,
              grantedByUserId: userId,
            },
          });
        } catch (error) {
          if (!(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )) {
            throw error;
          }
          // Fila stale (revocada) existente → M3: NO resucitar.
        }
      }

      return transfer;
    });

    // D-TL-17 / M4: evento dedicado, solo IDs, sin PII de empleados.
    this.eventEmitter.emit(
      'vehicle.consignment.taken',
      new VehicleConsignmentTakenEvent(
        result.id,
        qr.vehicleId,
        ctx.dealershipId,
        qr.createdByUserId,
        qr.id,
      ),
    );

    return {
      transferId: result.id,
      status: 'completed',
    };
  }
}
