import { WorkOrder, WorkOrderItem } from '@prisma/client';

type WorkOrderWithRelations = WorkOrder & {
  items?: WorkOrderItem[];
  vehicle?: { id: string; licensePlate: string };
  workshop?: { id: string; name: string };
  branch?: { id: string; name: string };
};

export class WorkOrderResponseDto {
  id!: string;
  number!: string;
  vehicleId!: string;
  workshopId!: string;
  branchId!: string;
  appointmentId!: string | null;
  customerId!: string;
  assignedToMemberId!: string | null;
  mileageIn!: number | null;
  mileageOut!: number | null;
  status!: string;
  priority!: string;
  customerNotes!: string | null;
  internalNotes!: string | null;
  openedAt!: Date;
  closedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  items?: WorkOrderItem[];

  static from(wo: WorkOrderWithRelations): WorkOrderResponseDto {
    return {
      id: wo.id,
      number: wo.number,
      vehicleId: wo.vehicleId,
      workshopId: wo.workshopId,
      branchId: wo.branchId,
      appointmentId: wo.appointmentId,
      customerId: wo.customerId,
      assignedToMemberId: wo.assignedToMemberId,
      mileageIn: wo.mileageIn,
      mileageOut: wo.mileageOut,
      status: wo.status,
      priority: wo.priority,
      customerNotes: wo.customerNotes,
      internalNotes: wo.internalNotes,
      openedAt: wo.openedAt,
      closedAt: wo.closedAt,
      createdAt: wo.createdAt,
      updatedAt: wo.updatedAt,
      items: wo.items,
    };
  }
}
