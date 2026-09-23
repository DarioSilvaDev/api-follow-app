import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './controllers/users.controller';
import { UserWizardController } from './controllers/user-wizard.controller';
import { AuthorizationModule } from '../../common/authorization.module';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { USER_REPOSITORY } from './tokens';
import { CreateUserHandler } from './commands/create-user/create-user.handler';
import { UpdateUserHandler } from './commands/update-user/update-user.handler';
import { DeleteUserHandler } from './commands/delete-user/delete-user.handler';
import { GetUserHandler } from './queries/get-user/get-user.handler';
import { ListUsersHandler } from './queries/list-users/list-users.handler';
import { SearchUsersHandler } from './queries/search-users/search-users.handler';
import { GetMyAliasHandler } from './queries/get-my-alias/get-my-alias.handler';
import { UpdateMyAliasHandler } from './commands/update-my-alias/update-my-alias.handler';
import { SendWelcomeEmailListener } from './listeners/send-welcome-email.listener';
import { CreateDefaultSettingsListener } from './listeners/create-default-settings.listener';
import { UserWizardValidationHandler } from './queries/wizard-validation/wizard-validation.handler';
import { UserWizardClaimHandler } from './commands/wizard-claim/wizard-claim.handler';
import { UserInvitationEmailListener } from './listeners/user-invitation-email.listener';
import { UserRoleAssignedEmailListener } from './listeners/user-role-assigned-email.listener';
import { envs } from '../../config/envs';

@Module({
  imports: [
    AuthorizationModule,
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: parseInt(envs.JWT_ACCESS_EXPIRES_IN) },
    }),
  ],
  controllers: [UsersController, UserWizardController],
  providers: [
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,
    GetUserHandler,
    ListUsersHandler,
    SearchUsersHandler,
    GetMyAliasHandler,
    UpdateMyAliasHandler,
    SendWelcomeEmailListener,
    CreateDefaultSettingsListener,
    UserWizardValidationHandler,
    UserWizardClaimHandler,
    UserInvitationEmailListener,
    UserRoleAssignedEmailListener,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
