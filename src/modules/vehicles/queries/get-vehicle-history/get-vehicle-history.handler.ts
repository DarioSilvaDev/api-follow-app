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

    // D-078: user contracts expose `{ id, firstName, lastName, alias }`.
    // `alias` es público (no PII) y se incluye en ambas ramas de visibilidad.
    const ownershipUserSelect = exposeEmails
      ? { id: true, firstName: true, lastName: true, email: true, alias: true }
      : { id: true, firstName: true, lastName: true, alias: true };

    const [transfers, mileages, ownerships, careEpisodesRaw] =
      await Promise.all([
        this.prisma.vehicleTransfer.findMany({
          where: { vehicleId },
          include: {
            fromUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                alias: true,
              },
            },
            toUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                alias: true,
              },
            },
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
        // D-069/D-070: careEpisodes — owner + workshop, no status filter,
        // sorted in JS post-query (D-070 coalesce not expressible in Prisma orderBy).
        this.prisma.careEpisode.findMany({
          where: { vehicleId },
          select: {
            id: true,
            title: true,
            serviceDate: true,
            status: true,
            source: true,
            verification: true,
            mileageIn: true,
            customerNotes: true,
            checkedInAt: true,
            createdAt: true,
            workshopName: true,
            workshop: { select: { id: true, name: true } },
          },
        }),
      ]);

    const careEpisodes = this.sortCareEpisodes(careEpisodesRaw);

    return { transfers, mileages, ownerships, careEpisodes };
  }

  /**
   * D-070: Sort care episodes by canonical timestamp descending.
   * Canonical key: serviceDate ?? checkedInAt ?? createdAt.
   * Tiebreak: createdAt desc (deterministic ordering for stable tests).
   *
   * This MUST be done in JS — Prisma's composite orderBy does not
   * replicate the coalesce semantics when serviceDate is null and
   * checkedInAt is set (TL rejection of Prisma orderBy approach).
   */
  private sortCareEpisodes<
    T extends {
      serviceDate: Date | null;
      checkedInAt: Date | null;
      createdAt: Date;
    },
  >(episodes: T[]): T[] {
    return [...episodes].sort((a, b) => {
      const keyA = new Date(
        a.serviceDate ?? a.checkedInAt ?? a.createdAt,
      ).getTime();
      const keyB = new Date(
        b.serviceDate ?? b.checkedInAt ?? b.createdAt,
      ).getTime();
      if (keyB !== keyA) return keyB - keyA; // desc by canonical timestamp
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // tiebreak: createdAt desc
    });
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
