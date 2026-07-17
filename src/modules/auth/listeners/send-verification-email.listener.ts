import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { EmailVerificationSentEvent } from '../events/email-verification-sent.event';

@Injectable()
export class SendVerificationEmailListener {
  constructor(private readonly mailService: MailService) {}

  @OnEvent('auth.email.verification.sent')
  async handle(event: EmailVerificationSentEvent) {
    await this.mailService.sendVerificationEmail(event.email, event.token);
  }
}
