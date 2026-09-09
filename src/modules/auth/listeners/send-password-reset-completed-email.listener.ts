import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { PasswordResetCompletedEvent } from '../events/password-reset-completed.event';

@Injectable()
export class SendPasswordResetCompletedEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('auth.password_reset.completed')
  async handle(event: PasswordResetCompletedEvent) {
    const user = await this.prisma.user.findUnique({
      where: { id: event.userId },
    });
    if (user) {
      await this.mailService.sendPasswordResetCompletedEmail(user.email);
    }
  }
}
