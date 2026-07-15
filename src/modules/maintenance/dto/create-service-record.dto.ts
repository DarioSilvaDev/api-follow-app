import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
  IsNumber,
} from 'class-validator';

export class CreateServiceRecordDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @IsUUID()
  workshopId!: string;

  @IsOptional()
  @IsUUID()
  performedByMemberId?: string;

  @IsInt()
  @Min(0)
  mileageAtService!: number;

  @IsString()
  description!: string;

  @IsDateString()
  serviceDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
