import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * D-106: invitación de usuario de plataforma desde el panel admin.
 * Solo roles asignables desde la sección Usuarios (admin | support). El rol
 * super_admin NO es asignable por invitación: se reserva al flow existente
 * de POST /admin/roles/assign (guard de super_admin en AssignSystemRoleHandler).
 */
export class InvitePlatformUserDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'support'])
  roleType!: 'admin' | 'support';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}