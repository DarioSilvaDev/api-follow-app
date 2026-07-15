import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { UserUpdatedEvent } from '../../events/user-updated.event';
import { USER_REPOSITORY } from '../../tokens';
import type { UserRepository } from '../../repositories/user.repository';
import { UpdateUserCommand } from './update-user.command';

@Injectable()
export class UpdateUserHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: UpdateUserCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) {
      throw new NotFoundException('User', command.id);
    }

    const user = await this.repository.update(command.id, command.dto);

    this.eventEmitter.emit('user.updated', new UserUpdatedEvent(user.id));

    return user;
  }
}
