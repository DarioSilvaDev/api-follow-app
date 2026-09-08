import { Module } from '@nestjs/common';
import { PermissionCache } from './cache/permission-cache';
import { PermissionsGuard } from './guards/permissions.guard';
import { WorkshopGuard } from './guards/workshop.guard';
import { ContextModule } from './context/context.module';
import { VehicleAccessService } from './authorization/vehicle-access.service';

/**
 * AuthorizationModule — Proporciona infraestructura de autorización.
 *
 * Exporta:
 * - PermissionCache: caché de permisos resueltos
 * - PermissionsGuard: evalúa permisos del contexto activo
 * - WorkshopGuard: verifica membresía activa del taller
 * - ContextModule: resolución de contexto activo (ContextGuard, ContextResolver)
 * - VehicleAccessService: validación reutilizable de acceso a un vehículo (D-024)
 *
 * @see ADR-003 -- Authorization & Permission Engine
 */
@Module({
  imports: [ContextModule],
  providers: [PermissionCache, PermissionsGuard, WorkshopGuard, VehicleAccessService],
  exports: [PermissionCache, PermissionsGuard, WorkshopGuard, ContextModule, VehicleAccessService],
})
export class AuthorizationModule {}
