import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * WorkshopOnlyGuard — Ensures the active context is WORKSHOP.
 *
 * Used on maintenance write endpoints per D-024 Amendment 2 (Opción A):
 * maintenance writes (create, update, cancel, convert, items, approve)
 * require a WORKSHOP context with workshop permissions.
 *
 * In PERSONAL context the operation is denied by design (403 PERMISSION_DENIED),
 * regardless of ownership, access, or system role (including super_admin).
 *
 * Must run BEFORE PermissionsGuard in the guard chain so that the
 * super_admin bypass in PermissionsGuard cannot circumvent this check.
 *
 * @see D-024 Amendment 2 — Maintenance writes are WORKSHOP-only
 */
@Injectable()
export class WorkshopOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ctx: CurrentContext | undefined = request.context;

    if (!ctx || ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }

    return true;
  }
}
