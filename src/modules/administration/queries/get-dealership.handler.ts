/**
 * D-106: detalle de concesionaria del panel de administración.
 *
 * Espejo de GetWorkshopHandler: consulta la concesionaria con sus miembros
 * (user + role) y la última invitación pending/accepted, y devuelve la entidad
 * **sin mapear**. El mapeo al subset del contrato (DealershipDetailAdminResponseDto,
 * que además filtra el token de invitación) lo aplica el controller UNA sola
 * vez. Devuelve raw para evitar el doble mapeo que degradaba members a
 * "Unknown"/"" (fallbacks del DTO sobre objetos ya transformados) — D-TL-20.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class GetDealershipHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            role: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        invitations: {
          where: {
            status: { in: ['pending', 'accepted'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!dealership) {
      throw new NotFoundException('Dealership not found');
    }

    return dealership;
  }
}
