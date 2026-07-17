import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../common/mail/mail.service';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class SendWelcomeEmailListener {
  constructor(private readonly mailService: MailService) {}

  @OnEvent('user.created')
  async handle(event: UserCreatedEvent) {
    const { email } = event;
    await this.mailService.sendWelcomeEmail(email, email);
  }
}
