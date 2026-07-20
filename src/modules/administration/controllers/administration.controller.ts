import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AssignSystemRoleDto } from '../dto/assign-system-role.dto';
import { RevokeSystemRoleDto } from '../dto/revoke-system-role.dto';
import { SystemRoleResponseDto } from '../dto/system-role-response.dto';
import { UserAdminResponseDto } from '../dto/user-response.dto';
import { AssignSystemRoleCommand } from '../commands/assign-system-role/assign-system-role.command';
import { AssignSystemRoleHandler } from '../commands/assign-system-role/assign-system-role.handler';
import { RevokeSystemRoleCommand } from '../commands/revoke-system-role/revoke-system-role.command';
import { RevokeSystemRoleHandler } from '../commands/revoke-system-role/revoke-system-role.handler';
import { ListUsersHandler } from '../queries/list-users.handler';
import { ListSystemRolesHandler } from '../queries/list-system-roles.handler';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdministrationController {
  constructor(
    private readonly assignSystemRoleHandler: AssignSystemRoleHandler,
    private readonly revokeSystemRoleHandler: RevokeSystemRoleHandler,
    private readonly listUsersHandler: ListUsersHandler,
    private readonly listSystemRolesHandler: ListSystemRolesHandler,
  ) {}

  @Post('roles/assign')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.assign')
  async assignRole(@Body() dto: AssignSystemRoleDto) {
    await this.assignSystemRoleHandler.execute(
      new AssignSystemRoleCommand(dto.userId, dto.roleType),
    );
  }

  @Delete('roles/revoke')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.revoke')
  async revokeRole(@Body() dto: RevokeSystemRoleDto) {
    await this.revokeSystemRoleHandler.execute(
      new RevokeSystemRoleCommand(dto.userId, dto.roleType),
    );
  }

  @Get('users')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.users.list')
  async listUsers() {
    const users = await this.listUsersHandler.execute();
    return users.map((u) => UserAdminResponseDto.from(u));
  }

  @Get('roles')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.roles.list')
  async listRoles() {
    const roles = await this.listSystemRolesHandler.execute();
    return roles.map((r) => SystemRoleResponseDto.from(r));
  }
}
