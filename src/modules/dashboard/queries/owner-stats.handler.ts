import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { OwnerDashboardResponseDto } from '../dto/owner-response.dto';

@Injectable()
export class OwnerStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<OwnerDashboardResponseDto> {
    const ownerships = await this.prisma.vehicleOwnership.findMany({
      where: {
        userId,
        endsAt: null,
      },
      include: {
        vehicle: {
          include: {
            workOrders: {
              where: { status: { in: ['open', 'in_progress', 'draft'] } },
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                workshop: true,
              },
            },
            version: { include: { model: { include: { brand: true } } } },
            mileages: {
              orderBy: { recordedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const formatVehicleName = (v: any): string => {
      if (!v?.version?.model?.brand) return 'Vehículo';
      return `${v.version.model.brand.name} ${v.version.model.name}`;
    };

    const vehicles = ownerships.map((o) => {
      const v = o.vehicle;
      const activeWo = v.workOrders[0] ?? null;

      return {
        id: v.id,
        name: formatVehicleName(v),
        plate: v.licensePlate,
        status: activeWo ? 'in_repair' : 'ok',
        currentWorkOrder: activeWo
          ? {
              number: activeWo.number,
              stage: activeWo.status,
              updatedAt: activeWo.updatedAt.toISOString(),
            }
          : null,
      };
    });

    return new OwnerDashboardResponseDto({
      vehicles,
      upcomingMaintenance: [],
    } as OwnerDashboardResponseDto);
  }
}
