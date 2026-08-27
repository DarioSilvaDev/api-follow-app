import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { SuperAdminDashboardResponseDto } from '../dto/super-admin-response.dto';

@Injectable()
export class SuperAdminStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<SuperAdminDashboardResponseDto> {
    const now = new Date();
    const firstDayOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [
      totalUsers,
      totalWorkshops,
      activeWorkshops,
      newClientsThisMonth,
      totalVehicles,
      totalWorkOrders,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.workshop.count({ where: { deletedAt: null } }),
      this.prisma.workshop.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: firstDayOfMonth }, deletedAt: null },
      }),
      this.prisma.vehicle.count({ where: { deletedAt: null } }),
      this.prisma.workOrder.count(),
    ]);

    return SuperAdminDashboardResponseDto.from({
      totalUsers,
      totalWorkshops,
      activeWorkshops,
      newClientsThisMonth,
      totalVehicles,
      totalWorkOrders,
    });
  }
}
