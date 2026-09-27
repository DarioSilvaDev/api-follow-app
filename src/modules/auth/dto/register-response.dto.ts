import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthResponseDto, EmailVerificationState } from './auth-response.dto';

/**
 * Respuesta de `POST /auth/register`.
 *
 * Extiende `AuthResponseDto` con un campo REQUERIDO a propósito. Register
 * siempre informa el estado del email de verificación; declararlo opcional
 * (como en AuthResponseDto, donde login sí omite el campo) obligaría al
 * consumidor a un chequeo de null que en esta ruta nunca falla, y escondería
 * un contrato que el frontend sí puede confiar.
 *
 * D-110: esta respuesta es siempre 201. Un 5xx aquí haría que el usuario
 * reintente el registro y reciba 409 "ya existe una cuenta con este email",
 * sin entender que él mismo acaba de crearla.
 */
export class RegisterResponseDto extends AuthResponseDto {
  declare emailVerification: { state: EmailVerificationState };

  static fromRegistration(
    user: UserResponseDto,
    state: EmailVerificationState,
  ): RegisterResponseDto {
    return { user, emailVerification: { state } };
  }
}
