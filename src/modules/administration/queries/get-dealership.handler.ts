/**
 * D-106: detalle de concesionaria del panel de administración.
 *
 * Espejo de GetWorkshopHandler: consulta la concesionaria con sus miembros
 * (user + role) y la última invitación pending/accepted, exponen solo el
 * subset definido por DealershipDetailAdminResponseDto.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service';
import { DealershipDetailAdminResponseDto } from '../dto/dealership-detail-response.dto';

@Injectable()
export class GetDealershipHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string): Promise<DealershipDetailAdminResponseDto> {
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

    return DealershipDetailAdminResponseDto.from(dealership);
  }
}
