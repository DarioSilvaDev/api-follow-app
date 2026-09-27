import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * D-111: `emailVerification` SOLO aparece en register. En login no va, porque
 * un usuario que ya pudo autenticarse tiene el email verificado.
 *
 * `state` expresa el resultado del HANDSHAKE con el relay SMTP, nunca la
 * entrega real. No hay DSN ni webhook de bounce en el MVP, así que ofrecer un
 * estado "delivered" sería mentir: el relay solo confirma que aceptó el
 * mensaje. La diferencia importa porque el frontend puede mostrar "no pudimos
 * enviar el email, reintentá" sin prometer algo que el backend no sabe.
 *
 * D-115: el día que exista confirmación de entrega, será un estado NUEVO y
 * explícito, no una reinterpretación de este.
 */
export type EmailVerificationState = 'accepted' | 'failed';

export class AuthResponseDto {
  user!: UserResponseDto;
  emailVerification?: { state: EmailVerificationState };

  static from(user: UserResponseDto): AuthResponseDto {
    return { user };
  }
}
