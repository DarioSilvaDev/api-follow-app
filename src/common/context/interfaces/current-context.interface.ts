/**
 * CurrentContext — Representa el contexto activo del usuario en cada request.
 *
 * No es una entidad ni una tabla. Es un objeto construido por request
 * que determina desde qué espacio operativo está actuando el usuario.
 *
 * Los permisos pertenecen al contexto, no al usuario.
 *
 * @see ADR-001 -- Modelo de Usuario
 * @see ADR-002 -- Active Context
 */

export type ContextType = 'PERSONAL' | 'WORKSHOP' | 'PLATFORM';

export interface PersonalContext {
  type: 'PERSONAL';
  userId: string;
}

export interface WorkshopContext {
  type: 'WORKSHOP';
  userId: string;
  workshopId: string;
  memberId: string;
  roleId: string;
}

export interface PlatformContext {
  type: 'PLATFORM';
  userId: string;
}

export type CurrentContext = PersonalContext | WorkshopContext | PlatformContext;

/**
 * Request extension: el ContextGuard coloca el contexto resuelto en request.context.
 */
export interface ContextAwareRequest {
  context: CurrentContext;
}
