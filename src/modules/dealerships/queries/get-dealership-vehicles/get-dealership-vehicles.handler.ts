import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DealershipVehicleResponseDto } from '../../dto/dealership-vehicle-response.dto';

@Injectable()
export class GetDealershipVehiclesHandler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Panel de la concesionaria (§8 spec): vehículos en exhibición = ownership
   * activo (endsAt: null) con dealershipId = concesionaria (índice
   * @@index([dealershipId, endsAt]) del schema).
   *
   * Respuesta con el shape de VehicleResponseDto para reutilizar el contrato
   * del frontend (ownerships activos incluidos).
   */
  async execute(dealershipId: string) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });
    if (!dealership) throw new NotFoundException('Dealership', dealershipId);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerships: { some: { dealershipId, endsAt: null } } },
      include: {
        version: {
          include: {
            model: {
              include: { brand: true },
            },
          },
        },
        ownerships: {
          where: { endsAt: null },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
            dealership: { select: { id: true, name: true } },
          },
        },
        photos: { where: { isPrimary: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vehicles.map((vehicle) =>
      DealershipVehicleResponseDto.from(vehicle),
    );
  }
}