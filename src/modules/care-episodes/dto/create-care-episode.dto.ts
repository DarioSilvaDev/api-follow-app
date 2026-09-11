import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCareEpisodeDto {
  @IsUUID()
  vehicleId!: string;

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
  @IsString()
  @MaxLength(500)
  customerComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}
