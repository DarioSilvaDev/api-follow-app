import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * Detalle de usuario para el panel de administración.
 *
 * Además de los datos base y los roles de plataforma, incluye el contexto
 * operativo del usuario (panel superadmin — vista 360):
 *  - membresías de taller / concesionaria no inactivas (con taller, rol y
 *    sucursal por defecto);
 *  - historial: membresías `inactive` (baja suave) de taller / concesionaria,
 *    para que el panel muestre "fue miembro desde X hasta Y";
 *  - tenencias activas de vehículos del usuario (`endsAt: null`);
 *  - accesos vigentes a vehículos de terceros (no revocados y no expirados).
 *
 * Todo es aditivo sobre el contrato previo (`AdminUserDetail`).
 */
@Injectable()
export class GetUserHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        systemRoleAssignments: {
          include: { role: true },
        },
        workshopMemberships: {
          where: { status: { not: MemberStatus.inactive } },
          include: {
            workshop: {
              select: { id: true, name: true, status: true },
            },
            role: {
              select: { id: true, code: true, name: true },
            },
            defaultBranch: {
              select: { id: true, name: true },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
        dealershipMemberships: {
          where: { status: { not: MemberStatus.inactive } },
          include: {
            dealership: {
              select: { id: true, name: true, status: true, isActive: true },
            },
            role: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
        ownerships: {
          where: { endsAt: null },
          include: {
            vehicle: {
              include: {
                version: {
                  include: {
                    model: {
                      include: { brand: true },
                    },
                  },
                },
              },
            },
            dealership: {
              select: { id: true, name: true },
            },
          },
          orderBy: { startsAt: 'desc' },
        },
        vehicleAccesses: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          include: {
            vehicle: {
              include: {
                version: {
                  include: {
                    model: {
                      include: { brand: true },
                    },
                  },
                },
              },
            },
            grantedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundException('User', userId);

    // Historial de membresías dadas de baja (baja suave) — consultas aparte
    // porque Prisma no permite includes con alias arbitrario.
    const [inactiveWorkshopMemberships, inactiveDealershipMemberships] =
      await Promise.all([
        this.prisma.workshopMember.findMany({
          where: { userId, status: MemberStatus.inactive },
          include: {
            workshop: {
              select: { id: true, name: true, status: true },
            },
            role: {
              select: { id: true, code: true, name: true },
            },
            defaultBranch: {
              select: { id: true, name: true },
            },
          },
          orderBy: { leftAt: 'desc' },
        }),
        this.prisma.dealershipMember.findMany({
          where: { userId, status: MemberStatus.inactive },
          include: {
            dealership: {
              select: { id: true, name: true, status: true, isActive: true },
            },
            role: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { leftAt: 'desc' },
        }),
      ]);

    return {
      ...user,
      inactiveWorkshopMemberships,
      inactiveDealershipMemberships,
    };
  }
}
