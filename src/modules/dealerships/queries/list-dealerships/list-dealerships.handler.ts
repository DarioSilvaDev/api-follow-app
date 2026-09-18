import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

/**
 * ListDealershipsQuery — Expone las concesionarias a sus miembros activos.
 *
 * Espejo de ListWorkshopsHandler (Security Review #9 P1): un usuario solo
 * puede listar concesionarias donde tenga membresía activa. Los super_admins
 * de plataforma pueden listar todas.
 */
interface ListDealershipsQuery {
  userId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListDealershipsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListDealershipsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    let superAdmin = false;
    if (query.userId) {
      superAdmin = await this.isSuperAdmin(query.userId);
      if (!superAdmin) {
        const member = await this.prisma.dealershipMember.findFirst({
          where: { userId: query.userId, status: MemberStatus.active },
          select: { id: true },
        });
        if (!member) {
          throw new ForbiddenException(
            'You are not authorized to list dealerships',
          );
        }
      }
    }

    // Super admins ven todas; miembros regulares solo las propias.
    const where =
      query.userId && !superAdmin
        ? {
            members: {
              some: { userId: query.userId, status: MemberStatus.active },
            },
          }
        : undefined;

    const [dealerships, total] = await Promise.all([
      this.prisma.dealership.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dealership.count({ where }),
    ]);

    return {
      data: dealerships,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const superAdminRole = await this.prisma.systemRole.findUnique({
      where: { type: 'super_admin' },
      select: { id: true },
    });
    if (!superAdminRole) return false;

    const assignment = await this.prisma.systemRoleAssignment.findFirst({
      where: { userId, roleId: superAdminRole.id },
      select: { id: true },
    });

    return !!assignment;
  }
}