"use client";

import { clearWorkshop, selectWorkshop } from "@/lib/active-context";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";

/**
 * F-020 / P2-6 — Selector de taller (contexto activo) en el header del
 * dashboard.
 *
 * - Lista las `workshopMemberships` de `/auth/me` (nombre del taller + rol).
 * - Seleccionar un taller activa el contexto WORKSHOP → el cliente API inyecta
 *   `X-Context-Type`/`X-Context-Id` (RF-3). Volver a "Personal" lo limpia
 *   (PERSONAL default, sin headers — D-035).
 * - Contexto por-sesión en memoria (D-021 PENDING: sin persistencia).
 * - Sin membresías → no renderiza nada (journey PERSONAL intacto).
 */
export function WorkshopSelector() {
  const { user } = useAuth();
  const activeContext = useActiveContext();

  const memberships = user?.workshopMemberships ?? [];
  if (memberships.length === 0) {
    return null;
  }

  const value =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : "";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const workshopId = event.target.value;
    if (workshopId === "") {
      clearWorkshop();
    } else {
      selectWorkshop(workshopId);
    }
  };

  return (
    <select
      id="workshop-context-select"
      aria-label="Contexto de trabajo"
      value={value}
      onChange={handleChange}
      className="h-7 max-w-[190px] rounded-lg border border-input bg-transparent px-2 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">Personal</option>
      {memberships.map((membership) => (
        <option key={membership.workshopId} value={membership.workshopId}>
          {membership.workshop.name} ({membership.role.name})
        </option>
      ))}
    </select>
  );
}