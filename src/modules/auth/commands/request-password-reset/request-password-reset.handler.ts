import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { PasswordResetRequestedEvent } from '../../events/password-reset-requested.event';
import { RequestPasswordResetCommand } from './request-password-reset.command';
import { createModuleLoggerToken } from '../../../../common/logger/create-module-logger';

@Injectable()
export class RequestPasswordResetHandler {
  constructor(
    @Inject(createModuleLoggerToken('Auth'))
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RequestPasswordResetCommand) {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    if (!user) return;

    // Revocar tokens anteriores del mismo usuario (D-027)
    await this.authRepository.revokeUnusedPasswordResets(user.id);

    // Limpieza oportunista de tokens usados/expirados (D-033). Se ejecuta
    // ANTES de crear el nuevo token para que el token recién creado nunca se
    // vea afectado por el DELETE.
    await this.authRepository.deleteCleanupPasswordResets(user.id);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.authRepository.createPasswordReset({
      userId: user.id,
      token,
      expiresAt,
    });

    this.logger.info({ message: 'Password reset requested', userId: user.id });

    this.eventEmitter.emit(
      'auth.password_reset.requested',
      new PasswordResetRequestedEvent(user.email, token),
    );
  }
}
