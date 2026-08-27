import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateVersionDto {
  @IsUUID()
  modelId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  productionFrom?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  productionTo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  engineCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  engineDisplacement?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  horsepower?: number;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  doors?: number;
}
