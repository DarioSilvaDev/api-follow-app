import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { impersonationTokenCookieOptions } from '../../../config/cookies.config';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { AssignSystemRoleDto } from '../dto/assign-system-role.dto';
import { RevokeSystemRoleDto } from '../dto/revoke-system-role.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UpdateWorkshopStatusDto } from '../dto/update-workshop-status.dto';
import { SystemRoleResponseDto } from '../dto/system-role-response.dto';
import { UserAdminResponseDto } from '../dto/user-response.dto';
import { UserDetailAdminResponseDto } from '../dto/user-detail-response.dto';
import { WorkshopAdminResponseDto } from '../dto/workshop-response.dto';
import { WorkshopDetailAdminResponseDto } from '../dto/workshop-detail-response.dto';
import { WorkshopMemberAdminResponseDto } from '../dto/workshop-member-response.dto';
import { VehicleAdminResponseDto } from '../dto/vehicle-response.dto';
import { VehicleDetailAdminResponseDto } from '../dto/vehicle-detail-response.dto';
import { PermissionResponseDto } from '../dto/permission-response.dto';
import { RolePermissionsResponseDto } from '../dto/role-permissions-response.dto';
import { UpdateRolePermissionsDto } from '../dto/update-role-permissions.dto';
import { CreateWorkshopDto } from '../dto/create-workshop.dto';
import { UpdateWorkshopDto } from '../dto/update-workshop.dto';
import { AddMemberDto } from '../dto/add-member.dto';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';
import { SetBusinessHoursDto } from '../dto/set-business-hours.dto';
import { CreateSpecialtyDto } from '../dto/create-specialty.dto';
import { UpdateSpecialtyDto } from '../dto/update-specialty.dto';
import { AssignSystemRoleCommand } from '../commands/assign-system-role/assign-system-role.command';
import { AssignSystemRoleHandler } from '../commands/assign-system-role/assign-system-role.handler';
import { RevokeSystemRoleCommand } from '../commands/revoke-system-role/revoke-system-role.command';
import { RevokeSystemRoleHandler } from '../commands/revoke-system-role/revoke-system-role.handler';
import { UpdateUserStatusCommand } from '../commands/update-user-status/update-user-status.command';
import { UpdateUserStatusHandler } from '../commands/update-user-status/update-user-status.handler';
import { DeleteUserCommand } from '../commands/delete-user/delete-user.command';
import { DeleteUserHandler } from '../commands/delete-user/delete-user.handler';
import { UpdateWorkshopStatusCommand } from '../commands/update-workshop-status/update-workshop-status.command';
import { UpdateWorkshopStatusHandler } from '../commands/update-workshop-status/update-workshop-status.handler';
import { UpdateRolePermissionsCommand } from '../commands/update-role-permissions/update-role-permissions.command';
import { UpdateRolePermissionsHandler } from '../commands/update-role-permissions/update-role-permissions.handler';
import { ListUsersHandler } from '../queries/list-users.handler';
import { ListWorkshopsHandler } from '../queries/list-workshops.handler';
import { ListVehiclesHandler } from '../queries/list-vehicles.handler';
import { ListPermissionsHandler } from '../queries/list-permissions.handler';
import { GetRolePermissionsHandler } from '../queries/get-role-permissions.handler';
import { ListSystemRolesHandler } from '../queries/list-system-roles.handler';
import { GetUserHandler } from '../queries/get-user.handler';
import { GetWorkshopHandler } from '../queries/get-workshop.handler';
import { GetWorkshopMembersHandler } from '../queries/get-workshop-members.handler';
import { GetVehicleHandler } from '../queries/get-vehicle.handler';
import { CreateWorkshopCommand } from '../commands/create-workshop/create-workshop.command';
import { CreateWorkshopHandler } from '../commands/create-workshop/create-workshop.handler';
import { UpdateWorkshopCommand } from '../commands/update-workshop/update-workshop.command';
import { UpdateWorkshopHandler } from '../commands/update-workshop/update-workshop.handler';
import { DeleteWorkshopCommand } from '../commands/delete-workshop/delete-workshop.command';
import { DeleteWorkshopHandler } from '../commands/delete-workshop/delete-workshop.handler';
import { AddMemberCommand } from '../commands/add-member/add-member.command';
import { AddMemberHandler } from '../commands/add-member/add-member.handler';
import { UpdateMemberRoleCommand } from '../commands/update-member-role/update-member-role.command';
import { UpdateMemberRoleHandler } from '../commands/update-member-role/update-member-role.handler';
import { RemoveMemberCommand } from '../commands/remove-member/remove-member.command';
import { RemoveMemberHandler } from '../commands/remove-member/remove-member.handler';
import { CreateBranchCommand } from '../commands/create-branch/create-branch.command';
import { CreateBranchHandler } from '../commands/create-branch/create-branch.handler';
import { UpdateBranchCommand } from '../commands/update-branch/update-branch.command';
import { UpdateBranchHandler } from '../commands/update-branch/update-branch.handler';
import { DeleteBranchCommand } from '../commands/delete-branch/delete-branch.command';
import { DeleteBranchHandler } from '../commands/delete-branch/delete-branch.handler';
import { SetBusinessHoursCommand } from '../commands/set-business-hours/set-business-hours.command';
import { SetBusinessHoursHandler } from '../commands/set-business-hours/set-business-hours.handler';
import { CreateSpecialtyCommand } from '../commands/create-specialty/create-specialty.command';
import { CreateSpecialtyHandler } from '../commands/create-specialty/create-specialty.handler';
import { UpdateSpecialtyCommand } from '../commands/update-specialty/update-specialty.command';
import { UpdateSpecialtyHandler } from '../commands/update-specialty/update-specialty.handler';
import { DeleteSpecialtyCommand } from '../commands/delete-specialty/delete-specialty.command';
import { DeleteSpecialtyHandler } from '../commands/delete-specialty/delete-specialty.handler';
import { ListAdminSpecialtiesHandler } from '../queries/list-specialties/list-specialties.handler';
import { SpecialtyResponseDto } from '../../workshops/dto/specialty-response.dto';
import { ImpersonateHandler } from '../commands/impersonate/impersonate.handler';
import { ListRolesHandler } from '../../workshops/queries/list-roles/list-roles.handler';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdministrationController {
  constructor(
    private readonly assignSystemRoleHandler: AssignSystemRoleHandler,
    private readonly revokeSystemRoleHandler: RevokeSystemRoleHandler,
    private readonly updateUserStatusHandler: UpdateUserStatusHandler,
    private readonly deleteUserHandler: DeleteUserHandler,
    private readonly listUsersHandler: ListUsersHandler,
    private readonly listWorkshopsHandler: ListWorkshopsHandler,
    private readonly getWorkshopHandler: GetWorkshopHandler,
    private readonly getWorkshopMembersHandler: GetWorkshopMembersHandler,
    private readonly listWorkshopRolesHandler: ListRolesHandler,
    private readonly updateWorkshopStatusHandler: UpdateWorkshopStatusHandler,
    private readonly listVehiclesHandler: ListVehiclesHandler,
    private readonly getVehicleHandler: GetVehicleHandler,
    private readonly listPermissionsHandler: ListPermissionsHandler,
    private readonly getRolePermissionsHandler: GetRolePermissionsHandler,
    private readonly updateRolePermissionsHandler: UpdateRolePermissionsHandler,
    private readonly listSystemRolesHandler: ListSystemRolesHandler,
    private readonly getUserHandler: GetUserHandler,
    private readonly createWorkshopHandler: CreateWorkshopHandler,
    private readonly updateWorkshopHandler: UpdateWorkshopHandler,
    private readonly deleteWorkshopHandler: DeleteWorkshopHandler,
    private readonly addMemberHandler: AddMemberHandler,
    private readonly updateMemberRoleHandler: UpdateMemberRoleHandler,
    private readonly removeMemberHandler: RemoveMemberHandler,
    private readonly createBranchHandler: CreateBranchHandler,
    private readonly updateBranchHandler: UpdateBranchHandler,
    private readonly deleteBranchHandler: DeleteBranchHandler,
    private readonly setBusinessHoursHandler: SetBusinessHoursHandler,
    private readonly createSpecialtyHandler: CreateSpecialtyHandler,
    private readonly updateSpecialtyHandler: UpdateSpecialtyHandler,
    private readonly deleteSpecialtyHandler: DeleteSpecialtyHandler,
    private readonly listAdminSpecialtiesHandler: ListAdminSpecialtiesHandler,
    private readonly impersonateHandler: ImpersonateHandler,
  ) {}

  @Post('roles/assign')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.assign')
  async assignRole(
    @Body() dto: AssignSystemRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.assignSystemRoleHandler.execute(
      new AssignSystemRoleCommand(dto.userId, dto.roleId),
      currentUser,
    );
  }

  @Delete('roles/revoke')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.revoke')
  async revokeRole(
    @Body() dto: RevokeSystemRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.revokeSystemRoleHandler.execute(
      new RevokeSystemRoleCommand(dto.userId, dto.roleId),
      currentUser,
    );
  }

  @Get('users')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.list')
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.listUsersHandler.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      data: result.data.map((u) => UserAdminResponseDto.from(u)),
      meta: result.meta,
    };
  }

  @Get('users/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.read')
  async getUser(@Param('id') id: string) {
    const user = await this.getUserHandler.execute(id);
    return UserDetailAdminResponseDto.from(user);
  }

  @Patch('users/:id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.manage')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.updateUserStatusHandler.execute(
      new UpdateUserStatusCommand(id, dto.status),
      currentUser,
    );
  }

  @Delete('users/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.delete')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.deleteUserHandler.execute(
      new DeleteUserCommand(id),
      currentUser,
    );
  }

  @Post('workshops')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.create')
  async createWorkshop(@Body() dto: CreateWorkshopDto) {
    return this.createWorkshopHandler.execute(new CreateWorkshopCommand(dto));
  }

  @Get('workshops')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.list')
  async listWorkshops(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.listWorkshopsHandler.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      data: result.data.map((w) => WorkshopAdminResponseDto.from(w)),
      meta: result.meta,
    };
  }

  @Get('workshops/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.read')
  async getWorkshop(@Param('id') id: string) {
    const workshop = await this.getWorkshopHandler.execute(id);
    return WorkshopDetailAdminResponseDto.from(workshop);
  }

  @Patch('workshops/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.update')
  async updateWorkshop(
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopDto,
  ) {
    return this.updateWorkshopHandler.execute(
      new UpdateWorkshopCommand(id, dto),
    );
  }

  @Delete('workshops/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.delete')
  async deleteWorkshop(@Param('id') id: string) {
    await this.deleteWorkshopHandler.execute(new DeleteWorkshopCommand(id));
  }

  @Patch('workshops/:id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.manage')
  async updateWorkshopStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopStatusDto,
  ) {
    await this.updateWorkshopStatusHandler.execute(
      new UpdateWorkshopStatusCommand(id, dto.isActive),
    );
  }

  @Get('workshops/:id/members')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.members')
  async getWorkshopMembers(@Param('id') id: string) {
    const members = await this.getWorkshopMembersHandler.execute(id);
    return members.map((m) => WorkshopMemberAdminResponseDto.from(m));
  }

  @Get('workshops/:id/roles')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.roles')
  async listWorkshopRoles(@Param('id') workshopId: string) {
    return this.listWorkshopRolesHandler.execute(workshopId);
  }

  @Post('workshops/:id/members')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.members')
  async addMember(
    @Param('id') workshopId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.addMemberHandler.execute(
      new AddMemberCommand(workshopId, dto, currentUser.id),
    );
  }

  @Patch('workshops/:id/members/:memberId/role')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.members')
  async updateMemberRole(
    @Param('memberId') memberId: string,
    @Body('roleId') roleId: string,
  ) {
    return this.updateMemberRoleHandler.execute(
      new UpdateMemberRoleCommand(memberId, roleId),
    );
  }

  @Delete('workshops/:id/members/:memberId')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.members')
  async removeMember(@Param('memberId') memberId: string) {
    await this.removeMemberHandler.execute(new RemoveMemberCommand(memberId));
  }

  @Post('workshops/:id/branches')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.branches')
  async createBranch(
    @Param('id') workshopId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.createBranchHandler.execute(
      new CreateBranchCommand(workshopId, dto),
    );
  }

  @Patch('workshops/:id/branches/:branchId')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.branches')
  async updateBranch(
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.updateBranchHandler.execute(
      new UpdateBranchCommand(branchId, dto),
    );
  }

  @Delete('workshops/:id/branches/:branchId')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.branches')
  async deleteBranch(@Param('branchId') branchId: string) {
    await this.deleteBranchHandler.execute(new DeleteBranchCommand(branchId));
  }

  @Post('workshops/:id/branches/:branchId/hours')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.workshops.branches')
  async setBusinessHours(
    @Param('branchId') branchId: string,
    @Body() dto: SetBusinessHoursDto,
  ) {
    return this.setBusinessHoursHandler.execute(
      new SetBusinessHoursCommand(branchId, dto),
    );
  }

  @Get('specialties')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.specialties.list')
  async listSpecialties() {
    const specialties = await this.listAdminSpecialtiesHandler.execute();
    return specialties.map(SpecialtyResponseDto.from);
  }

  @Post('specialties')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.specialties.create')
  async createSpecialty(@Body() dto: CreateSpecialtyDto) {
    const specialty = await this.createSpecialtyHandler.execute(
      new CreateSpecialtyCommand(dto),
    );
    return SpecialtyResponseDto.from(specialty);
  }

  @Patch('specialties/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.specialties.update')
  async updateSpecialty(
    @Param('id') id: string,
    @Body() dto: UpdateSpecialtyDto,
  ) {
    const specialty = await this.updateSpecialtyHandler.execute(
      new UpdateSpecialtyCommand(id, dto),
    );
    return SpecialtyResponseDto.from(specialty);
  }

  @Delete('specialties/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.specialties.delete')
  async deleteSpecialty(@Param('id') id: string) {
    await this.deleteSpecialtyHandler.execute(new DeleteSpecialtyCommand(id));
  }

  @Get('vehicles')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicles.list')
  async listVehicles() {
    const vehicles = await this.listVehiclesHandler.execute();
    return vehicles.map((v) => VehicleAdminResponseDto.from(v));
  }

  @Get('vehicles/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicles.read')
  async getVehicle(@Param('id') id: string) {
    const vehicle = await this.getVehicleHandler.execute(id);
    return VehicleDetailAdminResponseDto.from(vehicle);
  }

  @Get('permissions')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.permissions.list')
  async listPermissions() {
    const perms = await this.listPermissionsHandler.execute();
    return perms.map((p) => PermissionResponseDto.from(p));
  }

  @Get('roles')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.list')
  async listRoles() {
    const roles = await this.listSystemRolesHandler.execute();
    return roles.map((r) => SystemRoleResponseDto.from(r));
  }

  @Get('roles/:id/permissions')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.permissions.list')
  async getRolePermissions(@Param('id') id: string) {
    const role = await this.getRolePermissionsHandler.execute(id);
    return RolePermissionsResponseDto.from(role);
  }

  @Put('roles/:id/permissions')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.permissions.manage')
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    await this.updateRolePermissionsHandler.execute(
      new UpdateRolePermissionsCommand(id, dto.permissionIds),
    );
  }

  @Post('users/:id/impersonate')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.manage')
  async impersonate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const adminToken = req.cookies?.access_token;
    if (!adminToken) {
      throw new (await import('@nestjs/common')).ForbiddenException(
        'No admin token found',
      );
    }

    const result = await this.impersonateHandler.execute(
      id,
      currentUser.id,
      adminToken,
    );

    res.cookie(
      'access_token',
      result.impersonatedToken,
      impersonationTokenCookieOptions,
    );

    return { user: result.user };
  }
}
