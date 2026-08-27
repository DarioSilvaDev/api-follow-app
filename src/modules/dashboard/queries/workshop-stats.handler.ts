import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { WorkshopDashboardResponseDto } from '../dto/workshop-response.dto';
import { getWorkshopDayRange } from '../utils/timezone';

@Injectable()
export class WorkshopStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workshopId: string,
    userId: string,
  ): Promise<WorkshopDashboardResponseDto> {
    const member = await this.prisma.workshopMember.findUnique({
      where: { workshopId_userId: { workshopId, userId } },
      include: { role: true },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException('Not an active member of this workshop');
    }

    if (!['owner', 'admin'].includes(member.role.code)) {
      throw new ForbiddenException(
        'Insufficient permissions for workshop dashboard',
      );
    }

    const workshop = await this.prisma.workshop.findUnique({
      where: { id: workshopId },
    });

    const { startUTC, endUTC } = getWorkshopDayRange(null);

    const [
      vehiclesIn,
      vehiclesOut,
      openOrders,
      awaitingParts,
      delayedOrders,
      pendingEstimates,
      ordersByStatusRaw,
      todayAppointments,
      recentTransfers,
    ] = await Promise.all([
      this.prisma.workOrder.count({
        where: {
          workshopId,
          createdAt: { gte: startUTC, lte: endUTC },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          closedAt: { gte: startUTC, lte: endUTC },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          status: { in: ['draft', 'open', 'in_progress'] },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          status: 'in_progress',
          items: { some: { type: 'part' } },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          status: { in: ['open', 'in_progress'] },
          closedAt: null,
          openedAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.estimate.count({
        where: {
          workshopId,
          status: 'draft',
        },
      }),
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { workshopId },
        _count: true,
      }),
      this.prisma.appointment.findMany({
        where: {
          workshopId,
          scheduledFor: { gte: startUTC, lte: endUTC },
          status: { not: 'cancelled' },
        },
        include: {
          vehicle: {
            include: {
              version: { include: { model: { include: { brand: true } } } },
            },
          },
        },
        orderBy: { scheduledFor: 'asc' },
      }),
      this.prisma.vehicleTransferEvent.findMany({
        where: {
          transfer: { vehicle: { workOrders: { some: { workshopId } } } },
        },
        include: {
          transfer: {
            include: {
              vehicle: {
                include: {
                  version: { include: { model: { include: { brand: true } } } },
                },
              },
            },
          },
          performedBy: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const row of ordersByStatusRaw) {
      ordersByStatus[row.status] = row._count;
    }

    const alerts: WorkshopDashboardResponseDto['alerts'] = [];
    if (pendingEstimates > 0) {
      alerts.push({
        type: 'estimate',
        message: `${pendingEstimates} presupuestos por aprobar`,
        count: pendingEstimates,
        severity: 'warning',
      });
    }

    const readyForDelivery = await this.prisma.workOrder.count({
      where: { workshopId, status: 'completed' },
    });
    if (readyForDelivery > 0) {
      alerts.push({
        type: 'delivery',
        message: `${readyForDelivery} vehículos listos para entregar`,
        count: readyForDelivery,
        severity: 'info',
      });
    }

    if (delayedOrders > 0) {
      alerts.push({
        type: 'delayed',
        message: `${delayedOrders} OT retrasada${delayedOrders > 1 ? 's' : ''}`,
        count: delayedOrders,
        severity: 'error',
      });
    }

    const formatVehicleName = (v: any): string => {
      if (!v?.version?.model?.brand) return 'Vehículo';
      return `${v.version.model.brand.name} ${v.version.model.name}`;
    };

    const agenda = todayAppointments.map((appt) => ({
      id: appt.id,
      time: new Date(appt.scheduledFor).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      vehicle: formatVehicleName(appt.vehicle),
      plate: appt.vehicle?.licensePlate ?? '',
      reason: appt.reason,
      status: appt.status,
    }));

    const recentActivity = recentTransfers.map((evt) => ({
      time: new Date(evt.createdAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      action: evt.type,
      vehicle: formatVehicleName(evt.transfer?.vehicle),
      user: evt.performedBy
        ? `${evt.performedBy.firstName} ${evt.performedBy.lastName}`
        : '',
    }));

    return new WorkshopDashboardResponseDto({
      todaySummary: {
        vehiclesIn,
        vehiclesOut,
        openOrders,
        awaitingParts,
        delayedOrders,
        pendingEstimates,
      },
      agenda,
      ordersByStatus,
      alerts,
      recentActivity,
    } as WorkshopDashboardResponseDto);
  }
}
