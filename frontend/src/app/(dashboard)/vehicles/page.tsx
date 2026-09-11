"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, RotateCw, Search, X } from "lucide-react";
import { vehicleApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * Render the catalog triplet. D-038: without a catalog selection the UI
 * shows "—". The backend is migrating the list contract to denormalized
 * brand/model/version (F-010 §9), so missing values are tolerated.
 */
function catalogLabel(vehicle: Vehicle): string {
  const parts = [vehicle.brand, vehicle.model, vehicle.version].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : "—";
}

function yearsLabel(vehicle: Vehicle): string {
  const years = [vehicle.manufactureYear, vehicle.modelYear].filter(
    (year): year is number => typeof year === "number",
  );
  return years.length > 0 ? years.join(" / ") : "—";
}

export default function VehiclesPage() {
  const { user } = useAuth();
  const router = useRouter();
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

  const isEmpty =
    !query.data || query.data.data.length === 0;
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
        <Card>
          <CardHeader>
            <CardTitle>No se pudieron cargar los vehículos</CardTitle>
            <CardDescription>
              Ocurrió un error al consultar tus vehículos. Intentalo nuevamente.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RotateCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardFooter>
        </Card>
      ) : isEmpty ? (
        showSearchEmptyState ? (
          <Card>
            <CardHeader>
              <CardTitle>No se encontraron vehículos con esa placa</CardTitle>
              <CardDescription>
                No hay vehículos que coincidan con «{effectiveQ}». Probá con
                otra placa o limpiá la búsqueda.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" onClick={() => setSearchInput("")}>
                <X className="h-4 w-4" />
                Limpiar búsqueda
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No tenés vehículos registrados</CardTitle>
              <CardDescription>
                Registrá tu primer vehículo para empezar a construir su historia
                clínica digital.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/vehicles/new">
                <Button>Registrar vehículo</Button>
              </Link>
            </CardFooter>
          </Card>
        )
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.data.map((vehicle) => (
            <li key={vehicle.id}>
              {/* F-013 / D-046: TODA la card navega al detalle. PROHIBIDO
                  <Link> anidado (Next.js no lo soporta) — usamos un <div>
                  clickable (role="link") y la acción "Editar" (D-039, solo
                  owner) con e.stopPropagation() para no disparar la card. */}
              <div
                role="link"
                tabIndex={0}
                aria-label={`Ver detalle de ${vehicle.licensePlate}`}
                className="cursor-pointer rounded-xl ring-1 ring-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 hover:bg-muted/30"
                onClick={() => router.push(`/vehicles/${vehicle.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/vehicles/${vehicle.id}`);
                  }
                }}
              >
                <Card className="ring-0">
                  <CardHeader>
                    <CardTitle className="text-base font-medium">
                      {vehicle.licensePlate}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
                    <p className="text-muted-foreground">
                      Marca / modelo / versión:{" "}
                      <span className="text-foreground">
                        {catalogLabel(vehicle)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Año:{" "}
                      <span className="text-foreground">{yearsLabel(vehicle)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Color:{" "}
                      <span className="text-foreground">
                        {vehicle.color || "—"}
                      </span>
                    </p>
                  </CardContent>
                  {/* D-039 / RF-1: "Editar" solo para owners activos. */}
                  {isVehicleOwner(vehicle, user?.id) && (
                    <CardFooter>
                      <Link
                        href={`/vehicles/${vehicle.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="outline" size="sm">
                          Editar
                        </Button>
                      </Link>
                    </CardFooter>
                  )}
                </Card>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}