import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { UserCreatedEvent } from '../../events/user-created.event';
import { USER_REPOSITORY } from '../../tokens';
import type { UserRepository } from '../../repositories/user.repository';
import { CreateUserCommand } from './create-user.command';

@Injectable()
export class CreateUserHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateUserCommand) {
    const { password, ...rest } = command.dto;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.repository.create({ ...rest, passwordHash });

    this.eventEmitter.emit(
      'user.created',
      new UserCreatedEvent(user.id, user.email),
    );

    return user;
  }
}
