import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { MechanicDashboardResponseDto } from '../dto/mechanic-response.dto';

@Injectable()
export class MechanicStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workshopId: string,
    userId: string,
  ): Promise<MechanicDashboardResponseDto> {
    const member = await this.prisma.workshopMember.findUnique({
      where: { workshopId_userId: { workshopId, userId } },
      include: { role: true },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException('Not an active member of this workshop');
    }

    if (member.role.code !== 'mechanic') {
      throw new ForbiddenException('Only mechanics can access this dashboard');
    }

    const memberId = member.id;

    const [
      assignedWork,
      awaitingParts,
      awaitingApproval,
      pendingDiagnosis,
      recentWorkOrders,
    ] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          workshopId,
          assignedToMemberId: memberId,
          status: { in: ['open', 'in_progress'] },
        },
        include: {
          vehicle: {
            include: {
              version: { include: { model: { include: { brand: true } } } },
            },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          assignedToMemberId: memberId,
          status: 'in_progress',
          items: { some: { type: 'part' } },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          assignedToMemberId: memberId,
          status: 'draft',
        },
      }),
      this.prisma.workOrder.count({
        where: {
          workshopId,
          assignedToMemberId: memberId,
          status: 'open',
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          workshopId,
          assignedToMemberId: memberId,
          status: { in: ['completed', 'cancelled'] },
        },
        include: {
          vehicle: {
            include: {
              version: { include: { model: { include: { brand: true } } } },
            },
          },
        },
        orderBy: { closedAt: 'desc' },
        take: 10,
      }),
    ]);

    const formatVehicleName = (v: any): string => {
      if (!v?.version?.model?.brand) return 'Vehículo';
      return `${v.version.model.brand.name} ${v.version.model.name}`;
    };

    const mappedAssignedWork = assignedWork.map((wo) => ({
      workOrderId: wo.id,
      orderNumber: wo.number,
      vehicle: formatVehicleName(wo.vehicle),
      plate: wo.vehicle?.licensePlate ?? '',
      task: wo.customerNotes ?? wo.internalNotes ?? '',
      priority: wo.priority,
      status: wo.status,
      estimatedCompletion: null as string | null,
    }));

    const seenVehicles = new Map<string, any>();
    for (const wo of recentWorkOrders) {
      if (!seenVehicles.has(wo.vehicleId)) {
        seenVehicles.set(wo.vehicleId, {
          vehicleId: wo.vehicleId,
          name: formatVehicleName(wo.vehicle),
          plate: wo.vehicle?.licensePlate ?? '',
          lastWorkDate: (wo.closedAt ?? wo.updatedAt).toISOString(),
        });
      }
    }

    return new MechanicDashboardResponseDto({
      assignedWork: mappedAssignedWork,
      pendingWork: {
        awaitingParts,
        awaitingApproval,
        pendingDiagnosis,
      },
      recentVehicles: Array.from(seenVehicles.values()),
    } as MechanicDashboardResponseDto);
  }
}
