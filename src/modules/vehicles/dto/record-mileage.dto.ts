import { IsEmpty, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Gap 1 — D-05 / D-146: `source` se deriva del contexto activo en el servidor.
 *
 * El campo se declara con `@IsEmpty()` y **sin** `@IsOptional()` para que un
 * cliente que aún lo envíe reciba un `400` explícito, en lugar de que el
 * `ValidationPipe` (whitelist sin `forbidNonWhitelisted`, H-10) lo descarte en
 * silencio y el cliente crea que se persistió.
 */
export class RecordMileageDto {
  @IsInt()
  @Min(0)
  mileage!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsEmpty()
  source?: string;
}
