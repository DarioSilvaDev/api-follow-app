import { BaseCommand } from '../../../../common/commands/base.command';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly status: UserStatus,
  ) {
    super();
  }
}
