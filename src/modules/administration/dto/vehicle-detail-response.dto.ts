export class VehicleOwnerDto {
  id!: string;
  name!: string;
  email!: string;
  type!: string;
  startsAt!: Date;
  endsAt!: Date | null;

  static from(ownership: any): VehicleOwnerDto {
    return {
      id: ownership.userId,
      name: ownership.user
        ? `${ownership.user.firstName} ${ownership.user.lastName}`
        : 'Unknown',
      email: ownership.user?.email ?? '',
      type: ownership.type,
      startsAt: ownership.startsAt,
      endsAt: ownership.endsAt,
    };
  }
}

export class VehiclePhotoAdminDto {
  id!: string;
  url!: string;
  caption!: string | null;
  isPrimary!: boolean;
  createdAt!: Date;

  static from(photo: any): VehiclePhotoAdminDto {
    return {
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      isPrimary: photo.isPrimary,
      createdAt: photo.createdAt,
    };
  }
}

export class VehicleDetailAdminResponseDto {
  id!: string;
  licensePlate!: string;
  vin!: string | null;
  engineNumber!: string | null;
  manufactureYear!: number | null;
  modelYear!: number | null;
  color!: string | null;
  notes!: string | null;
  brand!: string | null;
  model!: string | null;
  version!: string | null;
  engineCode!: string | null;
  engineDisplacement!: number | null;
  horsepower!: number | null;
  fuelType!: string | null;
  transmission!: string | null;
  bodyType!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  owners!: VehicleOwnerDto[];
  photos!: VehiclePhotoAdminDto[];
  photoCount!: number;
  documentCount!: number;
  mileageCount!: number;

  static from(vehicle: any): VehicleDetailAdminResponseDto {
    return {
      id: vehicle.id,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      engineNumber: vehicle.engineNumber,
      manufactureYear: vehicle.manufactureYear,
      modelYear: vehicle.modelYear,
      color: vehicle.color,
      notes: vehicle.notes,
      brand: vehicle.version?.model?.brand?.name ?? null,
      model: vehicle.version?.model?.name ?? null,
      version: vehicle.version?.name ?? null,
      engineCode: vehicle.version?.engineCode ?? null,
      engineDisplacement: vehicle.version?.engineDisplacement ?? null,
      horsepower: vehicle.version?.horsepower ?? null,
      fuelType: vehicle.version?.fuelType ?? null,
      transmission: vehicle.version?.transmission ?? null,
      bodyType: vehicle.version?.bodyType ?? null,
      createdAt: vehicle.createdAt,
      updatedAt: vehicle.updatedAt,
      owners: (vehicle.ownerships ?? []).map((o: any) =>
        VehicleOwnerDto.from(o),
      ),
      photos: (vehicle.photos ?? []).map((p: any) =>
        VehiclePhotoAdminDto.from(p),
      ),
      photoCount: vehicle.photos?.length ?? 0,
      documentCount: vehicle.documents?.length ?? 0,
      mileageCount: vehicle.mileages?.length ?? 0,
    };
  }
}
