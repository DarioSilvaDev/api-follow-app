import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { USER_REPOSITORY } from '../../../users/tokens';
import type { UserRepository } from '../../../users/repositories/user.repository';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { MailSendResult } from '../../../../common/mail/mail.types';
import { envs } from '../../../../config/envs';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { RegisterResponseDto } from '../../dto/register-response.dto';
import { UserRegisteredEvent } from '../../events/user-registered.event';
import { EmailVerificationSentEvent } from '../../events/email-verification-sent.event';
import { RegisterCommand } from './register.command';

@Injectable()
export class RegisterHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RegisterCommand) {
    const { email } = command.dto;

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      // D-032: duplicate registration is a resource conflict (409), not an
      // authentication failure. Deliberate enumeration: register is a public
      // endpoint where the user enters their own email, and the frontend maps
      // 409 CONFLICT (D-025) to show this message.
      throw new ConflictException('Ya existe una cuenta con este email');
    }

    const { password, ...rest } = command.dto;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.userRepository.create({ ...rest, passwordHash });

    const verificationToken = uuid();
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + envs.VERIFICATION_TOKEN_EXPIRY_HOURS,
    );

    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt,
      },
    });

    this.eventEmitter.emit(
      'auth.user.registered',
      new UserRegisteredEvent(user.id, user.email),
    );

    // D-110: register responde SIEMPRE 201. Nunca 503 por un fallo de email:
    // la cuenta ya está creada, así que un 5xx haría que el usuario reintente
    // el registro y reciba 409 "ya existe una cuenta con este email", sin
    // entender que él mismo acaba de crearla. Ese deadlock ya ocurrió en
    // producción el 2026-09-26.
    //
    // D-111: en cambio sí se le informa el estado de entrega. Aquí no hay
    // riesgo de enumeración: el solicitante acaba de crear la cuenta y ya
    // conoce su existencia. `emitAsync` (y no `emit`) es lo que permite que el
    // handler conozca el resultado del listener sin romper el patrón de
    // evento → listener.
    const delivery = await this.deliverVerificationEmail(
      user.id,
      user.email,
      verificationToken,
    );

    return RegisterResponseDto.fromRegistration(
      UserResponseDto.from(user),
      delivery,
    );
  }

  /**
   * D-115: el estado expresa el resultado del HANDSHAKE SMTP, nunca
   * "entregado". Sin DSN o webhook de bounce no se puede afirmar entrega, así
   * que el contrato no ofrece ese estado para no inducir a leerlo.
   */
  private async deliverVerificationEmail(
    userId: string,
    email: string,
    token: string,
  ): Promise<'accepted' | 'failed'> {
    try {
      const results = (await this.eventEmitter.emitAsync(
        'auth.email.verification.sent',
        new EmailVerificationSentEvent(userId, email, token),
      )) as MailSendResult[];

      const result = results.find(Boolean);

      if (!result) return 'failed';
      return result.ok ? 'accepted' : 'failed';
    } catch {
      // Red de seguridad: si la emisión misma falla, la cuenta YA está
      // creada y D-109 prohíbe revertirla. Se reporta el fallo en el estado,
      // nunca con una excepción.
      return 'failed';
    }
  }
}
