import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VehicleTransferQr } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { VehicleTransferQrExpiredEvent } from '../../events/vehicle-transfer-qr-expired.event';
import { GenerateConsignmentQrCommand } from './generate-consignment-qr.command';
import { DealershipContext } from '../../../../common/context/interfaces/current-context.interface';
import { consignmentQrTtlSeconds } from '../../constants/transfer-qr.constants';

const QR_TOKEN_BYTES = 16;

/**
 * Generación de QRs de consignación (Fase 2b — D-TL-8..D-TL-18, RB-11):
 *
 * - `take`   → rama PERSONAL: el vendedor (owner activo) genera QR de TOMA.
 *              TTL por schedule immediate|pickup. `createdByDealershipId` null.
 * - `sale`   → rama DEALERSHIP: la concesionaria TITULAR genera QR de VENTA.
 *              Permiso `dealership.vehicle.sell` (RB-10). TTL 60 min.
 * - `return` → rama DEALERSHIP: la concesionaria TITULAR genera QR inverso de
 *              DEVOLUCIÓN (D-105). Permiso `dealership.vehicle.return`. TTL 60 min.
 *
 * Ramas de contexto mixto (B2): el mismo endpoint sirve persona y dealership;
 * por eso la autorización DEALERSHIP se evalúa dentro del handler (membresía +
 * permiso + titularidad) y no con @Permissions a nivel de ruta.
 *
 * Invariante D-079 (máx. 1 QR pending por vehículo) se replica del handler
 * clásico: lazy-expire + 409 + red de seguridad P2002.
 */
@Injectable()
export class GenerateConsignmentQrHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: GenerateConsignmentQrCommand) {
    const base = await this.assertActorCanGenerate(command);

    const now = new Date();

    // Lazy-expire (D-079): expirar pendientes vencidos que ocupan el índice
    // único parcial antes de intentar crear uno nuevo.
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
    const existingPendingEmailTransfer =
      await this.prisma.vehicleTransfer.findFirst({
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

    const activePending = await this.prisma.vehicleTransferQr.findFirst({
      where: {
        vehicleId: command.vehicleId,
        status: 'pending',
      },
    });

    if (activePending) {
      throw new ConflictException(
        'Ya existe un QR pendiente para este vehículo',
      );
    }

    const token = randomBytes(QR_TOKEN_BYTES).toString('hex');
    const ttlSeconds = consignmentQrTtlSeconds(
      command.purpose,
      command.schedule,
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    let qr: VehicleTransferQr;
    try {
      qr = await this.prisma.vehicleTransferQr.create({
        data: {
          vehicleId: command.vehicleId,
          createdByUserId: command.userId,
          createdByDealershipId:
            command.purpose === 'take' ? null : base.dealershipId,
          token,
          status: 'pending',
          // Los QRs de consignación se escanean presencialmente (D-082/D-104/D-105).
          source: 'presencial',
          purpose: command.purpose,
          expiresAt,
        },
      });
    } catch (error) {
      // D-079: red de seguridad del índice único parcial ante carreras → 409.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un QR pendiente para este vehículo',
        );
      }
      throw error;
    }

    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';

    return {
      id: qr.id,
      token: qr.token,
      url: `${frontendUrl}/transfer/qr/${qr.token}`,
      source: qr.source,
      purpose: qr.purpose ?? undefined,
      expiresAt: qr.expiresAt.toISOString(),
      secondsRemaining: ttlSeconds,
    };
  }

  /**
   * Autorización por rama (B2):
   * - take: contexto PERSONAL + el usuario es owner activo.
   * - sale/return: contexto DEALERSHIP + miembro activo + permiso del rol +
   *   la concesionaria es la titular actual (type company).
   *
   * Retorna `{ dealershipId }` cuando la rama es dealership (origen
   * organizacional del QR).
   */
  private async assertActorCanGenerate(
    command: GenerateConsignmentQrCommand,
  ): Promise<{ dealershipId: string | null }> {
    if (command.purpose === 'take') {
      if (command.ctx && command.ctx.type !== 'PERSONAL') {
        throw new ForbiddenException(
          'El QR de toma debe generarse desde la cuenta personal del vendedor',
        );
      }
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: command.vehicleId },
        include: { ownerships: { where: { endsAt: null }, take: 1 } },
      });
      if (!vehicle) {
        throw new NotFoundException('Vehicle', command.vehicleId);
      }
      const ownership = vehicle.ownerships[0];
      if (!ownership || ownership.userId !== command.userId) {
        throw new ForbiddenException('You do not own this vehicle');
      }
      return { dealershipId: null };
    }

    // sale / return — rama DEALERSHIP (B2)
    const ctx = command.ctx;
    if (!ctx || ctx.type !== 'DEALERSHIP') {
      throw new ForbiddenException(
        'Esta operación requiere un contexto DEALERSHIP',
      );
    }

    const requiredPermission =
      command.purpose === 'sale'
        ? 'dealership.vehicle.sell'
        : 'dealership.vehicle.return';

    await this.assertDealershipMemberPermission(
      ctx,
      requiredPermission,
      command.vehicleId,
    );

    return { dealershipId: ctx.dealershipId };
  }

  /**
   * Rama DEALERSHIP (A2/D-TL-13): membresía activa (defensa en profundidad; el
   * ContextResolver ya la garantiza), permiso del rol y titularidad actual de
   * la dealership (VehicleOwnership activo, type company).
   */
  private async assertDealershipMemberPermission(
    ctx: DealershipContext,
    permissionCode: string,
    vehicleId: string,
  ): Promise<void> {
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: {
          dealershipId: ctx.dealershipId,
          userId: ctx.userId,
        },
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this dealership',
      );
    }

    const hasPermission = member.role.permissions.some(
      (rp) => rp.permission.code === permissionCode,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Missing required permissions');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { ownerships: { where: { endsAt: null }, take: 1 } },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    const ownership = vehicle.ownerships[0];
    if (
      !ownership ||
      ownership.dealershipId !== ctx.dealershipId ||
      ownership.type !== 'company'
    ) {
      throw new ForbiddenException(
        'La concesionaria no es la titular actual de este vehículo',
      );
    }
  }
}
