import { VehiclePhoto } from '@prisma/client';

export class PhotoResponseDto {
  id!: string;
  vehicleId!: string;
  key!: string;
  caption!: string | null;
  isPrimary!: boolean;
  createdAt!: Date;

  static from(photo: VehiclePhoto): PhotoResponseDto {
    return {
      id: photo.id,
      vehicleId: photo.vehicleId,
      key: photo.key,
      caption: photo.caption,
      isPrimary: photo.isPrimary,
      createdAt: photo.createdAt,
    };
  }
}
