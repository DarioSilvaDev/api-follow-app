import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { PermissionCache } from '../cache/permission-cache';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser, ResolvedPermissions } from '../types/auth.types';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * PermissionsGuard — Evalúa si el contexto activo posee los permisos requeridos.
 *
 * Lee el contexto de request.context (resuelto por ContextGuard).
 * Fallback: si no hay contexto, infiere workshopId de request.params.id
 * para compatibilidad con endpoints que aún no usan ContextGuard.
 *
 * Scopes soportados:
 * - WORKSHOP: permisos del rol del miembro activo del taller.
 * - DEALERSHIP (Fase 1a consignación, D-TL-12): permisos del rol del miembro
 *   activo de la concesionaria.
 * - Sin scope: system roles (super_admin bypass + rol 'user').
 *
 * @see ADR-002 -- Active Context
 * @see ADR-003 -- Authorization & Permission Engine
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Preferir contexto resuelto por ContextGuard
    const ctx: CurrentContext | undefined = request.context;
    const scope = this.resolveScope(ctx, request.params);

    const cacheKey = scope.dealershipId
      ? `${user.id}:dealership:${scope.dealershipId}`
      : scope.workshopId
        ? `${user.id}:${scope.workshopId}`
        : user.id;

    const effective = await this.loadPermissions(user.id, scope, cacheKey);

    if (effective.systemRoles.includes('super_admin')) {
      return true;
    }

    const hasAll = requiredPermissions.every((perm) =>
      effective.permissions.has(perm),
    );

    if (!hasAll) {
      throw new ForbiddenException('Missing required permissions');
    }

    return true;
  }

  /**
   * Extrae el scope del contexto activo, con fallback a path params.
   */
  private resolveScope(
    ctx: CurrentContext | undefined,
    params: Record<string, string>,
  ): { dealershipId?: string; workshopId?: string } {
    if (ctx?.type === 'WORKSHOP') {
      return { workshopId: ctx.workshopId };
    }
    if (ctx?.type === 'DEALERSHIP') {
      return { dealershipId: ctx.dealershipId };
    }
    // Fallback de compatibilidad (endpoints legacy sin ContextGuard)
    return { workshopId: params?.id };
  }

  private async loadPermissions(
    userId: string,
    scope: { dealershipId?: string; workshopId?: string },
    cacheKey: string,
  ): Promise<ResolvedPermissions> {
    const cached = this.permissionCache.get(cacheKey);
    if (cached) return cached;

    const systemAssignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const systemRoles = systemAssignments.map((a) => a.role.type);
    const permissions = new Set<string>();

    for (const assignment of systemAssignments) {
      for (const rp of assignment.role.permissions) {
        permissions.add(rp.permission.code);
      }
    }

    if (scope.dealershipId) {
      const member = await this.prisma.dealershipMember.findUnique({
        where: {
          dealershipId_userId: { dealershipId: scope.dealershipId, userId },
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      if (member) {
        for (const rp of member.role.permissions) {
          permissions.add(rp.permission.code);
        }
      }
    } else if (scope.workshopId) {
      const member = await this.prisma.workshopMember.findUnique({
        where: { workshopId_userId: { workshopId: scope.workshopId, userId } },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      if (member) {
        for (const rp of member.role.permissions) {
          permissions.add(rp.permission.code);
        }
      }
    }

    const result: ResolvedPermissions = { systemRoles, permissions };
    this.permissionCache.set(cacheKey, result);
    return result;
  }
}
