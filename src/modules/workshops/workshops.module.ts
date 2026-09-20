import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WorkshopsController } from './controllers/workshops.controller';
import { PublicWorkshopController } from './controllers/public.controller';
import { WorkshopSearchController } from './controllers/search.controller';
import { WizardController } from './controllers/wizard.controller';
import { PrismaWorkshopRepository } from './repositories/prisma-workshop.repository';
import { WORKSHOP_REPOSITORY } from './tokens';
import { AuthorizationModule } from '../../common/authorization.module';
import { UpdateWorkshopHandler } from './commands/update-workshop/update-workshop.handler';
import { CreateBranchHandler } from './commands/create-branch/create-branch.handler';
import { InviteMemberHandler } from './commands/invite-member/invite-member.handler';
import { AcceptInvitationHandler } from './commands/accept-invitation/accept-invitation.handler';
import { UpdateMemberRoleHandler } from './commands/update-member-role/update-member-role.handler';
import { RemoveMemberHandler } from './commands/remove-member/remove-member.handler';
import { SetBusinessHoursHandler } from './commands/set-business-hours/set-business-hours.handler';
import { GetWorkshopHandler } from './queries/get-workshop/get-workshop.handler';
import { ListWorkshopsHandler } from './queries/list-workshops/list-workshops.handler';
import { GetMembersHandler } from './queries/get-members/get-members.handler';
import { GetInvitationsHandler } from './queries/get-invitations/get-invitations.handler';
import { AddSpecialtyHandler } from './commands/add-specialty/add-specialty.handler';
import { RemoveSpecialtyHandler } from './commands/remove-specialty/remove-specialty.handler';
import {
  ListWorkshopSpecialtiesHandler,
  ListPublicSpecialtiesHandler,
} from './queries/list-specialties/list-specialties.handler';
import { SearchWorkshopsHandler } from './queries/search-workshops/search-workshops.handler';
import { CreateRoleHandler } from './commands/create-role/create-role.handler';
import { UpdateRoleHandler } from './commands/update-role/update-role.handler';
import { DeleteRoleHandler } from './commands/delete-role/delete-role.handler';
import { ListRolesHandler } from './queries/list-roles/list-roles.handler';
import { WizardValidationHandler } from './queries/wizard-validation/wizard-validation.handler';
import { WizardClaimHandler } from './commands/wizard-claim/wizard-claim.handler';
import { WorkshopInvitationEmailListener } from './listeners/workshop-invitation-email.listener';
import { WorkshopClaimedEmailListener } from './listeners/workshop-claimed-email.listener';
import { envs } from '../../config/envs';

@Module({
  imports: [
    AuthorizationModule,
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: parseInt(envs.JWT_ACCESS_EXPIRES_IN) },
    }),
  ],
  // WorkshopSearchController ANTES de WorkshopsController: evita que
  // `GET /api/workshops/:id` capture `search` como id (F-012).
  // WizardController también ANTES de WorkshopsController: evita que
  // `GET /api/workshops/:id` capture `wizard` como id (D-106).
  controllers: [
    WorkshopSearchController,
    WizardController,
    WorkshopsController,
    PublicWorkshopController,
  ],
  providers: [
    UpdateWorkshopHandler,
    CreateBranchHandler,
    InviteMemberHandler,
    AcceptInvitationHandler,
    UpdateMemberRoleHandler,
    RemoveMemberHandler,
    SetBusinessHoursHandler,
    GetWorkshopHandler,
    ListWorkshopsHandler,
    GetMembersHandler,
    GetInvitationsHandler,
    AddSpecialtyHandler,
    RemoveSpecialtyHandler,
    ListWorkshopSpecialtiesHandler,
    ListPublicSpecialtiesHandler,
    SearchWorkshopsHandler,
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    ListRolesHandler,
    WizardValidationHandler,
    WizardClaimHandler,
    WorkshopInvitationEmailListener,
    WorkshopClaimedEmailListener,
    { provide: WORKSHOP_REPOSITORY, useClass: PrismaWorkshopRepository },
  ],
  exports: [WORKSHOP_REPOSITORY],
})
export class WorkshopsModule {}
