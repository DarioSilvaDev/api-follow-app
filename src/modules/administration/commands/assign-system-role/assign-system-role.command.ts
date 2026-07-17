import { BaseCommand } from '../../../../common/commands/base.command';
import { SystemRoleType } from '@prisma/client';

export class AssignSystemRoleCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly roleType: SystemRoleType,
  ) {
    super();
  }
}
