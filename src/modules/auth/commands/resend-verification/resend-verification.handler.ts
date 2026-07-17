import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { EmailVerificationSentEvent } from '../../events/email-verification-sent.event';
import { ResendVerificationDto } from '../../dto/resend-verification.dto';

@Injectable()
export class ResendVerificationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(dto: ResendVerificationDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.status !== 'pending') {
      return;
    }

    await this.prisma.emailVerification.updateMany({
      where: { userId: user.id, verifiedAt: null },
      data: { expiresAt: new Date(0) },
    });

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + envs.VERIFICATION_TOKEN_EXPIRY_HOURS,
    );

    await this.prisma.emailVerification.create({
      data: { userId: user.id, token, expiresAt },
    });

    this.eventEmitter.emit(
      'auth.email.verification.sent',
      new EmailVerificationSentEvent(user.id, user.email, token),
    );
  }
}
