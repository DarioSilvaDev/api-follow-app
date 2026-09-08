import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';
import { CurrentContext } from '../context/interfaces/current-context.interface';
import { CodedHttpException } from '../exceptions/coded.exception';
import { ERROR_CODES } from '../exceptions/error-codes';

/**
 * VehicleAccessService — Centralized vehicle access validation.
 *
 * Two modes:
 *
 * 1. `assertVehicleAccess` (full mode, for WORKSHOP-aware routes):
 *    Short-circuits through: vehicle exists → ownership → VehicleAccess →
 *    workshop membership + vehicle-workshop association → super_admin.
 *
 * 2. `assertOwnershipOrSharedAccess` (strict mode, for /vehicles/* routes):
 *    Short-circuits through: vehicle exists → ownership → VehicleAccess → super_admin.
 *    No workshop membership check.
 *
 * Both modes throw ForbiddenException (PERMISSION_DENIED) when no path matches.
 *
 * @see D-024 — VehicleAccessService
 */
@Injectable()
export class VehicleAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full access check (D-024 A1):
   * 1. Vehicle exists (returns early if not — handler throws 404)
   * 2. Active ownership (endsAt: null)
   * 3. VehicleAccess vigente (revokedAt: null, expiresAt: null or future)
   * 4. If context.type === 'WORKSHOP': active membership + vehicle has ≥1 maintenance record for that workshop
   * 5. super_admin system role
   * If none → ForbiddenException
   */
  async assertVehicleAccess(params: {
    vehicleId: string;
    user: AuthenticatedUser;
    context: CurrentContext;
  }): Promise<void> {
    const { vehicleId, user, context } = params;

    // 1. Vehicle exists?
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) return; // Let the handler throw NotFoundException

    // 2. Active ownership
    const hasOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: { vehicleId, userId: user.id, endsAt: null },
      select: { id: true },
    });
    if (hasOwnership) return;

    // 3. VehicleAccess vigente
    const hasAccess = await this.prisma.vehicleAccess.findFirst({
      where: {
        vehicleId,
        userId: user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (hasAccess) return;

    // 4. Workshop membership + vehicle-workshop association (only when context is WORKSHOP)
    if (context.type === 'WORKSHOP') {
      const hasWorkshopAccess = await this.assertWorkshopVehicleAccess(
        vehicleId,
        user.id,
        context.workshopId,
      );
      if (hasWorkshopAccess) return;
    }

    // 5. super_admin system role
    const hasSuperAdmin = await this.assertSuperAdmin(user.id);
    if (hasSuperAdmin) return;

    throw new ForbiddenException('You do not have access to this vehicle');
  }

  /**
   * Strict mode access check (D-024 A1 — /vehicles/* routes):
   * Steps 1→2→3→5 ONLY (no workshop membership).
   * Preserves current behavior until D-019.
   */
  async assertOwnershipOrSharedAccess(params: {
    vehicleId: string;
    user: AuthenticatedUser;
  }): Promise<void> {
    const { vehicleId, user } = params;

    // 1. Vehicle exists?
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) return; // Let the handler throw NotFoundException

    // 2. Active ownership
    const hasOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: { vehicleId, userId: user.id, endsAt: null },
      select: { id: true },
    });
    if (hasOwnership) return;

    // 3. VehicleAccess vigente
    const hasAccess = await this.prisma.vehicleAccess.findFirst({
      where: {
        vehicleId,
        userId: user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (hasAccess) return;

    // 5. super_admin system role
    const hasSuperAdmin = await this.assertSuperAdmin(user.id);
    if (hasSuperAdmin) return;

    throw new ForbiddenException('You do not have access to this vehicle');
  }

  /**
   * Ownership-only check (Security Review #8 — P1): used for privileged vehicle
   * operations (grant access, delete, transfer) that must NOT be performed by a
   * user holding only shared access.
   *
   * Accepts: active ownership (endsAt: null) OR platform super_admin.
   * Rejects (403 PERMISSION_DENIED): shared VehicleAccess holders and anyone else.
   * Returns early (no throw) when the vehicle does not exist so the caller can
   * throw a 404.
   */
  async assertOwnership(params: {
    vehicleId: string;
    user: AuthenticatedUser;
  }): Promise<void> {
    const { vehicleId, user } = params;

    // 1. Vehicle exists?
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) return; // Let the handler throw NotFoundException

    // 2. Active ownership (D-002 — VehicleOwnership is the source of truth)
    const hasOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: { vehicleId, userId: user.id, endsAt: null },
      select: { id: true },
    });
    if (hasOwnership) return;

    // 3. super_admin system role
    const hasSuperAdmin = await this.assertSuperAdmin(user.id);
    if (hasSuperAdmin) return;

    throw new ForbiddenException(
      'Only the vehicle owner can perform this operation',
    );
  }

  /**
   * Checks if the vehicle has at least one maintenance record for the given workshop.
   * This prevents "any member can read any vehicle" over-exposure.
   */
  private async assertWorkshopVehicleAccess(
    vehicleId: string,
    userId: string,
    workshopId: string,
  ): Promise<boolean> {
    // Check active membership first
    const member = await this.prisma.workshopMember.findUnique({
      where: { workshopId_userId: { workshopId, userId } },
      select: { id: true, status: true },
    });
    if (!member || member.status !== 'active') return false;

    // Check vehicle-workshop association via any maintenance record
    const association = await this.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM (
        SELECT workshop_id FROM appointments WHERE vehicle_id = $1 AND workshop_id = $2
        UNION
        SELECT workshop_id FROM work_orders WHERE vehicle_id = $1 AND workshop_id = $2
        UNION
        SELECT workshop_id FROM estimates WHERE vehicle_id = $1 AND workshop_id = $2
        UNION
        SELECT workshop_id FROM service_records WHERE vehicle_id = $1 AND workshop_id = $2
      ) AS associations LIMIT 1`,
      vehicleId,
      workshopId,
    );

    return association.length > 0;
  }

  /**
   * Checks if the user has a super_admin system role.
   */
  private async assertSuperAdmin(userId: string): Promise<boolean> {
    const superAdmin = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
      select: { id: true },
    });
    if (!superAdmin) return false;

    const hasRole = await this.prisma.systemRoleAssignment.findFirst({
      where: { userId, roleId: superAdmin.id },
      select: { id: true },
    });

    return !!hasRole;
  }
}
