import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RoleDto } from '../dto/role.dto';

/**
 * Minimal shape of a `SystemRoleAssignment` row with its role graph preloaded.
 * Matches the structural contract expected by `RoleDto.from`, plus `priority`
 * (needed for the canonical ordering).
 */
export interface RoleAssignmentGraph {
  role: {
    id: string;
    type: string;
    name: string;
    priority: number;
    permissions?: { permission: { code: string } }[];
  };
}

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async loadUserRoles(
    userId: string,
    includePermissions = false,
  ): Promise<RoleDto[]> {
    const assignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId },
      include: {
        role: includePermissions
          ? { include: { permissions: { include: { permission: true } } } }
          : true,
      },
    });

    return this.buildRoleDtos(assignments, includePermissions);
  }

  /**
   * Maps an already-loaded `SystemRoleAssignment` graph into `RoleDto[]`,
   * applying the canonical `priority desc` ordering. Extracted so the ordering
   * and DTO mapping live in a single place and can be reused by any caller that
   * already holds preloaded assignments, without duplicating that logic.
   */
  buildRoleDtos(
    assignments: RoleAssignmentGraph[],
    includePermissions = false,
  ): RoleDto[] {
    return [...assignments]
      .sort((a, b) => b.role.priority - a.role.priority)
      .map((a) => RoleDto.from(a, includePermissions));
  }
}
