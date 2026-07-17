import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { AuthResponseDto } from '../../dto/auth-response.dto';
import { UserLoggedInEvent } from '../../events/user-logged-in.event';
import { LoginCommand } from './login.command';
import { PinoLogger } from 'nestjs-pino';
import { createModuleLoggerToken } from '../../../../common/logger/create-module-logger';

@Injectable()
export class LoginHandler {
  constructor(
    @Inject(createModuleLoggerToken('Auth'))
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: LoginCommand) {
    const { email, password } = command.dto;
    this.logger.info({ email, message: 'Realizando login' });

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { credential: true },
    });

    if (!user || !user.credential) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      user.credential.lockedUntil &&
      new Date() < user.credential.lockedUntil
    ) {
      throw new UnauthorizedException(
        `Cuenta bloqueada. Intenta nuevamente en ${envs.ACCOUNT_LOCKOUT_MINUTES} minutos.`,
      );
    }

    if (user.status !== 'active') {
      if (user.status === 'pending') {
        throw new UnauthorizedException(
          'Email no verificado. Revisa tu correo o solicita un nuevo enlace.',
        );
      }
      throw new UnauthorizedException('Cuenta suspendida.');
    }

    const valid = await bcrypt.compare(password, user.credential.passwordHash);
    if (!valid) {
      const newAttempts = (user.credential.failedAttempts ?? 0) + 1;
      const updateData: Record<string, unknown> = {
        failedAttempts: newAttempts,
      };

      if (newAttempts >= envs.MAX_LOGIN_ATTEMPTS) {
        updateData.lockedUntil = new Date(
          Date.now() + envs.ACCOUNT_LOCKOUT_MINUTES * 60 * 1000,
        );
      }

      await this.prisma.userCredential.update({
        where: { userId: user.id },
        data: updateData,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.userCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = uuid();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.createSession({
      userId: user.id,
      refreshToken,
      expiresAt,
    });

    this.eventEmitter.emit(
      'auth.user.logged_in',
      new UserLoggedInEvent(user.id),
    );

    return AuthResponseDto.from(
      UserResponseDto.from(user),
      accessToken,
      refreshToken,
    );
  }
}
