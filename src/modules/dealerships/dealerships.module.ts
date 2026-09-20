import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DealershipsController } from './controllers/dealerships.controller';
import { WizardController } from './controllers/wizard.controller';
import { AuthorizationModule } from '../../common/authorization.module';
import { DEALERSHIP_REPOSITORY } from './tokens';
import { PrismaDealershipRepository } from './repositories/prisma-dealership.repository';
import { CreateDealershipHandler } from './commands/create-dealership/create-dealership.handler';
import { UpdateDealershipHandler } from './commands/update-dealership/update-dealership.handler';
import { InviteMemberHandler } from './commands/invite-member/invite-member.handler';
import { AcceptInvitationHandler } from './commands/accept-invitation/accept-invitation.handler';
import { UpdateMemberRoleHandler } from './commands/update-member-role/update-member-role.handler';
import { RemoveMemberHandler } from './commands/remove-member/remove-member.handler';
import { CreateRoleHandler } from './commands/create-role/create-role.handler';
import { UpdateRoleHandler } from './commands/update-role/update-role.handler';
import { DeleteRoleHandler } from './commands/delete-role/delete-role.handler';
import { GetDealershipHandler } from './queries/get-dealership/get-dealership.handler';
import { ListDealershipsHandler } from './queries/list-dealerships/list-dealerships.handler';
import { GetMembersHandler } from './queries/get-members/get-members.handler';
import { GetInvitationsHandler } from './queries/get-invitations/get-invitations.handler';
import { ListRolesHandler } from './queries/list-roles/list-roles.handler';
import { GetDealershipVehiclesHandler } from './queries/get-dealership-vehicles/get-dealership-vehicles.handler';
import { WizardValidationHandler } from './queries/wizard-validation/wizard-validation.handler';
import { WizardClaimHandler } from './commands/wizard-claim/wizard-claim.handler';
import { DealershipInvitationEmailListener } from './listeners/dealership-invitation-email.listener';
import { DealershipClaimedEmailListener } from './listeners/dealership-claimed-email.listener';
import { envs } from '../../config/envs';

@Module({
  imports: [
    AuthorizationModule,
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: parseInt(envs.JWT_ACCESS_EXPIRES_IN) },
    }),
  ],
  controllers: [DealershipsController, WizardController],
  providers: [
    CreateDealershipHandler,
    UpdateDealershipHandler,
    InviteMemberHandler,
    AcceptInvitationHandler,
    UpdateMemberRoleHandler,
    RemoveMemberHandler,
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    GetDealershipHandler,
    ListDealershipsHandler,
    GetMembersHandler,
    GetInvitationsHandler,
    ListRolesHandler,
    GetDealershipVehiclesHandler,
    WizardValidationHandler,
    WizardClaimHandler,
    DealershipInvitationEmailListener,
    DealershipClaimedEmailListener,
    { provide: DEALERSHIP_REPOSITORY, useClass: PrismaDealershipRepository },
  ],
  exports: [DEALERSHIP_REPOSITORY],
})
export class DealershipsModule {}