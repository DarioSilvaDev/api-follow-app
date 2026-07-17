import { Module } from '@nestjs/common';
import { AdministrationController } from './controllers/administration.controller';
import { AssignSystemRoleHandler } from './commands/assign-system-role/assign-system-role.handler';
import { RevokeSystemRoleHandler } from './commands/revoke-system-role/revoke-system-role.handler';
import { ListUsersHandler } from './queries/list-users.handler';
import { ListSystemRolesHandler } from './queries/list-system-roles.handler';

@Module({
  controllers: [AdministrationController],
  providers: [
    AssignSystemRoleHandler,
    RevokeSystemRoleHandler,
    ListUsersHandler,
    ListSystemRolesHandler,
  ],
})
export class AdministrationModule {}
