import { Module } from '@nestjs/common';
import { ContextResolver } from './services/context-resolver.service';
import { ContextGuard } from './guards/context.guard';

/**
 * ContextModule — Módulo de infraestructura para Active Context.
 *
 * Proporciona:
 * - ContextResolver: resuelve el contexto activo a partir de la request
 * - ContextGuard: coloca el contexto en request.context
 * - CurrentContext decorator: inyecta el contexto en handlers
 *
 * No depende de ningún módulo funcional.
 * Todos los módulos dependen de él.
 *
 * @see ADR-002 -- Active Context
 */
@Module({
  providers: [ContextResolver, ContextGuard],
  exports: [ContextResolver, ContextGuard],
})
export class ContextModule {}
