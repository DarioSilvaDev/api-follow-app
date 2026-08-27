import { VehicleBrand } from '@prisma/client';
import { ModelResponseDto } from './model-response.dto';

export class BrandResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  logoUrl!: string | null;
  isActive!: boolean;
  createdAt!: Date;

  static from(brand: VehicleBrand): BrandResponseDto {
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive,
      createdAt: brand.createdAt,
    };
  }
}

export class BrandDetailResponseDto extends BrandResponseDto {
  models!: ModelResponseDto[];

  static override from(brand: any): BrandDetailResponseDto {
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive,
      createdAt: brand.createdAt,
      models: (brand.models ?? []).map((m: any) => ModelResponseDto.from(m)),
    };
  }
}
