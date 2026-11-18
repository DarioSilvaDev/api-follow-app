import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class CreateDefaultSettingsListener {
  private readonly logger = new Logger(CreateDefaultSettingsListener.name);

  @OnEvent('user.created')
  async handle(event: UserCreatedEvent) {
    const { userId } = event;
    // TODO: Crear configuraciones por defecto del usuario
    this.logger.debug(`Default settings created for userId=${userId}`);
  }
}
