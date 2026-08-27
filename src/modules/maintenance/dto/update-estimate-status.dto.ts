import { IsEnum } from 'class-validator';
import { EstimateStatus } from '@prisma/client';

export class UpdateEstimateStatusDto {
  @IsEnum(EstimateStatus)
  status!: EstimateStatus;
}
