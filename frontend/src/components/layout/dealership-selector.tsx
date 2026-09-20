"use client";

/**
 * Milestone consignación — Selector de concesionaria (contexto activo
 * DEALERSHIP) en el header del dashboard.
 *
 * Espejo de WorkshopSelector (D-107, spec §8, resolución PM §3.5):
 * - Lista las `dealershipMemberships` de `/auth/me` (¿nombre + rol),
 *   se armó del array `memberships`.
 * - Seleccionar una concesionaria activa el contexto DEALERSHIP → el
 *   cliente API inyecta `X-Context-Type: dealership` / `X-Context-Id`
 *   (representación, RB-10). Volver a "Personal" lo limpia.
 * - Contexto por-sesión en memoria (D-021 PENDING: sin persistencia).
 * - Sin membresías → no renderiza nada (journey PERSONAL intacto).
 */

import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import {
  clearDealership,
  selectDealership,
} from "@/lib/active-context";
import { dealershipRoleLabel } from "@/lib/consignment";

export function DealershipSelector() {
  const { user } = useAuth();
  const activeContext = useActiveContext();

  const memberships = user?.dealershipMemberships ?? [];
  if (memberships.length === 0) {
    return null;
  }

  const value =
    activeContext?.type === "DEALERSHIP"
      ? activeContext.dealershipId
      : "";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const dealershipId = event.target.value;
    if (dealershipId === "") {
      clearDealership();
    } else {
      selectDealership(dealershipId);
    }
  };

  return (
    <select
      id="dealership-context-select"
      aria-label="Contexto de concesionaria"
      value={value}
      onChange={handleChange}
      className="h-7 max-w-[190px] rounded-lg border border-input bg-transparent px-2 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">Personal</option>
      {memberships.map((membership) => (
        <option key={membership.dealershipId} value={membership.dealershipId}>
          {membership.dealershipName} ({dealershipRoleLabel(membership.role.code)})
        </option>
      ))}
    </select>
  );
}
