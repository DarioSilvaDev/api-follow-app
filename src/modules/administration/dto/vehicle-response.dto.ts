export class VehicleAdminResponseDto {
  id!: string;
  licensePlate!: string;
  vin!: string | null;
  engineNumber!: string | null;
  manufactureYear!: number | null;
  modelYear!: number | null;
  color!: string | null;
  brand!: string | null;
  model!: string | null;
  version!: string | null;
  ownerName!: string | null;
  ownerEmail!: string | null;
  photoCount!: number;
  documentCount!: number;
  mileageCount!: number;
  createdAt!: Date;

  static from(vehicle: any): VehicleAdminResponseDto {
    const currentOwner = vehicle.ownerships?.find((o: any) => !o.endsAt)?.user;

    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      engineNumber: vehicle.engineNumber,
      manufactureYear: vehicle.manufactureYear,
      modelYear: vehicle.modelYear,
      color: vehicle.color,
      brand: vehicle.version?.model?.brand?.name ?? null,
      model: vehicle.version?.model?.name ?? null,
      version: vehicle.version?.name ?? null,
      ownerName: currentOwner
        ? `${currentOwner.firstName} ${currentOwner.lastName}`
        : null,
      ownerEmail: currentOwner?.email ?? null,
      photoCount: vehicle._count?.photos ?? vehicle.photos?.length ?? 0,
      documentCount:
        vehicle._count?.documents ?? vehicle.documents?.length ?? 0,
      mileageCount: vehicle._count?.mileages ?? vehicle.mileages?.length ?? 0,
      createdAt: vehicle.createdAt,
    };
  }
}
