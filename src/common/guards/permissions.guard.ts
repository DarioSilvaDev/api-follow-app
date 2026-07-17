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

    const workshopId = request.params.id;
    const cacheKey = workshopId ? `${user.id}:${workshopId}` : user.id;

    const effective = await this.loadPermissions(user.id, workshopId, cacheKey);

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

  private async loadPermissions(
    userId: string,
    workshopId: string | undefined,
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

    if (workshopId) {
      const member = await this.prisma.workshopMember.findUnique({
        where: { workshopId_userId: { workshopId, userId } },
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
