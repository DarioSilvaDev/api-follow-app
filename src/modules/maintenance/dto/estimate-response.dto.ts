import { Estimate, EstimateItem } from '@prisma/client';

type EstimateWithRelations = Estimate & { items?: EstimateItem[] };

export class EstimateResponseDto {
  id!: string;
  number!: string;
  vehicleId!: string;
  workshopId!: string;
  branchId!: string;
  workOrderId!: string | null;
  customerId!: string;
  status!: string;
  subtotal!: number;
  taxRate!: number | null;
  taxAmount!: number | null;
  total!: number;
  validUntil!: Date | null;
  notes!: string | null;
  acceptedAt!: Date | null;
  rejectedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  items?: EstimateItem[];

  static from(e: EstimateWithRelations): EstimateResponseDto {
    return {
      id: e.id,
      number: e.number,
      vehicleId: e.vehicleId,
      workshopId: e.workshopId,
      branchId: e.branchId,
      workOrderId: e.workOrderId,
      customerId: e.customerId,
      status: e.status,
      subtotal: Number(e.subtotal),
      taxRate: e.taxRate ? Number(e.taxRate) : null,
      taxAmount: e.taxAmount ? Number(e.taxAmount) : null,
      total: Number(e.total),
      validUntil: e.validUntil,
      notes: e.notes,
      acceptedAt: e.acceptedAt,
      rejectedAt: e.rejectedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      items: e.items,
    };
  }
}
