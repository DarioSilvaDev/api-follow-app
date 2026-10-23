import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { IsValidVin } from './common/vin.validator';

export class CorrectVinDto {
  @IsString()
  @Validate(IsValidVin)
  vin!: string;

  /**
   * Motivo de la corrección (auditoría, D-144). Se sanea en el borde HTTP:
   * `trim` antes de validar, rechazo de sólo-espacios (`@IsNotEmpty` sobre el
   * valor ya recortado) y límite de longitud. El handler persiste el valor ya
   * saneado porque recibe el DTO transformado por el ValidationPipe global.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
