import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';
import {
  CurrentContext,
  DealershipContext,
} from '../context/interfaces/current-context.interface';
import { CodedHttpException } from '../exceptions/coded.exception';
import { ERROR_CODES } from '../exceptions/error-codes';

/**
 * Capacidades de escritura expuestas por `GET /vehicles/:id` (D-12).
 */
export interface VehicleCapabilities {
  canEdit: boolean;
  canRecordMileage: boolean;
  canCorrectVin: boolean;
}

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
   * Steps 1→2→3→(4 si el contexto es DEALERSHIP)→5 (no workshop membership).
   * Preserves current behavior until D-019.
   */
  async assertOwnershipOrSharedAccess(params: {
    vehicleId: string;
    user: AuthenticatedUser;
    context?: CurrentContext;
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

    // 4. DEALERSHIP context (FIX-B1 / RB-04): la concesionaria que es titular
    // actual del vehículo (ownership activo type 'company', D-TL-9) puede
    // leer el detalle/historial del vehículo en exhibición a través de
    // cualquier miembro activo con permiso de lectura (sell/return/history.view).
    // Esto desbloquea el panel: `GET /vehicles/:id` y `GET /vehicles/:id/history`.
    if (context?.type === 'DEALERSHIP') {
      const hasDealershipAccess = await this.assertDealershipVehicleRead(
        vehicleId,
        user.id,
        context,
      );
      if (hasDealershipAccess) return;
    }

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
   * Gap 1 — D-12: capacidades de escritura que `GET /vehicles/:id` expone al
   * frontend, calculadas con **la misma lógica de autorización** que aplican
   * las escrituras reales (evita que la UI ofrezca botones que el backend
   * rechazará).
   *
   * - `canEdit`: owner persona activo, super_admin, o miembro ACTIVO y TITULAR
   *   de la concesionaria en contexto DEALERSHIP con permiso
   *   `dealership.vehicle.edit` (owner/admin/seller por igual, D-133/D-149).
   *   Tras la transferencia pierde la titularidad y la capacidad pasa a `false`.
   * - `canRecordMileage`: PERSONAL → ownership activo; DEALERSHIP → membresía
   *   activa + `dealership.mileage.record` + titularidad; WORKSHOP/PLATFORM → false.
   * - `canCorrectVin`: D-144 — owner persona activo, super_admin, o miembro
   *   ACTIVO y TITULAR de la concesionaria con rol `owner`/`admin`
   *   (el vendedor NO cambia identidad). Espejo de lo que aplica el comando
   *   `POST /vehicles/:id/vin-correction`.
   */
  async getCapabilities(params: {
    vehicleId: string;
    userId: string;
    context?: CurrentContext;
  }): Promise<VehicleCapabilities> {
    const { vehicleId, userId, context } = params;

    if (await this.assertSuperAdmin(userId)) {
      return { canEdit: true, canRecordMileage: true, canCorrectVin: true };
    }

    const hasOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: { vehicleId, userId, endsAt: null },
      select: { id: true },
    });

    const contextType = context?.type ?? 'PERSONAL';

    let canEdit = !!hasOwnership;
    let canRecordMileage = false;
    let canCorrectVin = !!hasOwnership;
    if (contextType === 'PERSONAL') {
      canRecordMileage = !!hasOwnership;
    } else if (contextType === 'DEALERSHIP') {
      const dealershipCtx = context as DealershipContext;
      // D-133/D-149: la concesionaria TITULAR ACTIVA edita mientras es titular
      // (owner/admin/seller por igual, permiso `dealership.vehicle.edit`).
      canEdit =
        canEdit ||
        (await this.assertDealershipVehicleWrite(
          vehicleId,
          userId,
          dealershipCtx,
        ));
      canRecordMileage = await this.dealershipCanRecordMileage(
        vehicleId,
        userId,
        dealershipCtx,
      );
      canCorrectVin =
        canCorrectVin ||
        (await this.isDealershipTitularAdminOrOwner(
          vehicleId,
          userId,
          dealershipCtx,
        ));
    }

    return {
      canEdit,
      canRecordMileage,
      canCorrectVin,
    };
  }

  /**
   * Capacidad de registro de kilometraje en contexto DEALERSHIP: membresía
   * activa + permiso `dealership.mileage.record` + la concesionaria es titular
   * actual del vehículo (ownership activo `type: 'company'`). Tras la
   * transferencia el ownership se cierra y la capacidad pasa a `false`.
   */
  private async dealershipCanRecordMileage(
    vehicleId: string,
    userId: string,
    ctx: DealershipContext,
  ): Promise<boolean> {
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: { dealershipId: ctx.dealershipId, userId },
      },
      select: {
        status: true,
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!member || member.status !== 'active') return false;

    const hasPermission = member.role.permissions.some(
      (rp) => rp.permission.code === 'dealership.mileage.record',
    );
    if (!hasPermission) return false;

    const titularOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId,
        dealershipId: ctx.dealershipId,
        endsAt: null,
        type: 'company',
      },
      select: { id: true },
    });

    return !!titularOwnership;
  }

  /**
   * Helper: true si miembro titular activo es admin o owner de concesionaria
   * (para `canCorrectVin` en contexto DEALERSHIP: D-144 — owner/admin titular;
   * el vendedor no cambia identidad)
   */
  private async isDealershipTitularAdminOrOwner(
    vehicleId: string,
    userId: string,
    ctx: DealershipContext,
  ): Promise<boolean> {
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: { dealershipId: ctx.dealershipId, userId },
      },
      select: {
        status: true,
        role: { select: { code: true } },
      },
    });
    if (!member || member.status !== 'active') return false;

    // D-149: los roles son de sistema y se identifican por `code`
    // (`owner`/`admin`/`seller`), no por el `name` de presentación.
    const roleCode = (member.role?.code ?? '').toLowerCase();
    const isAdminOrOwner = roleCode === 'admin' || roleCode === 'owner';

    if (!isAdminOrOwner) return false;

    const titularOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId,
        dealershipId: ctx.dealershipId,
        endsAt: null,
        type: 'company',
      },
      select: { id: true },
    });

    return !!titularOwnership;
  }

  /**
   * Escrita de concesionaria (D-133/D-149): permite escritura a miembro TITULAR
   * ACTIVO de la concesionaria con permiso dealership.vehicle.edit.
   * - owner, admin y seller por igual según D-149.
   * - La escritura muere con la transferencia (sin titularidad activa -> denegado).
   * - PERSONAL (owner) no usa este método; se mantiene intacto.
   */
  async assertDealershipVehicleWrite(
    vehicleId: string,
    userId: string,
    ctx: DealershipContext,
  ): Promise<boolean> {
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: { dealershipId: ctx.dealershipId, userId },
      },
      select: {
        status: true,
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!member || member.status !== 'active') return false;

    const hasPermission = member.role.permissions.some(
      (rp) => rp.permission.code === 'dealership.vehicle.edit',
    );
    if (!hasPermission) return false;

    const titularOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId,
        dealershipId: ctx.dealershipId,
        endsAt: null,
        type: 'company',
      },
      select: { id: true },
    });

    return !!titularOwnership;
  }

  /**
   * FIX-B1 (RB-04): acceso de lectura de la concesionaria titular.
   *
   * Acepta cuando se cumplen AMBAS condiciones:
   * - el caller es miembro ACTIVO de la dealership actuando en contexto
   *   DEALERSHIP (membresía + al menos un permiso de lectura del rol:
   *   `dealership.vehicle.sell` | `dealership.vehicle.return` |
   *   `dealership.vehicle.create` | `dealership.vehicle.edit` |
   *   `dealership.mileage.record` | `history.view`);
   * - la dealership es el titular ACTUAL del vehículo (ownership activo,
   *   endsAt null, type 'company' — D-TL-9 / D-DB-1).
   *
   * Un miembro de una dealership NO titular es rechazado (no hay fuga de
   * vehículos entre concesionarias). super_admin NO se consulta aquí (lo
   * maneja el caller).
   */
  private async assertDealershipVehicleRead(
    vehicleId: string,
    userId: string,
    ctx: DealershipContext,
  ): Promise<boolean> {
    // (a) Membresía activa + permiso de lectura del rol
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: { dealershipId: ctx.dealershipId, userId },
      },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    if (!member || member.status !== 'active') return false;

    // READ_PERMISSIONS: códigos reales del seed (RB-10 + Gap 1 §4.1).
    // owner/admin/seller incluyen al menos uno de ellos.
    const READ_PERMISSIONS: readonly string[] = [
      'dealership.vehicle.sell',
      'dealership.vehicle.return',
      // Gap 1 (H-24): los 3 permisos nuevos también habilitan lectura para no
      // degradar el acceso de los holders de dealership que solo los tengan.
      'dealership.vehicle.create',
      'dealership.vehicle.edit',
      'dealership.mileage.record',
      'history.view',
    ];
    const hasReadPermission = member.role.permissions.some((rp) =>
      READ_PERMISSIONS.includes(rp.permission.code),
    );
    if (!hasReadPermission) return false;

    // (b) La dealership es el titular actual del vehículo
    const titularOwnership = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId,
        dealershipId: ctx.dealershipId,
        endsAt: null,
        type: 'company',
      },
      select: { id: true },
    });

    return !!titularOwnership;
  }

  /**
   * Checks if the vehicle has at least one maintenance record for the given
   * workshop. This prevents "any member can read any vehicle" over-exposure.
   *
   * Wave P3 — B6 (D-024 A1 Amendment 3): CANCELLED appointments and
   * CANCELLED work_orders do NOT constitute an association.
   *
   * Legs:
   * - appointments: status <> 'cancelled' (Wave P2)
   * - work_orders:  status <> 'cancelled' (Wave P3 — Amendment 3)
   * - estimates:    NO status filter (estimates maintain association per D-019)
   * - service_records: NO status filter (historical records always count)
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
        SELECT workshop_id FROM appointments WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'
        UNION
        SELECT workshop_id FROM work_orders WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'
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




