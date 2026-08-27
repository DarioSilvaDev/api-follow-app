import { VehicleModel } from '@prisma/client';
import { BrandResponseDto } from './brand-response.dto';

export class ModelResponseDto {
  id!: string;
  brandId!: string;
  name!: string;
  slug!: string;
  isActive!: boolean;
  createdAt!: Date;

  static from(model: VehicleModel): ModelResponseDto {
    return {
      id: model.id,
      brandId: model.brandId,
      name: model.name,
      slug: model.slug,
      isActive: model.isActive,
      createdAt: model.createdAt,
    };
  }
}

export class ModelDetailResponseDto extends ModelResponseDto {
  brand!: BrandResponseDto;

  static override from(model: any): ModelDetailResponseDto {
    return {
      id: model.id,
      brandId: model.brandId,
      name: model.name,
      slug: model.slug,
      isActive: model.isActive,
      createdAt: model.createdAt,
      brand: BrandResponseDto.from(model.brand),
    };
  }
}
