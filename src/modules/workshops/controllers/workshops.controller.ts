import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { WorkshopGuard } from '../../../common/guards/workshop.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CreateWorkshopDto } from '../dto/create-workshop.dto';
import { UpdateWorkshopDto } from '../dto/update-workshop.dto';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { SetBusinessHoursDto } from '../dto/set-business-hours.dto';
import { WorkshopResponseDto } from '../dto/workshop-response.dto';
import { MemberResponseDto } from '../dto/member-response.dto';
import { InvitationResponseDto } from '../dto/invitation-response.dto';
import { CreateWorkshopCommand } from '../commands/create-workshop/create-workshop.command';
import { CreateWorkshopHandler } from '../commands/create-workshop/create-workshop.handler';
import { UpdateWorkshopCommand } from '../commands/update-workshop/update-workshop.command';
import { UpdateWorkshopHandler } from '../commands/update-workshop/update-workshop.handler';
import { CreateBranchCommand } from '../commands/create-branch/create-branch.command';
import { CreateBranchHandler } from '../commands/create-branch/create-branch.handler';
import { InviteMemberCommand } from '../commands/invite-member/invite-member.command';
import { InviteMemberHandler } from '../commands/invite-member/invite-member.handler';
import { AcceptInvitationCommand } from '../commands/accept-invitation/accept-invitation.command';
import { AcceptInvitationHandler } from '../commands/accept-invitation/accept-invitation.handler';
import { UpdateMemberRoleCommand } from '../commands/update-member-role/update-member-role.command';
import { UpdateMemberRoleHandler } from '../commands/update-member-role/update-member-role.handler';
import { RemoveMemberCommand } from '../commands/remove-member/remove-member.command';
import { RemoveMemberHandler } from '../commands/remove-member/remove-member.handler';
import { SetBusinessHoursCommand } from '../commands/set-business-hours/set-business-hours.command';
import { SetBusinessHoursHandler } from '../commands/set-business-hours/set-business-hours.handler';
import { GetWorkshopHandler } from '../queries/get-workshop/get-workshop.handler';
import { ListWorkshopsHandler } from '../queries/list-workshops/list-workshops.handler';
import { GetMembersHandler } from '../queries/get-members/get-members.handler';
import { GetInvitationsHandler } from '../queries/get-invitations/get-invitations.handler';

@Controller('workshops')
@UseGuards(JwtAuthGuard)
export class WorkshopsController {
  constructor(
    private readonly createWorkshopHandler: CreateWorkshopHandler,
    private readonly updateWorkshopHandler: UpdateWorkshopHandler,
    private readonly createBranchHandler: CreateBranchHandler,
    private readonly inviteMemberHandler: InviteMemberHandler,
    private readonly acceptInvitationHandler: AcceptInvitationHandler,
    private readonly updateMemberRoleHandler: UpdateMemberRoleHandler,
    private readonly removeMemberHandler: RemoveMemberHandler,
    private readonly setBusinessHoursHandler: SetBusinessHoursHandler,
    private readonly getWorkshopHandler: GetWorkshopHandler,
    private readonly listWorkshopsHandler: ListWorkshopsHandler,
    private readonly getMembersHandler: GetMembersHandler,
    private readonly getInvitationsHandler: GetInvitationsHandler,
  ) {}

  @Post()
  async create(@Body() dto: CreateWorkshopDto, @CurrentUser() user: AuthenticatedUser) {
    const workshop = await this.createWorkshopHandler.execute(
      new CreateWorkshopCommand(dto, user.id),
    );
    return WorkshopResponseDto.from(workshop);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.listWorkshopsHandler.execute({
      userId: user.id,
      page,
      limit,
    });
  }

  @Get(':id')
  @UseGuards(WorkshopGuard)
  async findOne(@Param('id') id: string) {
    const workshop = await this.getWorkshopHandler.execute(id);
    return WorkshopResponseDto.from(workshop);
  }

  @Patch(':id')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('workshop.update')
  async update(@Param('id') id: string, @Body() dto: UpdateWorkshopDto) {
    return this.updateWorkshopHandler.execute(
      new UpdateWorkshopCommand(id, dto),
    );
  }

  @Post(':id/branches')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('workshop.branch.create')
  async createBranch(
    @Param('id') workshopId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.createBranchHandler.execute(
      new CreateBranchCommand(workshopId, dto),
    );
  }

  @Post(':id/invitations')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('member.invite')
  async invite(
    @Param('id') workshopId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const invitation = await this.inviteMemberHandler.execute(
      new InviteMemberCommand(workshopId, dto, user.id),
    );
    return InvitationResponseDto.from(invitation);
  }

  @Get(':id/members')
  @UseGuards(WorkshopGuard)
  async getMembers(@Param('id') workshopId: string) {
    const members = await this.getMembersHandler.execute(workshopId);
    return members.map(MemberResponseDto.from);
  }

  @Get(':id/invitations')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('member.invite')
  async getInvitations(@Param('id') workshopId: string) {
    const invitations = await this.getInvitationsHandler.execute(workshopId);
    return invitations.map(InvitationResponseDto.from);
  }

  @Patch(':id/members/:memberId/role')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('member.role.update')
  async updateMemberRole(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.updateMemberRoleHandler.execute(
      new UpdateMemberRoleCommand(memberId, dto.roleId),
    );
  }

  @Delete(':id/members/:memberId')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('member.remove')
  async removeMember(@Param('memberId') memberId: string) {
    await this.removeMemberHandler.execute(new RemoveMemberCommand(memberId));
  }

  @Post(':id/branches/:branchId/hours')
  @UseGuards(WorkshopGuard, PermissionsGuard)
  @Permissions('workshop.hours.set')
  async setBusinessHours(
    @Param('branchId') branchId: string,
    @Body() dto: SetBusinessHoursDto,
  ) {
    return this.setBusinessHoursHandler.execute(
      new SetBusinessHoursCommand(branchId, dto),
    );
  }

  @Post('invitations/accept')
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @CurrentUser() user: AuthenticatedUser) {
    const member = await this.acceptInvitationHandler.execute(
      new AcceptInvitationCommand(dto.token, user.id),
    );
    return MemberResponseDto.from(member);
  }
}
