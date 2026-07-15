import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { ServiceItemType } from '@prisma/client';

export class AddWorkOrderItemDto {
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
  @IsBoolean()
  isTaxable?: boolean;
}
