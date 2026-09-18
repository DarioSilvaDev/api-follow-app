"use client";

/**
 * Milestone consignación — Listado de concesionarias (D-105 / spec §8
 * NAV_ITEMS_BASE "Concesionarias", RB-10). Fuente: `GET /dealerships/mine`
 * (`dealershipApi.listMine`) — concesionarias donde el usuario es miembro
 * activo. La pertenencia/rol del usuario por concesionaria se resuelve desde
 * la sesión (`SessionUser.dealershipMemberships`, igual que el selector del
 * header — §10.4 Auth State), no desde la entidad `Dealership`.
 *
 * Alta rápida (D-103): "Nueva concesionaria" → `/dealerships/nueva`
 * (CreateDealershipForm — incluye "yo soy el dueño", D-104, crea el member
 * owner). Detalle (`/dealerships/[id]`): exhibición + miembros (D-105,
 * resolución PM §3.5 / D-107).
 */

import Link from "next/link";
import { Plus, Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { dealershipApi } from "@/lib/api";
import { cn } from "cn";

export default function DealershipsPage() {
  const mineQuery = useQuery({
    queryKey: ["dealerships-mine"],
    queryFn: () => dealershipApi.listMine(),
  });

  const dealerships = mineQuery.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concesionarias</h1>
          <p className="text-sm text-muted-foreground">
            Concesionarias donde participás como miembro.
          </p>
        </div>
        <Link
          href="/dealerships/nueva"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva concesionaria
        </Link>
      </div>

      {mineQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      ) : dealerships.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Todavía no formás parte de ninguna concesionaria"
          description="Creá una concesionaria con el alta rápida, o aceptá una invitación por email para sumarte como miembro."
          action={
            <Link
              href="/dealerships/nueva"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva concesionaria
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dealerships.map((dealership) => (
            <Link
              key={dealership.id}
              href={`/dealerships/${dealership.id}`}
              className="transition-colors hover:opacity-80"
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">
                    {dealership.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {[dealership.legalName, dealership.taxId]
                      .filter(Boolean)
                      .join(" · ") ||
                      "Sin razón social / CUIT cargados"}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
