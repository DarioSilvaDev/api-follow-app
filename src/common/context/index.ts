/**
 * Context Module — Barrel export.
 *
 * Uso:
 *   import { ActiveContext, ContextModule, type CurrentContext } from '../../common/context';
 *
 * @see ADR-002 -- Active Context
 */
export type {
  CurrentContext,
  ContextType,
  PersonalContext,
  WorkshopContext,
  PlatformContext,
  ContextAwareRequest,
} from './interfaces/current-context.interface';
export { ActiveContext } from './decorators/current-context.decorator';
export { ContextGuard } from './guards/context.guard';
export { ContextResolver } from './services/context-resolver.service';
export { ContextModule } from './context.module';
export { InvalidContextException } from './exceptions/invalid-context.exception';
