import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../../types/auth.types';
import {
  CurrentContext,
  ContextType,
  PersonalContext,
  WorkshopContext,
  PlatformContext,
} from '../interfaces/current-context.interface';
import { InvalidContextException } from '../../exceptions/coded.exception';

/**
 * ContextResolver — Resolves the active context from explicit headers.
 *
 * D-020 A1: All silent fallbacks and path-based resolution have been removed.
 *
 * Rules:
 * - No X-Context-Type header → PERSONAL (explicit default, not a fallback)
 * - Unknown type → 403 INVALID_CONTEXT
 * - PERSONAL with X-Context-Id → 403 INVALID_CONTEXT
 * - WORKSHOP without X-Context-Id → 403 INVALID_CONTEXT
 * - WORKSHOP with id but no active membership → 403 INVALID_CONTEXT
 * - PLATFORM without system role assignment of type super_admin/admin/support → 403 INVALID_CONTEXT
 *
 * @see D-020 — ContextResolver sin fallback
 */
@Injectable()
export class ContextResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the active context from headers.
   *
   * When X-Context-Type is absent the default is PERSONAL.
   * All other invalid combinations are hard 403 errors.
   */
  async resolve(
    user: AuthenticatedUser,
    request: {
      headers: Record<string, string | string[] | undefined>;
    },
  ): Promise<CurrentContext> {
    const headerType = this.extractHeader(request.headers, 'x-context-type');
    const headerId = this.extractHeader(request.headers, 'x-context-id');

    // No header → default PERSONAL (allowed)
    if (!headerType) {
      return { type: 'PERSONAL', userId: user.id };
    }

    const normalizedType = headerType.toUpperCase() as ContextType;

    switch (normalizedType) {
      case 'PERSONAL': {
        if (headerId) {
          throw new InvalidContextException();
        }
        return { type: 'PERSONAL', userId: user.id };
      }

      case 'WORKSHOP': {
        if (!headerId) {
          throw new InvalidContextException();
        }
        return this.resolveWorkshopContext(user.id, headerId);
      }

      case 'PLATFORM': {
        return this.resolvePlatformContext(user.id);
      }

      default: {
        throw new InvalidContextException();
      }
    }
  }

  private async resolveWorkshopContext(
    userId: string,
    workshopId: string,
  ): Promise<WorkshopContext> {
    const member = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: { workshopId, userId },
      },
      include: {
        role: true,
      },
    });

    if (!member || member.status !== 'active') {
      throw new InvalidContextException();
    }

    return {
      type: 'WORKSHOP',
      userId,
      workshopId,
      memberId: member.id,
      roleId: member.roleId,
    };
  }

  private async resolvePlatformContext(
    userId: string,
  ): Promise<PlatformContext> {
    const assignment = await this.prisma.systemRoleAssignment.findFirst({
      where: {
        userId,
        role: { type: { in: ['super_admin', 'admin', 'support'] } },
      },
      include: { role: true },
    });

    if (!assignment) {
      throw new InvalidContextException();
    }

    return { type: 'PLATFORM', userId };
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ): string | undefined {
    const value = headers[key];
    if (Array.isArray(value)) return value[0];
    return value;
  }
}
