import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AuthenticatedUser } from '../../../../common/types/auth.types';

@Injectable()
export class GetVehicleHistoryHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Security Review #13 (P1): the `email` of owners is PII and must only be
   * exposed to the active owner of the vehicle or to a platform super_admin.
   * A holder with only shared VehicleAccess sees the history WITHOUT emails
   * (all other fields remain identical).
   */
  async execute(vehicleId: string, user?: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    // Unless the caller is the active owner or a super_admin, emails stay hidden.
    const exposeEmails = await this.shouldExposeEmails(vehicleId, user);

    const ownershipUserSelect = exposeEmails
      ? { id: true, firstName: true, lastName: true, email: true }
      : { id: true, firstName: true, lastName: true };

    const [transfers, mileages, ownerships] = await Promise.all([
      this.prisma.vehicleTransfer.findMany({
        where: { vehicleId },
        include: {
          fromUser: { select: { id: true, firstName: true, lastName: true } },
          toUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleMileage.findMany({
        where: { vehicleId },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.vehicleOwnership.findMany({
        where: { vehicleId },
        include: {
          user: { select: ownershipUserSelect },
        },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    return { transfers, mileages, ownerships };
  }

  /**
   * Determines whether the caller may see owner emails: active ownership
   * (D-002 — VehicleOwnership source of truth) or platform super_admin.
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
