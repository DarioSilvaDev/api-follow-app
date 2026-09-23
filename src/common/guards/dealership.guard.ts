import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * DealershipGuard — Verifica que el usuario sea miembro activo de la
 * concesionaria (Fase 1a consignación, D-TL-12).
 *
 * Espejo de WorkshopGuard. Lee el dealershipId del contexto activo
 * (request.context, resuelto por ContextGuard desde X-Context-*).
 *
 * FIX-H2 (A2 §30 §2.6): el fallback a request.params.id se conserva SOLO para
 * las rutas del panel del módulo dealerships que todavía no envían
 * X-Context-Type/Id (frontend no modificado en esta iteración):
 *   PATCH :id · POST/GET :id/invitations · GET :id/members ·
 *   PATCH :id/members/:memberId/role · DELETE :id/members/:memberId ·
 *   POST/GET/PATCH/DELETE :id/roles · GET :id/vehicles
 * El fallback NUNCA reinterpreta un contexto explícito incompatible
 * (WORKSHOP/PLATFORM → 403): la prelación header→params de D-020 se preserva.
 *
 * @see ADR-001 -- Modelo de Usuario
 * @see ADR-002 -- Active Context
 */
@Injectable()
export class DealershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Preferir contexto resuelto por ContextGuard
    const ctx: CurrentContext | undefined = request.context;
    const dealershipId = this.resolveDealershipId(ctx, request.params);

    if (!dealershipId) {
      throw new ForbiddenException('Dealership ID is required');
    }

    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: { dealershipId, userId: user.id },
      },
      include: { role: true, dealership: { select: { isActive: true } } },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this dealership',
      );
    }

    // P2: una concesionaria desactivada no puede operar desde su workspace
    // (gestión interna del panel). El detalle/historial de vehículos no pasa
    // por este guard y sigue siendo legible.
    if (!member.dealership.isActive) {
      throw new ForbiddenException('This dealership is inactive');
    }

    // Sintetizar contexto cuando se resolvió vía params (fallback FIX-H2, solo
    // rutas del panel). Esto permite que PermissionsGuard resuelva el scope
    // correctamente sin depender de que el frontend envíe X-Context-Id para
    // operaciones del panel. Cuando el frontend YA envía contexto DEALERSHIP,
    // el ctx existente prevalece por el resolveDealershipId anterior.
    if (!ctx || ctx.type !== 'DEALERSHIP') {
      request.context = {
        type: 'DEALERSHIP',
        userId: user.id,
        dealershipId,
        memberId: member.id,
        roleId: member.roleId,
      };
    }

    return true;
  }

  /**
   * Extrae dealershipId del contexto activo.
   *
   * FIX-H2: el fallback a path params se aplica únicamente cuando NO hay
   * contexto explícito o el contexto explícito es PERSONAL (el default del
   * panel, que no envía headers). Un contexto explícito WORKSHOP/PLATFORM
   * nunca se reinterpreta como DEALERSHIP — el fallback no pisa la prelación
   * de headers establecida por D-020.
   */
  private resolveDealershipId(
    ctx: CurrentContext | undefined,
    params: Record<string, string>,
  ): string | undefined {
    if (ctx?.type === 'DEALERSHIP') {
      return ctx.dealershipId;
    }
    if (!ctx || ctx.type === 'PERSONAL') {
      // Fallback de compatibilidad: rutas del panel /dealerships/:id/* que aún
      // no envían X-Context-Id (FIX-H2 §32 §2.3 — frontend no modificado).
      return params?.id;
    }
    // Contexto explícito incompatible (WORKSHOP/PLATFORM): no reinterpretar.
    return undefined;
  }
}