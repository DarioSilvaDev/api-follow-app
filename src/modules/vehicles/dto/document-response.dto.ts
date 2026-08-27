import { VehicleDocument } from '@prisma/client';

export class DocumentResponseDto {
  id!: string;
  vehicleId!: string;
  key!: string;
  name!: string;
  documentType!: string;
  expiresAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  static from(doc: VehicleDocument): DocumentResponseDto {
    return {
      id: doc.id,
      vehicleId: doc.vehicleId,
      key: doc.key,
      name: doc.name,
      documentType: doc.documentType,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
