import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';
import { WorkOrderPriority } from '@prisma/client';

export class CreateWorkOrderDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  workshopId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageIn?: number;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
