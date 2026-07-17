import { Module } from '@nestjs/common';
import { PermissionCache } from './cache/permission-cache';
import { PermissionsGuard } from './guards/permissions.guard';
import { WorkshopGuard } from './guards/workshop.guard';

@Module({
  providers: [PermissionCache, PermissionsGuard, WorkshopGuard],
  exports: [PermissionCache, PermissionsGuard, WorkshopGuard],
})
export class AuthorizationModule {}
