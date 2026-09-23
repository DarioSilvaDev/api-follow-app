import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Máximo de imágenes de evidencia admitidas en la creación owner (S6). */
export const MAX_OWNER_CREATION_FILES = 5;

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

  /**
   * Captions por archivo (S6), index-matched contra `files`.
   * - JSON: array de strings.
   * - multipart/form-data: campo repetido `captions` (FormData.append sincrónico
   *   por archivo; busboy/multer lo entrega como array).
   * Cada caption ≤ 500 chars; el handler aplica `captions[i] ?? null` por
   * índice y descarta sobrantes (aditivo, no rompe clientes existentes).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OWNER_CREATION_FILES)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  captions?: string[];
}
