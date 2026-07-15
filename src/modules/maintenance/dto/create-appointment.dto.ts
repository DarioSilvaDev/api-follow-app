import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  workshopId!: string;

  @IsUUID()
  branchId!: string;

  @IsDateString()
  scheduledFor!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageAtAppointment?: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
