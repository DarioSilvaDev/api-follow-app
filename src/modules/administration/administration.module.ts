import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdministrationController } from './controllers/administration.controller';
import { AuthorizationModule } from '../../common/authorization.module';
import { WorkshopsModule } from '../workshops/workshops.module';
import { envs } from '../../config/envs';
import { AssignSystemRoleHandler } from './commands/assign-system-role/assign-system-role.handler';
import { RevokeSystemRoleHandler } from './commands/revoke-system-role/revoke-system-role.handler';
import { UpdateUserStatusHandler } from './commands/update-user-status/update-user-status.handler';
import { DeleteUserHandler } from './commands/delete-user/delete-user.handler';
import { UpdateWorkshopStatusHandler } from './commands/update-workshop-status/update-workshop-status.handler';
import { UpdateRolePermissionsHandler } from './commands/update-role-permissions/update-role-permissions.handler';
import { ImpersonateHandler } from './commands/impersonate/impersonate.handler';
import { ListUsersHandler } from './queries/list-users.handler';
import { ListWorkshopsHandler } from './queries/list-workshops.handler';
import { ListVehiclesHandler } from './queries/list-vehicles.handler';
import { ListPermissionsHandler } from './queries/list-permissions.handler';
import { GetRolePermissionsHandler } from './queries/get-role-permissions.handler';
import { ListSystemRolesHandler } from './queries/list-system-roles.handler';
import { GetUserHandler } from './queries/get-user.handler';
import { GetWorkshopHandler } from './queries/get-workshop.handler';
import { GetWorkshopMembersHandler } from './queries/get-workshop-members.handler';
import { GetVehicleHandler } from './queries/get-vehicle.handler';
import { CreateWorkshopHandler } from './commands/create-workshop/create-workshop.handler';
import { UpdateWorkshopHandler } from './commands/update-workshop/update-workshop.handler';
import { DeleteWorkshopHandler } from './commands/delete-workshop/delete-workshop.handler';
import { AddMemberHandler } from './commands/add-member/add-member.handler';
import { UpdateMemberRoleHandler } from './commands/update-member-role/update-member-role.handler';
import { RemoveMemberHandler } from './commands/remove-member/remove-member.handler';
import { CreateBranchHandler } from './commands/create-branch/create-branch.handler';
import { UpdateBranchHandler } from './commands/update-branch/update-branch.handler';
import { DeleteBranchHandler } from './commands/delete-branch/delete-branch.handler';
import { SetBusinessHoursHandler } from './commands/set-business-hours/set-business-hours.handler';
import { CreateSpecialtyHandler } from './commands/create-specialty/create-specialty.handler';
import { UpdateSpecialtyHandler } from './commands/update-specialty/update-specialty.handler';
import { DeleteSpecialtyHandler } from './commands/delete-specialty/delete-specialty.handler';
import { ListAdminSpecialtiesHandler } from './queries/list-specialties/list-specialties.handler';
import { ListRolesHandler } from '../workshops/queries/list-roles/list-roles.handler';

@Module({
  imports: [
    AuthorizationModule,
    WorkshopsModule,
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: parseInt(envs.JWT_ACCESS_EXPIRES_IN) },
    }),
  ],
  controllers: [AdministrationController],
  providers: [
    AssignSystemRoleHandler,
    RevokeSystemRoleHandler,
    UpdateUserStatusHandler,
    DeleteUserHandler,
    UpdateWorkshopStatusHandler,
    UpdateRolePermissionsHandler,
    ImpersonateHandler,
    ListUsersHandler,
    ListWorkshopsHandler,
    ListPermissionsHandler,
    GetRolePermissionsHandler,
    ListVehiclesHandler,
    GetVehicleHandler,
    GetWorkshopHandler,
    ListRolesHandler,
    GetWorkshopMembersHandler,
    ListSystemRolesHandler,
    GetUserHandler,
    CreateWorkshopHandler,
    UpdateWorkshopHandler,
    DeleteWorkshopHandler,
    AddMemberHandler,
    UpdateMemberRoleHandler,
    RemoveMemberHandler,
    CreateBranchHandler,
    UpdateBranchHandler,
    DeleteBranchHandler,
    SetBusinessHoursHandler,
    CreateSpecialtyHandler,
    UpdateSpecialtyHandler,
    DeleteSpecialtyHandler,
    ListAdminSpecialtiesHandler,
  ],
})
export class AdministrationModule {}
