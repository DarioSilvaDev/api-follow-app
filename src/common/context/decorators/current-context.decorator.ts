import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CurrentContext } from '../interfaces/current-context.interface';

/**
 * @ActiveContext() — Decorador para inyectar el CurrentContext en un handler.
 *
 * Requiere que ContextGuard se haya ejecutado previamente.
 *
 * Uso:
 *   @Get(':id')
 *   async getSomething(@ActiveContext() ctx: CurrentContext) {
 *     // ctx.type, ctx.workshopId, ctx.userId, etc.
 *   }
 *
 * @see ADR-002 -- Active Context
 */
export const ActiveContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.context;
  },
);
