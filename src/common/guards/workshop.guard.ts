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
 * WorkshopGuard — Verifica que el usuario sea miembro activo del taller.
 *
 * Lee el workshopId del contexto activo (request.context), con fallback
 * a request.params.id para compatibilidad con endpoints existentes.
 *
 * @see ADR-001 -- Modelo de Usuario
 * @see ADR-002 -- Active Context
 */
@Injectable()
export class WorkshopGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Preferir contexto resuelto por ContextGuard
    const ctx: CurrentContext | undefined = request.context;
    const workshopId = this.resolveWorkshopId(ctx, request.params);

    if (!workshopId) {
      throw new ForbiddenException('Workshop ID is required');
    }

    const member = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: { workshopId, userId: user.id },
      },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException('You are not an active member of this workshop');
    }

    return true;
  }

  /**
   * Extrae workshopId del contexto activo, con fallback a path params.
   */
  private resolveWorkshopId(
    ctx: CurrentContext | undefined,
    params: Record<string, string>,
  ): string | undefined {
    if (ctx?.type === 'WORKSHOP') {
      return ctx.workshopId;
    }
    // Fallback de compatibilidad
    return params?.id;
  }
}
