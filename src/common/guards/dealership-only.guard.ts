import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * DealershipOnlyGuard — Ensures the active context is DEALERSHIP.
 *
 * Usado en operaciones de consignación que solo pueden ejecutarse en
 * representación de una concesionaria (venta/devolución de vehículos, RB-04).
 *
 * En contexto PERSONAL/WORKSHOP la operación se deniega por diseño (403
 * PERMISSION_DENIED), incluso para super_admin.
 *
 * Debe ejecutarse ANTES de PermissionsGuard para que el bypass de super_admin
 * de PermissionsGuard no pueda eludir esta comprobación (patrón D-024
 * Amendment 2 / WorkshopOnlyGuard).
 *
 * @see D-TL-12 -- DealershipContext
 */
@Injectable()
export class DealershipOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ctx: CurrentContext | undefined = request.context;

    if (!ctx || ctx.type !== 'DEALERSHIP') {
      throw new ForbiddenException(
        'This operation requires a DEALERSHIP context',
      );
    }

    return true;
  }
}