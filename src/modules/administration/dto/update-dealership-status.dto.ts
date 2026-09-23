import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * P2/P3: habilitar/deshabilitar una concesionaria
 * (PATCH /admin/dealerships/:id/status).
 *
 * `reason` es opcional: viaja solo en el evento de auditoría
 * `admin.dealership.status_changed` (el frontend no lo envía).
 */
export class UpdateDealershipStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
