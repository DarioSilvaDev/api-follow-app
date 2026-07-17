export class SystemRoleResponseDto {
  id!: string;
  type!: string;
  name!: string;
  description!: string | null;
  priority!: number;

  static from(role: any): SystemRoleResponseDto {
    return {
      id: role.id,
      type: role.type,
      name: role.name,
      description: role.description,
      priority: role.priority,
    };
  }
}
