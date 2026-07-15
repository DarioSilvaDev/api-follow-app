import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceItemType } from '@prisma/client';

class EstimateItemDto {
  @IsEnum(ServiceItemType)
  type!: ServiceItemType;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  isTaxable?: boolean;
}

export class CreateEstimateDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  workshopId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateItemDto)
  items!: EstimateItemDto[];
}
