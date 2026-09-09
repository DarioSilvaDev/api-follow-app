import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { USER_REPOSITORY } from '../../../users/tokens';
import type { UserRepository } from '../../../users/repositories/user.repository';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { AuthResponseDto } from '../../dto/auth-response.dto';
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

    this.eventEmitter.emit(
      'auth.email.verification.sent',
      new EmailVerificationSentEvent(user.id, user.email, verificationToken),
    );

    return AuthResponseDto.from(UserResponseDto.from(user));
  }
}
