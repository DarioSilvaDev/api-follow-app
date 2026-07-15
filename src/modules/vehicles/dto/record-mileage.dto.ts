import { IsInt, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { MileageSource } from '@prisma/client';

export class RecordMileageDto {
  @IsInt()
  @Min(0)
  mileage!: number;

  @IsEnum(MileageSource)
  source!: MileageSource;

  @IsOptional()
  @IsString()
  notes?: string;
}
