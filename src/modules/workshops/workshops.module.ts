import { Module } from '@nestjs/common';
import { WorkshopsController } from './controllers/workshops.controller';
import { PrismaWorkshopRepository } from './repositories/prisma-workshop.repository';
import { WORKSHOP_REPOSITORY } from './tokens';
import { CreateWorkshopHandler } from './commands/create-workshop/create-workshop.handler';
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

@Module({
  controllers: [WorkshopsController],
  providers: [
    CreateWorkshopHandler,
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
    { provide: WORKSHOP_REPOSITORY, useClass: PrismaWorkshopRepository },
  ],
  exports: [WORKSHOP_REPOSITORY],
})
export class WorkshopsModule {}
