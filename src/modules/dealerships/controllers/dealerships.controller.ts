import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { DealershipGuard } from '../../../common/guards/dealership.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CreateDealershipDto } from '../dto/create-dealership.dto';
import { UpdateDealershipDto } from '../dto/update-dealership.dto';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { DealershipResponseDto } from '../dto/dealership-response.dto';
import { MemberResponseDto } from '../dto/member-response.dto';
import { InvitationResponseDto } from '../dto/invitation-response.dto';
import { CreateDealershipCommand } from '../commands/create-dealership/create-dealership.command';
import { CreateDealershipHandler } from '../commands/create-dealership/create-dealership.handler';
import { UpdateDealershipCommand } from '../commands/update-dealership/update-dealership.command';
import { UpdateDealershipHandler } from '../commands/update-dealership/update-dealership.handler';
import { InviteMemberCommand } from '../commands/invite-member/invite-member.command';
import { InviteMemberHandler } from '../commands/invite-member/invite-member.handler';
import { AcceptInvitationCommand } from '../commands/accept-invitation/accept-invitation.command';
import { AcceptInvitationHandler } from '../commands/accept-invitation/accept-invitation.handler';
import { UpdateMemberRoleCommand } from '../commands/update-member-role/update-member-role.command';
import { UpdateMemberRoleHandler } from '../commands/update-member-role/update-member-role.handler';
import { RemoveMemberCommand } from '../commands/remove-member/remove-member.command';
import { RemoveMemberHandler } from '../commands/remove-member/remove-member.handler';
import { CreateRoleCommand } from '../commands/create-role/create-role.command';
import { CreateRoleHandler } from '../commands/create-role/create-role.handler';
import { UpdateRoleCommand } from '../commands/update-role/update-role.command';
import { UpdateRoleHandler } from '../commands/update-role/update-role.handler';
import { DeleteRoleCommand } from '../commands/delete-role/delete-role.command';
import { DeleteRoleHandler } from '../commands/delete-role/delete-role.handler';
import { GetDealershipHandler } from '../queries/get-dealership/get-dealership.handler';
import { ListDealershipsHandler } from '../queries/list-dealerships/list-dealerships.handler';
import { GetMembersHandler } from '../queries/get-members/get-members.handler';
import { GetInvitationsHandler } from '../queries/get-invitations/get-invitations.handler';
import { ListRolesHandler } from '../queries/list-roles/list-roles.handler';
import { GetDealershipVehiclesHandler } from '../queries/get-dealership-vehicles/get-dealership-vehicles.handler';

/**
 * DealershipsController — Gestión de concesionarias (módulo Dealership).
 *
 * Requisito: Fase 1a consignación (D-103 alta rápida, D-TL-12 contexto).
 * Espejo del patrón de WorkshopsController con fuerza de contexto activo
 * DEALERSHIP (ContextGuard a nivel de clase).
 */
@Controller('dealerships')
@UseGuards(JwtAuthGuard, ContextGuard)
export class DealershipsController {
  constructor(
    private readonly createDealershipHandler: CreateDealershipHandler,
    private readonly updateDealershipHandler: UpdateDealershipHandler,
    private readonly inviteMemberHandler: InviteMemberHandler,
    private readonly acceptInvitationHandler: AcceptInvitationHandler,
    private readonly updateMemberRoleHandler: UpdateMemberRoleHandler,
    private readonly removeMemberHandler: RemoveMemberHandler,
    private readonly createRoleHandler: CreateRoleHandler,
    private readonly updateRoleHandler: UpdateRoleHandler,
    private readonly deleteRoleHandler: DeleteRoleHandler,
    private readonly getDealershipHandler: GetDealershipHandler,
    private readonly listDealershipsHandler: ListDealershipsHandler,
    private readonly getMembersHandler: GetMembersHandler,
    private readonly getInvitationsHandler: GetInvitationsHandler,
    private readonly listRolesHandler: ListRolesHandler,
    private readonly getDealershipVehiclesHandler: GetDealershipVehiclesHandler,
  ) {}

