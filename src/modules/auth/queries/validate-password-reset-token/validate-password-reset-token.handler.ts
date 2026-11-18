import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';

/**
 * ValidatePasswordResetTokenHandler — query de solo lectura (pre-auth).
 *
 * Responde `{ valid: true }` únicamente si el token existe, no fue usado
 * (`usedAt == null`) y no expiró. Cualquier otro caso responde 401 con el
 * mismo mensaje (`Enlace inválido o expirado`, envelope D-025 SESSION_EXPIRED)
 * para no permitir enumeración de tokens.
 *
 * NUNCA marca `usedAt` ni consume el token: es 100% idempotente.
 * El hashing del token lo hace el repositorio (`findPasswordResetByToken`
 * aplica `hashPasswordResetToken` internamente); no se re-hashea acá.
 */
@Injectable()
export class ValidatePasswordResetTokenHandler {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(token: string): Promise<{ valid: true }> {
    const reset = await this.authRepository.findPasswordResetByToken(token);

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('Enlace inválido o expirado');
    }

    return { valid: true };
  }
}
