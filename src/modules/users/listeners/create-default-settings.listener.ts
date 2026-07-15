import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../events/user-created.event';

@Injectable()
export class CreateDefaultSettingsListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent) {
    const { userId } = event;
    // TODO: Crear configuraciones por defecto del usuario
    console.log(
      `[create-default-settings] Default settings created for user ${userId}`,
    );
  }
}
