import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { USER_REPOSITORY } from '../../tokens';
import type { UserRepository } from '../../repositories/user.repository';
import { DeleteUserCommand } from './delete-user.command';

@Injectable()
export class DeleteUserHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: UserRepository,
  ) {}

  async execute(command: DeleteUserCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) {
      throw new NotFoundException('User', command.id);
    }

    await this.repository.delete(command.id);
  }
}
