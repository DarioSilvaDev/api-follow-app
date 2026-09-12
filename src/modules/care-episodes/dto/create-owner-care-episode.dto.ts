import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * CreateOwnerCareEpisodeDto — POST /api/care-episodes/owner (contexto PERSONAL).
 *
 * Iteración 2-2 (SPEC §7): dos DTOs, uno por ruta. Este DTO NO contiene campos
 * de taller (branchId/appointmentId/customerComplaint/internalNotes): si el
 * cliente los enviara, el ValidationPipe global los strip silenciosamente
 * (whitelist: true, forbidNonWhitelisted: false — main.ts).
 *
 * XOR workshopId/workshopName y fecha no futura se validan manualmente en el
 * handler (class-validator no expresa XOR limpiamente).
 */
export class CreateOwnerCareEpisodeDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsDateString()
  serviceDate!: string;

  @IsOptional()
  @IsUUID()
  workshopId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  workshopName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageIn?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
