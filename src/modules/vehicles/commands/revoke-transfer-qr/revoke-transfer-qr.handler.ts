import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { RevokeTransferQrCommand } from './revoke-transfer-qr.command';
import { DealershipContext } from '../../../../common/context/interfaces/current-context.interface';

/**
 * RevokeTransferQrHandler — revocación idempotente del QR pendiente.
 *
 * Fase 2b (B2): rama DEALERSHIP. La concesionaria TITULAR puede revocar QRs
 * de consignación pendientes (venta/devolución) exigiendo el permiso
 * `dealership.vehicle.sell` o `dealership.vehicle.return` (RB-10: owner y
 * seller disponen de ambos). La rama persona queda intacta (owner activo).
 */
@Injectable()
export class RevokeTransferQrHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RevokeTransferQrCommand) {
    if (command.ctx?.type === 'DEALERSHIP') {
      return this.executeAsDealership(command);
    }

    // Rama persona (flujo clásico, D-079)
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

    return this.revokePending(command.vehicleId);
  }

  private async executeAsDealership(command: RevokeTransferQrCommand) {
    const ctx = command.ctx as DealershipContext;

    await this.assertDealershipCanRevoke(ctx, command.vehicleId);

    return this.revokePending(command.vehicleId);
  }

  /**
   * Rama DEALERSHIP (B2/A2): miembro activo (defensa en profundidad — ya
   * garantizado por ContextResolver), permiso vehicle.sell O vehicle.return, y
   * la concesionaria titular actual (VehicleOwnership activo, type company).
   */
  private async assertDealershipCanRevoke(
    ctx: DealershipContext,
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
        dealership: { select: { isActive: true } },
      },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this dealership',
      );
    }

    // P2: la concesionaria desactivada no puede revocar QRs (rama inline de
    // DELETE :id/qr, sin DealershipGuard).
    if (!member.dealership.isActive) {
      throw new ForbiddenException('This dealership is inactive');
    }

    const codes = member.role.permissions.map((rp) => rp.permission.code);
    if (
      !codes.includes('dealership.vehicle.sell') &&
      !codes.includes('dealership.vehicle.return')
    ) {
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

  private async revokePending(vehicleId: string) {
    const pendingQr = await this.prisma.vehicleTransferQr.findFirst({
      where: {
        vehicleId,
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
