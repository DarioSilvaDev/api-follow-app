"use client";

import { useSyncExternalStore } from "react";
import {
  getActiveContextSnapshot,
  subscribeActiveContext,
  type ActiveContext,
} from "@/lib/active-context";

/**
 * Lee el contexto activo con suscripción a cambios (re-render al seleccionar
 * taller / volver a Personal). F-020 / P2-6.
 *
 * `null` = PERSONAL (default); `{ type: "WORKSHOP", workshopId }` = taller.
 */
export function useActiveContext(): ActiveContext {
  return useSyncExternalStore(
    subscribeActiveContext,
    getActiveContextSnapshot,
    getActiveContextSnapshot,
  );
}