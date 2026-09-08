import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../../../common/database/prisma.service';
import { InvalidCredentialsException } from '../../../../common/exceptions/coded.exception';
import { envs } from '../../../../config/envs';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { AuthResponseDto } from '../../dto/auth-response.dto';
import { UserLoggedInEvent } from '../../events/user-logged-in.event';
import { RoleService } from '../../services/role.service';
import { LoginCommand } from './login.command';
import { createModuleLoggerToken } from '../../../../common/logger/create-module-logger';

interface LoginResult {
  response: AuthResponseDto;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

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
    private readonly roleService: RoleService,
  ) {}

  async execute(
    command: LoginCommand,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const { email, password } = command.dto;

    // Security Review #12 (P1): do NOT log the email at info level. Account
    // existence / state / credentials all produce the same generic outcome
    // below, so the email is not a useful PII-free audit signal here.
    this.logger.info({ message: 'Login attempt' });

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { credential: true },
    });

    // Uniform, indistiguishable 401 INVALID_CREDENTIALS for every failure path
    // (invalid credentials, nonexistent user, locked, pending or suspended
    // account). Accounts whose state makes them unauthenticatable are normalized
    // to the same response so an attacker cannot enumerate active emails.
    if (
      !user ||
      !user.credential ||
      user.credential.lockedUntil !== null &&
        new Date() < user.credential.lockedUntil ||
      user.status !== 'active'
    ) {
      const targetHash = user?.credential?.passwordHash ?? 'a';
      // Equalize bcrypt timing with the legitimate login path for every
      // failure branch that corresponds to an existing account.
      await bcrypt.compare(password, targetHash);
      throw new InvalidCredentialsException();
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

      throw new InvalidCredentialsException();
    }

    await this.prisma.userCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const roles = await this.roleService.loadUserRoles(user.id, false);
    const payload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = randomBytes(32).toString('base64url');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.authRepository.createSession({
      userId: user.id,
      refreshToken,
      expiresAt,
      ipAddress,
      userAgent,
    });

    this.eventEmitter.emit(
      'auth.user.logged_in',
      new UserLoggedInEvent(user.id),
    );

    return {
      response: AuthResponseDto.from({ ...UserResponseDto.from(user), roles }),
      accessToken,
      refreshToken,
      userId: user.id,
    };
  }
}
