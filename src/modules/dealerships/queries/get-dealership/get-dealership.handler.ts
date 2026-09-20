import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetDealershipHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detalle de concesionaria. Requiere membresía activa (o plataforma
   * super_admin) — espejo de GetWorkshopHandler (Security Review #9 P1).
   */
  async execute(id: string, userId?: string) {
    if (userId) {
      if (!(await this.isSuperAdmin(userId))) {
        const member = await this.prisma.dealershipMember.findUnique({
          where: { dealershipId_userId: { dealershipId: id, userId } },
          select: { status: true },
        });
        if (!member || member.status !== MemberStatus.active) {
          throw new ForbiddenException(
            'You are not authorized to view this dealership',
          );
        }
      }
    }

    const dealership = await this.prisma.dealership.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
      },
    });

    if (!dealership) throw new NotFoundException('Dealership', id);

    // D-106: defensa en profundidad — una concesionaria no reclamada
    // (pending_claim) no es visible para usuarios regulares, ni siquiera vía
    // GET /dealerships/:id. Solo plataforma (super_admin) la ve.
    if (dealership.status === 'pending_claim' && userId) {
      if (!(await this.isSuperAdmin(userId))) {
        throw new ForbiddenException(
          'You are not authorized to view this dealership',
        );
      }
    }

    return dealership;
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