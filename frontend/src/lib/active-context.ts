/**
 * Active Context store (F-020 / P2-6, D-020 A1).
 *
 * Singleton en memoria por-sesión:
 * - `null` → contexto PERSONAL (default). El cliente API NO inyecta headers
 *   de contexto → comportamiento actual intacto (D-035).
 * - `{ type: "WORKSHOP", workshopId }` → el cliente API inyecta
 *   `X-Context-Type: WORKSHOP` + `X-Context-Id: {workshopId}` en todas las
 *   llamadas EXCEPTO `auth/*` (RF-3).
 *
 * NO hay persistencia entre refreshes (D-021 PENDING): el estado vive en
 * memoria y se resetea con `clearWorkshop()`. El logout (`clearSession`) debe
 * resetear a `null` para que el próximo login arranque en PERSONAL limpio
 * (un workshopId stale rompería toda la navegación PERSONAL con 403 —
 * ContextResolver, D-020).
 *
 * Módulo PURO (sin React): expone suscripción mínima para alimentar
 * `useSyncExternalStore` desde `src/hooks/use-active-context.ts`.
 */

export type ActiveContext = null | { type: "WORKSHOP"; workshopId: string };

let activeContext: ActiveContext = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Current active context. `null` = PERSONAL. */
export function getActiveContext(): ActiveContext {
  return activeContext;
}

/**
 * Snapshot para `useSyncExternalStore`: la referencia del actual contexto es
 * estable hasta que una mutación la reemplaza (contrato de React).
 */
export function getActiveContextSnapshot(): ActiveContext {
  return activeContext;
}

/** Activar el contexto de un taller (futuras llamadas llevan headers WORKSHOP). */
export function selectWorkshop(workshopId: string): void {
  if (
    activeContext?.type === "WORKSHOP" &&
    activeContext.workshopId === workshopId
  ) {
    return;
  }
  activeContext = { type: "WORKSHOP", workshopId };
  emit();
}

/** Volver a PERSONAL (sin headers). También usado por logout. */
export function clearWorkshop(): void {
  if (activeContext === null) {
    return;
  }
  activeContext = null;
  emit();
}

/** Suscribirse a cambios (retorna unsubscribe). */
export function subscribeActiveContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}