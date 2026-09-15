"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Car, Loader2, RotateCw, Search, X } from "lucide-react";
import { vehicleApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { VehicleCard } from "@/components/vehicle/vehicle-card";
import { useAuth } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import type { Vehicle } from "@/types/vehicle";

const PAGE = 1;
const LIMIT = 20;
const DEBOUNCE_MS = 300;
/** D-044 / RF-1: same normalization as backend — < 2 chars (after trim) → no filter. */
const MIN_SEARCH_LENGTH = 2;

/**
 * D-039 / RF-1: only the OWNER can edit. The list returns active ownerships
 * (endsAt === null) with `userId` y `type`. We match the ownership to the
 * CURRENT user id (not just any "owner" row) so a future co_owner/company
 * holder does not see the Edit button for the real owner's row.
 */
function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const debouncedInput = useDebounce(searchInput, DEBOUNCE_MS);
  const effectiveQ =
    debouncedInput.trim().length >= MIN_SEARCH_LENGTH
      ? debouncedInput.trim()
      : "";

  // F-012 / RF-4: dynamic 4-element key (stable base for F-011 invalidation)
  // + placeholderData keeps the previous list while q changes (no flash).
  const query = useQuery({
    queryKey: ["vehicles", PAGE, LIMIT, effectiveQ],
    queryFn: () =>
      effectiveQ
        ? vehicleApi.listVehicles({ page: PAGE, limit: LIMIT, q: effectiveQ })
        : vehicleApi.listVehicles({ page: PAGE, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });

  const isEmpty = !query.data || query.data.data.length === 0;
  const showSearchEmptyState = Boolean(effectiveQ && isEmpty);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis vehículos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registra y consulta los vehículos de tu propiedad.
          </p>
        </div>
        <Link href="/vehicles/new">
          <Button>Registrar vehículo</Button>
        </Link>
      </div>

      {/* F-012 / RF-5: search bar — controlled input, accessible label, clear button. */}
      <div className="flex flex-col gap-2 max-w-md">
        <Label htmlFor="vehicle-search" className="sr-only">
          Buscar por placa
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            id="vehicle-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por placa…"
            maxLength={20}
            className="pl-8 pr-8"
          />
          {searchInput && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearchInput("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={RotateCw}
          title="No se pudieron cargar los vehículos"
          description="Ocurrió un error al consultar tus vehículos. Intentalo nuevamente."
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : isEmpty ? (
        showSearchEmptyState ? (
          <EmptyState
            icon={Search}
            title="No se encontraron vehículos con esa placa"
            description={`No hay vehículos que coincidan con «${effectiveQ}». Probá con otra placa o limpiá la búsqueda.`}
            action={
              <Button variant="outline" onClick={() => setSearchInput("")}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Limpiar búsqueda
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Car}
            title="No tenés vehículos registrados"
            description="Registrá tu primer vehículo para empezar a construir su historia."
            action={
              <Link href="/vehicles/new">
                <Button>Registrar vehículo</Button>
              </Link>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.data.map((vehicle) => (
            <li key={vehicle.id}>
              <VehicleCard
                vehicle={vehicle}
                isOwner={isVehicleOwner(vehicle, user?.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
