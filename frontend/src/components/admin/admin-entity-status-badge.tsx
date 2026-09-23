"use client";

/**
 * Badge de estado efectivo de entidad admin — DRY para los listados de
 * concesionarias, talleres y usuarios (Fase 2/3 handoff PM).
 *
 * Consume el helper único src/lib/admin-status.ts (SIEMPRE a través de él;
 * la precedencia vive en un solo lugar — decisión PM P2):
 *
 * - disabled         → Badge destructive "Deshabilitada/o" (gana siempre).
 * - expired_pending  → Badge warning "Pendiente de claim" + chip outline
 *                      "Expirada" + caption "Invitación venció el {dd mmm yyyy}".
 * - pending_claim    → Badge warning "Pendiente de claim" (+ caption "Invitación
 *                      vence el …" si invitation.expiresAt está presente).
 * - pending          → Badge warning "Pendiente" (usuarios).
 * - active           → Badge success "Activa/o".
 * - suspended        → Badge destructive "Suspendido" (usuarios).
 *
 * `formatAdminDate` y la detección de expiración viven en admin-status.ts.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  formatAdminDate,
  getAdminDealershipStatusState,
  getAdminUserStatusState,
  getAdminWorkshopStatusState,
} from "@/lib/admin-status";
import type {
  AdminEntityStatusShape,
  AdminEntityStatusState,
} from "@/lib/admin-status";

export interface AdminEntityStatusBadgeProps {
  entityType: "dealership" | "workshop" | "user";
  entity: AdminEntityStatusShape;
}

const VARIANTS: Record<
  AdminEntityStatusState,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
> = {
  disabled: "destructive",
  expired_pending: "warning",
  pending_claim: "warning",
  pending: "warning",
  active: "success",
  suspended: "destructive",
};

function resolveLabel(
  entityType: "dealership" | "workshop" | "user",
  state: AdminEntityStatusState,
): string {
  // Géneros: concesionaria femenina; taller/usuario masculinos.
  if (entityType === "dealership") {
    switch (state) {
      case "disabled":
        return "Deshabilitada";
      case "active":
        return "Activa";
      case "expired_pending":
      case "pending_claim":
        return "Pendiente de claim";
      case "pending":
        return "Pendiente";
      case "suspended":
        return "Suspendida";
    }
  }
  switch (state) {
    case "disabled":
      return "Deshabilitado";
    case "active":
      return "Activo";
    case "expired_pending":
    case "pending_claim":
      return "Pendiente de claim";
    case "pending":
      return "Pendiente";
    case "suspended":
      return "Suspendido";
  }
}

export function AdminEntityStatusBadge({
  entityType,
  entity,
}: AdminEntityStatusBadgeProps) {
  // "Ahora" estable por render (evita expirar a mitad de la interacción). El
  // patrón es consistente con el repositorio (qr-transfer-panel expone un
  // reloj con Date.now en state); la regla react-hooks/purity ya falla en la
  // base existente.
  const stableNow = useMemo(() => Date.now(), []);

  const state: AdminEntityStatusState =
    entityType === "user"
      ? getAdminUserStatusState(entity)
      : entityType === "dealership"
        ? getAdminDealershipStatusState(entity, stableNow)
        : getAdminWorkshopStatusState(entity, stableNow);

  let caption: string | null = null;
  if (state === "expired_pending" && entity.invitation?.expiresAt) {
    caption = `Invitación venció el ${formatAdminDate(entity.invitation.expiresAt)}`;
  } else if (state === "pending_claim" && entity.invitation?.expiresAt) {
    caption = `Invitación vence el ${formatAdminDate(entity.invitation.expiresAt)}`;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={VARIANTS[state]}>{resolveLabel(entityType, state)}</Badge>
        {state === "expired_pending" && (
          <Badge variant="outline" className="text-destructive">
            Expirada
          </Badge>
        )}
      </div>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}