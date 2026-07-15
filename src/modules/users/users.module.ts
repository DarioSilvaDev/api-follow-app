import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { USER_REPOSITORY } from './tokens';
import { CreateUserHandler } from './commands/create-user/create-user.handler';
import { UpdateUserHandler } from './commands/update-user/update-user.handler';
import { DeleteUserHandler } from './commands/delete-user/delete-user.handler';
import { GetUserHandler } from './queries/get-user/get-user.handler';
import { ListUsersHandler } from './queries/list-users/list-users.handler';
import { SearchUsersHandler } from './queries/search-users/search-users.handler';
import { SendWelcomeEmailListener } from './listeners/send-welcome-email.listener';
import { CreateDefaultSettingsListener } from './listeners/create-default-settings.listener';

@Module({
  controllers: [UsersController],
  providers: [
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,
    GetUserHandler,
    ListUsersHandler,
    SearchUsersHandler,
    SendWelcomeEmailListener,
    CreateDefaultSettingsListener,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
