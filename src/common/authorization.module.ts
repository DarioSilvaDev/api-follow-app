import { Module } from '@nestjs/common';
import { PermissionCache } from './cache/permission-cache';
import { PermissionsGuard } from './guards/permissions.guard';
import { WorkshopGuard } from './guards/workshop.guard';
import { WorkshopOnlyGuard } from './guards/workshop-only.guard';
import { DealershipGuard } from './guards/dealership.guard';
import { DealershipOnlyGuard } from './guards/dealership-only.guard';
import { ContextModule } from './context/context.module';
import { VehicleAccessService } from './authorization/vehicle-access.service';

/**
 * AuthorizationModule — Proporciona infraestructura de autorización.
 *
 * Exporta:
 * - PermissionCache: caché de permisos resueltos
 * - PermissionsGuard: evalúa permisos del contexto activo (WORKSHOP / DEALERSHIP)
 * - WorkshopGuard: verifica membresía activa del taller
 * - WorkshopOnlyGuard: exige contexto WORKSHOP (D-024 Amendment 2)
 * - DealershipGuard: verifica membresía activa de la concesionaria (D-TL-12)
 * - DealershipOnlyGuard: exige contexto DEALERSHIP (D-TL-12)
 * - ContextModule: resolución de contexto activo (ContextGuard, ContextResolver)
 * - VehicleAccessService: validación reutilizable de acceso a un vehículo (D-024)
 *
 * @see ADR-003 -- Authorization & Permission Engine
 */
@Module({
  imports: [ContextModule],
  providers: [
    PermissionCache,
    PermissionsGuard,
    WorkshopGuard,
    WorkshopOnlyGuard,
    DealershipGuard,
    DealershipOnlyGuard,
    VehicleAccessService,
  ],
  exports: [
    PermissionCache,
    PermissionsGuard,
    WorkshopGuard,
    WorkshopOnlyGuard,
    DealershipGuard,
    DealershipOnlyGuard,
    ContextModule,
    VehicleAccessService,
  ],
})
export class AuthorizationModule {}
