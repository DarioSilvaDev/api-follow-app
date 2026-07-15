import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { PasswordResetRequestedEvent } from '../../events/password-reset-requested.event';
import { RequestPasswordResetCommand } from './request-password-reset.command';

@Injectable()
export class RequestPasswordResetHandler {
  constructor(
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

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.authRepository.createPasswordReset({
      userId: user.id,
      token,
      expiresAt,
    });

    this.eventEmitter.emit(
      'auth.password_reset.requested',
      new PasswordResetRequestedEvent(user.email, token),
    );
  }
}
