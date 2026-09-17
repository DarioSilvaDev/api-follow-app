import { IsString, Matches, ValidateIf } from 'class-validator';

/**
 * Fase 2 (D-077): cuerpo de PATCH /users/me/alias.
 * - `{ alias: "mi-alias" }` setea el alias (regex D-077).
 * - `{ alias: null }` elimina el alias (respeta cooldown, spec §6.5).
 * - El alias se normaliza a lowercase server-side en el handler.
 */
export class UpdateMyAliasDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'alias must be a string or null' })
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/, {
    message:
      'El alias solo puede contener letras, números y los símbolos . _ - (3 a 30 caracteres)',
  })
  alias?: string | null;
}
