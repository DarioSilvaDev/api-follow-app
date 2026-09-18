import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class GetVehicleHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detalle de vehículo (F-010 / F-013).
   *
   * FIX-PII (§34, origen §33 §2): la visibilidad del `email` de los usuarios
   * en ownerships sigue la MISMA regla que
   * `GetVehicleHistoryHandler.shouldExposeEmails` (fuente canónica, Security
   * Review #13) — solo el owner activo (persona) y super_admin lo ven.
   *
   * - Rama DEALERSHIP (titular concesionaria): el miembro NO es el owner
   *   persona (`VehicleOwnership.userId`) → email oculto; ve nombre/alias
   *   (D-078) y el titular organizacional vía `ownership.dealership` (B1,
   *   sin PII de empleados).
   * - Shared-access: email oculto (mismo criterio que el history).
   */
  async execute(id: string, user?: AuthenticatedUser) {
    const exposeEmails = await this.shouldExposeEmails(id, user);

    // D-078: contrato de usuario `{ id, firstName, lastName, alias }`.
    // `alias` es público (no PII) y se incluye en ambas ramas de visibilidad.
    const ownershipUserSelect = exposeEmails
      ? { id: true, firstName: true, lastName: true, alias: true, email: true }
      : { id: true, firstName: true, lastName: true, alias: true };

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        version: {
          include: {
            model: {
              include: {
                brand: true,
              },
            },
          },
        },
        ownerships: {
          include: {
            user: { select: ownershipUserSelect },
            // B1 / D-107 (RB-08): titular organizacional (dealership) sin PII.
            dealership: { select: { id: true, name: true, logoUrl: true } },
          },
          orderBy: { startsAt: 'desc' },
        },
        photos: true,
        documents: true,
        mileages: { orderBy: { recordedAt: 'desc' }, take: 5 },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', id);
    }

    return vehicle;
  }

  /**
   * Misma regla que `GetVehicleHistoryHandler.shouldExposeEmails`: email
   * visible solo al owner activo (D-002 — VehicleOwnership source of truth)
   * o a un super_admin de plataforma.
   */
  private async shouldExposeEmails(
    vehicleId: string,
    user?: AuthenticatedUser,
  ): Promise<boolean> {
    if (!user) return false;

    const hasOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: { vehicleId, userId: user.id, endsAt: null },
      select: { id: true },
    });
    if (hasOwnership) return true;

    const superAdminRole = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
      select: { id: true },
    });
    if (!superAdminRole) return false;

    const assignment = await this.prisma.systemRoleAssignment.findFirst({
      where: { userId: user.id, roleId: superAdminRole.id },
      select: { id: true },
    });

    return !!assignment;
  }
}
