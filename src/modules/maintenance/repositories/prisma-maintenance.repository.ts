import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  MaintenanceRepository,
  CreateAppointmentData,
  CreateWorkOrderData,
  CreateEstimateData,
} from './maintenance.repository';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { AddWorkOrderItemDto } from '../dto/add-work-order-item.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class PrismaMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAppointment(data: CreateAppointmentData) {
    const { customerId, ...rest } = data;
    return this.prisma.appointment.create({
      data: { ...rest, customerId, status: AppointmentStatus.scheduled },
    });
  }

  async updateAppointment(id: string, data: UpdateAppointmentDto) {
    return this.prisma.appointment.update({ where: { id }, data });
  }

  async cancelAppointment(id: string, reason?: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.cancelled,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
  }

  async findAppointmentById(id: string) {
    return this.prisma.appointment.findUnique({ where: { id } });
  }

  async createWorkOrder(data: CreateWorkOrderData) {
    const { customerId, ...rest } = data;
    return this.prisma.workOrder.create({
      data: { ...rest, customerId, status: 'open' },
    });
  }

  async updateWorkOrderStatus(id: string, status: string) {
    const closeData = status === 'completed' ? { closedAt: new Date() } : {};
    return this.prisma.workOrder.update({
      where: { id },
      data: { status: status as any, ...closeData },
    });
  }

  async addWorkOrderItem(workOrderId: string, dto: AddWorkOrderItemDto) {
    const total = dto.quantity * dto.unitPrice;
    return this.prisma.workOrderItem.create({
      data: {
        workOrderId,
        type: dto.type,
        description: dto.description,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        total,
        isTaxable: dto.isTaxable ?? true,
      },
    });
  }

  async findWorkOrderById(id: string) {
    return this.prisma.workOrder.findUnique({ where: { id } });
  }

  async createServiceRecord(data: {
    vehicleId: string;
    workOrderId?: string;
    workshopId: string;
    performedByMemberId?: string;
    mileageAtService: number;
    description: string;
    serviceDate: Date;
    totalCost?: number;
    notes?: string;
  }) {
    return this.prisma.serviceRecord.create({ data });
  }

  async createEstimate(data: CreateEstimateData) {
    const { items, customerId, ...estimateData } = data;
    return this.prisma.estimate.create({
      data: {
        ...estimateData,
        customerId,
        items: {
          createMany: {
            data: items.map((i) => ({ ...i, total: i.quantity * i.unitPrice })),
          },
        },
      },
      include: { items: true },
    });
  }

  async findEstimateById(id: string) {
    return this.prisma.estimate.findUnique({
      where: { id },
      include: { items: true },
    });
  }
}
