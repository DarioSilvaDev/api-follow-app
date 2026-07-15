import { Appointment } from '@prisma/client';

type AppointmentWithRelations = Appointment & {
  vehicle?: { id: string; licensePlate: string };
  workshop?: { id: string; name: string };
  branch?: { id: string; name: string };
  customer?: { id: string; firstName: string; lastName: string };
};

export class AppointmentResponseDto {
  id!: string;
  vehicleId!: string;
  workshopId!: string;
  branchId!: string;
  customerId!: string;
  assignedToMemberId!: string | null;
  scheduledFor!: Date;
  mileageAtAppointment!: number | null;
  reason!: string;
  description!: string | null;
  status!: string;
  confirmedAt!: Date | null;
  cancelledAt!: Date | null;
  cancellationReason!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static from(a: AppointmentWithRelations): AppointmentResponseDto {
    return {
      id: a.id,
      vehicleId: a.vehicleId,
      workshopId: a.workshopId,
      branchId: a.branchId,
      customerId: a.customerId,
      assignedToMemberId: a.assignedToMemberId,
      scheduledFor: a.scheduledFor,
      mileageAtAppointment: a.mileageAtAppointment,
      reason: a.reason,
      description: a.description,
      status: a.status,
      confirmedAt: a.confirmedAt,
      cancelledAt: a.cancelledAt,
      cancellationReason: a.cancellationReason,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
