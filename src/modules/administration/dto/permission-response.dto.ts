export class PermissionResponseDto {
  id!: string;
  module!: string;
  resource!: string;
  action!: string;
  code!: string;
  description!: string | null;

  static from(permission: any): PermissionResponseDto {
    return {
      id: permission.id,
      module: permission.module,
      resource: permission.resource,
      action: permission.action,
      code: permission.code,
      description: permission.description,
    };
  }
}
