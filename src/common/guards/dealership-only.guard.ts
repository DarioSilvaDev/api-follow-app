import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CurrentContext } from '../context/interfaces/current-context.interface';
import { PrismaService } from '../database/prisma.service';

/**
 * DealershipOnlyGuard — Ensures the active context is DEALERSHIP.
 *
 * Usado en operaciones de consignación que solo pueden ejecutarse en
 * representación de una concesionaria (venta/devolución de vehículos, RB-04).
 *
 * En contexto PERSONAL/WORKSHOP la operación se deniega por diseño (403
 * PERMISSION_DENIED), incluso para super_admin.
 *
 * P2: además verifica que la concesionaria esté activa (`isActive`) —
 * fail-closed si no existe (borrado lógico) o está deshabilitada.
 *
 * Debe ejecutarse ANTES de PermissionsGuard para que el bypass de super_admin
 * de PermissionsGuard no pueda eludir esta comprobación (patrón D-024
 * Amendment 2 / WorkshopOnlyGuard).
 *
 * @see D-TL-12 -- DealershipContext
 */
@Injectable()
export class DealershipOnlyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ctx: CurrentContext | undefined = request.context;

    if (!ctx || ctx.type !== 'DEALERSHIP') {
      throw new ForbiddenException(
        'This operation requires a DEALERSHIP context',
      );
    }

    // P2: la concesionaria desactivada no puede operar desde su contexto.
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: ctx.dealershipId },
      select: { isActive: true },
    });
    if (!dealership || !dealership.isActive) {
      throw new ForbiddenException('This dealership is inactive');
    }

    return true;
  }
}