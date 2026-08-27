import { IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

export class UpdateWorkOrderStatusDto {
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageOut?: number;
}
