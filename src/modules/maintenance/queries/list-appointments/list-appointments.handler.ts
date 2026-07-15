import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';

interface ListAppointmentsQuery {
  workshopId?: string;
  vehicleId?: string;
  customerId?: string;
  status?: AppointmentStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListAppointmentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListAppointmentsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.workshopId) where.workshopId = query.workshopId;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: {
          vehicle: { select: { id: true, licensePlate: true } },
          workshop: { select: { id: true, name: true } },
        },
        orderBy: { scheduledFor: 'desc' },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data: appointments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
