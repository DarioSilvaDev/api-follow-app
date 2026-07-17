import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { PasswordResetRequestedEvent } from '../events/password-reset-requested.event';

@Injectable()
export class SendPasswordResetEmailListener {
  constructor(private readonly mailService: MailService) {}

  @OnEvent('auth.password_reset.requested')
  async handle(event: PasswordResetRequestedEvent) {
    await this.mailService.sendPasswordResetEmail(event.email, event.token);
  }
}
