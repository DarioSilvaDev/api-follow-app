import { ServiceRecord } from '@prisma/client';

export class ServiceRecordResponseDto {
  id!: string;
  vehicleId!: string;
  workOrderId!: string | null;
  workshopId!: string;
  performedByMemberId!: string | null;
  mileageAtService!: number;
  description!: string;
  serviceDate!: Date;
  totalCost!: number | null;
  notes!: string | null;
  createdAt!: Date;

  static from(sr: ServiceRecord): ServiceRecordResponseDto {
    return {
      id: sr.id,
      vehicleId: sr.vehicleId,
      workOrderId: sr.workOrderId,
      workshopId: sr.workshopId,
      performedByMemberId: sr.performedByMemberId,
      mileageAtService: sr.mileageAtService,
      description: sr.description,
      serviceDate: sr.serviceDate,
      totalCost: sr.totalCost ? Number(sr.totalCost) : null,
      notes: sr.notes,
      createdAt: sr.createdAt,
    };
  }
}
