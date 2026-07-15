import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PasswordResetRequestedEvent } from '../events/password-reset-requested.event';

@Injectable()
export class SendPasswordResetEmailListener {
  @OnEvent('auth.password_reset.requested')
  async handle(event: PasswordResetRequestedEvent) {
    // TODO: Integrar con infraestructura de mail
    console.log(
      `[send-password-reset-email] Reset link sent to ${event.email} with token ${event.token}`,
    );
  }
}
