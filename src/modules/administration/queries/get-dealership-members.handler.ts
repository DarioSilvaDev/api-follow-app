import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * Listado admin de miembros de una concesionaria (panel superadmin).
 * Espejo de `GetWorkshopMembersHandler`: devuelve todas las membresías
 * (incluye inactivas — el DTO expone `status` para que la UI las distinga).
 */
@Injectable()
export class GetDealershipMembersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dealershipId: string) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
      select: { id: true, deletedAt: true },
    });

    if (!dealership || dealership.deletedAt) {
      throw new NotFoundException('Dealership', dealershipId);
    }

    return this.prisma.dealershipMember.findMany({
      where: { dealershipId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        role: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
  }
}
