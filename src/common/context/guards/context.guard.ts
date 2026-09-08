import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../types/auth.types';
import { ContextResolver } from '../services/context-resolver.service';
import { CurrentContext } from '../interfaces/current-context.interface';

/**
 * ContextGuard — Resuelve y coloca el contexto activo en request.context.
 *
 * Debe ejecutarse DESPUÉS de JwtAuthGuard (que popula request.user).
 *
 * Flujo:
 * 1. Leer request.user (AuthenticatedUser)
 * 2. ContextResolver.resolve(user, request) → CurrentContext
 * 3. Colocar en request.context
 *
 * Los guards aguas abajo (PermissionsGuard, WorkshopGuard) leen de request.context
 * en lugar de inferir de request.params.id.
 *
 * @see ADR-002 -- Active Context
 */
@Injectable()
export class ContextGuard implements CanActivate {
  private readonly logger = new Logger(ContextGuard.name);

  constructor(private readonly contextResolver: ContextResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      // JwtAuthGuard debería haber fallado antes
      this.logger.warn('ContextGuard executed without authenticated user');
      return false;
    }

    const resolvedContext: CurrentContext = await this.contextResolver.resolve(
      user,
      request,
    );

    // Extender el request con el contexto resuelto
    request.context = resolvedContext;

    return true;
  }
}
