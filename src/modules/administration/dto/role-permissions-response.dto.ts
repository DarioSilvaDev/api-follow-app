import { PermissionResponseDto } from './permission-response.dto';

export class RolePermissionsResponseDto {
  id!: string;
  type!: string;
  name!: string;
  description!: string | null;
  priority!: number;
  permissions!: PermissionResponseDto[];
  permissionIds!: string[];

  static from(role: any): RolePermissionsResponseDto {
    const permissions = (role.permissions ?? []).map((sp: any) =>
      PermissionResponseDto.from(sp.permission),
    );
    return {
      id: role.id,
      type: role.type,
      name: role.name,
      description: role.description,
      priority: role.priority,
      permissions,
      permissionIds: permissions.map((p: PermissionResponseDto) => p.id),
    };
  }
}
