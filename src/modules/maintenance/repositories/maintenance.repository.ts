import {
  Appointment,
  WorkOrder,
  WorkOrderItem,
  ServiceRecord,
  Estimate,
  WorkOrderPriority,
  ServiceItemType,
} from '@prisma/client';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { AddWorkOrderItemDto } from '../dto/add-work-order-item.dto';

export type CreateAppointmentData = Omit<
  CreateAppointmentDto,
  'scheduledFor'
> & {
  scheduledFor: Date;
  customerId: string;
};
export type CreateWorkOrderData = {
  number: string;
  vehicleId: string;
  workshopId: string;
  branchId: string;
  appointmentId?: string;
  customerId: string;
  mileageIn?: number;
  priority?: WorkOrderPriority;
  customerNotes?: string;
  internalNotes?: string;
};
export type CreateEstimateData = {
  number: string;
  vehicleId: string;
  workshopId: string;
  branchId: string;
  workOrderId?: string;
  customerId: string;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  total: number;
  validUntil?: Date;
  notes?: string;
  items: {
    type: ServiceItemType;
    description: string;
    quantity: number;
    unitPrice: number;
    isTaxable?: boolean;
  }[];
};

export interface MaintenanceRepository {
  createAppointment(data: CreateAppointmentData): Promise<Appointment>;
  updateAppointment(
    id: string,
    data: UpdateAppointmentDto,
  ): Promise<Appointment>;
  cancelAppointment(id: string, reason?: string): Promise<Appointment>;
  findAppointmentById(id: string): Promise<Appointment | null>;
  createWorkOrder(data: CreateWorkOrderData): Promise<WorkOrder>;
  updateWorkOrderStatus(id: string, status: string): Promise<WorkOrder>;
  addWorkOrderItem(
    workOrderId: string,
    data: AddWorkOrderItemDto,
  ): Promise<WorkOrderItem>;
  findWorkOrderById(id: string): Promise<WorkOrder | null>;
  createServiceRecord(data: {
    vehicleId: string;
    workOrderId?: string;
    workshopId: string;
    performedByMemberId?: string;
    mileageAtService: number;
    description: string;
    serviceDate: Date;
    totalCost?: number;
    notes?: string;
  }): Promise<ServiceRecord>;
  createEstimate(data: CreateEstimateData): Promise<Estimate>;
  findEstimateById(id: string): Promise<Estimate | null>;
}