  /**
   * Alta rápida de concesionaria (D-103): cualquier usuario autenticado crea
   * una concesionaria y queda como owner. NO usa PermissionsGuard:
   * `dealership.create` es un permiso de plataforma reservado al alta vía
   * administración (ver seed, matriz RB-10).
   */
  @Post()
  async create(
    @Body() dto: CreateDealershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dealership = await this.createDealershipHandler.execute(
      new CreateDealershipCommand(dto, user.id),
    );
    return DealershipResponseDto.from(dealership);
  }

  /**
   * Concesionarias del usuario (membresías activas). GET antes de GET ':id'
   * para evitar que 'mine' sea capturado como id (patrón F-012).
   */
  @Get('mine')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.listDealershipsHandler.execute({ userId: user.id });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dealership = await this.getDealershipHandler.execute(id, user.id);
    return DealershipResponseDto.from(dealership);
  }

  @Patch(':id')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.update')
  async update(@Param('id') id: string, @Body() dto: UpdateDealershipDto) {
    const dealership = await this.updateDealershipHandler.execute(
      new UpdateDealershipCommand(id, dto),
    );
    return DealershipResponseDto.from(dealership);
  }

  @Post(':id/invitations')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.members.invite')
  async invite(
    @Param('id') dealershipId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const invitation = await this.inviteMemberHandler.execute(
      new InviteMemberCommand(dealershipId, dto, user.id),
    );
    return InvitationResponseDto.from(invitation);
  }

  @Get(':id/invitations')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.members.invite')
  async getInvitations(@Param('id') dealershipId: string) {
    const invitations = await this.getInvitationsHandler.execute(dealershipId);
    return invitations.map(InvitationResponseDto.from);
  }

  @Get(':id/members')
  // FIX-H7 (PII, resolución PM §32 §2.2): solo owner/admin — el seller NO ve
  // emails de otros miembros. `dealership.members.invite` es el permiso que
  // distingue owner/admin (seed RB-10) sin crear códigos nuevos.
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.members.invite')
  async getMembers(@Param('id') dealershipId: string) {
    const members = await this.getMembersHandler.execute(dealershipId);
    return members.map(MemberResponseDto.from);
  }

  @Patch(':id/members/:memberId/role')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.members.role.update')
  async updateMemberRole(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const member = await this.updateMemberRoleHandler.execute(
      new UpdateMemberRoleCommand(memberId, dto.roleId, user.id),
    );
    return MemberResponseDto.from(member);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.members.remove')
  async removeMember(@Param('memberId') memberId: string) {
    await this.removeMemberHandler.execute(new RemoveMemberCommand(memberId));
  }

  @Get(':id/roles')
  @UseGuards(DealershipGuard)
  async listRoles(@Param('id') dealershipId: string) {
    return this.listRolesHandler.execute(dealershipId);
  }

  @Post(':id/roles')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.update')
  async createRole(
    @Param('id') dealershipId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.createRoleHandler.execute(
      new CreateRoleCommand(dealershipId, dto),
    );
  }

  @Patch(':id/roles/:roleId')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.update')
  async updateRole(
    @Param('id') dealershipId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.updateRoleHandler.execute(
      new UpdateRoleCommand(dealershipId, roleId, dto),
    );
  }

  @Delete(':id/roles/:roleId')
  @UseGuards(DealershipGuard, PermissionsGuard)
  @Permissions('dealership.update')
  async deleteRole(
    @Param('id') dealershipId: string,
    @Param('roleId') roleId: string,
  ) {
    await this.deleteRoleHandler.execute(
      new DeleteRoleCommand(dealershipId, roleId),
    );
  }

  /**
   * Vehículos en exhibición de la concesionaria (panel §8).
   */
  @Get(':id/vehicles')
  @UseGuards(DealershipGuard)
  async getVehicles(@Param('id') dealershipId: string) {
    return this.getDealershipVehiclesHandler.execute(dealershipId);
  }

  /**
   * Aceptación de invitación: usa la identidad del usuario autenticado
   * (verificado por JwtAuthGuard). Se declara ANTES de GET ':id' para
   * evitar que 'invitations/accept' sea capturado como id.
   */
  @Post('invitations/accept')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const member = await this.acceptInvitationHandler.execute(
      new AcceptInvitationCommand(dto.token, user.id, user.email),
    );
    return MemberResponseDto.from(member);
  }
}