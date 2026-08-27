import { VehicleVersion } from '@prisma/client';
import { ModelResponseDto } from './model-response.dto';

export class VersionResponseDto {
  id!: string;
  modelId!: string;
  name!: string;
  productionFrom!: number | null;
  productionTo!: number | null;
  engineCode!: string | null;
  engineDisplacement!: number | null;
  horsepower!: number | null;
  fuelType!: string;
  transmission!: string;
  bodyType!: string;
  doors!: number | null;
  createdAt!: Date;

  static from(version: VehicleVersion): VersionResponseDto {
    return {
      id: version.id,
      modelId: version.modelId,
      name: version.name,
      productionFrom: version.productionFrom,
      productionTo: version.productionTo,
      engineCode: version.engineCode,
      engineDisplacement: version.engineDisplacement,
      horsepower: version.horsepower,
      fuelType: version.fuelType,
      transmission: version.transmission,
      bodyType: version.bodyType,
      doors: version.doors,
      createdAt: version.createdAt,
    };
  }
}

export class VersionDetailResponseDto extends VersionResponseDto {
  model!: ModelResponseDto;

  static override from(version: any): VersionDetailResponseDto {
    return {
      id: version.id,
      modelId: version.modelId,
      name: version.name,
      productionFrom: version.productionFrom,
      productionTo: version.productionTo,
      engineCode: version.engineCode,
      engineDisplacement: version.engineDisplacement,
      horsepower: version.horsepower,
      fuelType: version.fuelType,
      transmission: version.transmission,
      bodyType: version.bodyType,
      doors: version.doors,
      createdAt: version.createdAt,
      model: ModelResponseDto.from(version.model),
    };
  }
}
