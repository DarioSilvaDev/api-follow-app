import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class SendWelcomeEmailListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent) {
    const { email } = event;
    // TODO: Integrar con infraestructura de mail
    console.log(`[send-welcome-email] Welcome email sent to ${email}`);
  }
}
