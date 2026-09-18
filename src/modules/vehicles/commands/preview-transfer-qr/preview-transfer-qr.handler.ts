import {
  Injectable,
  NotFoundException,
  GoneException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferQrExpiredEvent } from '../../events/vehicle-transfer-qr-expired.event';
import { PreviewTransferQrCommand } from './preview-transfer-qr.command';

/**
 * PreviewTransferQrHandler — preview del QR de transferencia.
 *
 * Fase 2b (M1 / resolución PM §28 §3.3): el response extiende con `purpose` +
 * `fromDealership` (sin PII) y SUPRIME `fromUser` cuando `createdByDealershipId`
 * no es null (RB-08: nunca exponer PII de empleados de la concesionaria).
 * `purpose` respeta el contrato frontend `TransferQrPurpose`: `"transfer"`
 * como default cuando la columna es NULL (flujo clásico persona→persona).
 */
@Injectable()
export class PreviewTransferQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: PreviewTransferQrCommand) {
    const qr = await this.prisma.vehicleTransferQr.findUnique({
      where: { token: command.token },
      include: {
        vehicle: {
          include: {
            version: {
              include: { model: { include: { brand: true } } },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, alias: true },
        },
        createdByDealership: {
          select: { id: true, name: true, logoUrl: true },
        },
      },
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

    const vehicleName = qr.vehicle.version
      ? `${qr.vehicle.version.model.brand.name} ${qr.vehicle.version.model.name} ${qr.vehicle.version.name}`
      : qr.vehicle.licensePlate;

    // M1 (RB-08): cuando el origen es organizacional NO se expone fromUser
    // (PII de empleados); el emisor pasa a ser fromDealership (sin PII).
    const fromDealership = qr.createdByDealershipId
      ? qr.createdByDealership
      : null;

    return {
      vehicle: {
        id: qr.vehicle.id,
        name: vehicleName,
        licensePlate: qr.vehicle.licensePlate,
        // H2 (spec §6.2): campos aditivos requeridos por contrato. Siguen el
        // patrón de VehicleResponseDto: null cuando el dato no existe.
        manufactureYear: qr.vehicle.manufactureYear ?? null,
        modelYear: qr.vehicle.modelYear ?? null,
        color: qr.vehicle.color ?? null,
      },
      fromUser: fromDealership ? null : qr.createdBy,
      fromDealership: fromDealership
        ? {
            id: fromDealership.id,
            name: fromDealership.name,
            logoUrl: fromDealership.logoUrl,
          }
        : null,
      purpose: qr.purpose ?? 'transfer',
      source: qr.source,
      expiresAt: qr.expiresAt.toISOString(),
      secondsRemaining: Math.max(
        0,
        Math.floor((qr.expiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }
}
