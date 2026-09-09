"use client";

import Link from "next/link";
import { Loader2, RotateCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { vehicleApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Vehicle } from "@/types/vehicle";

const PAGE = 1;
const LIMIT = 20;

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
  const query = useQuery({
    queryKey: ["vehicles", PAGE, LIMIT],
    queryFn: () => vehicleApi.listVehicles({ page: PAGE, limit: LIMIT }),
  });

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
      ) : !query.data || query.data.data.length === 0 ? (
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
      ) : (
        <ul className="flex flex-col gap-4">
          {query.data.data.map((vehicle) => (
            <li key={vehicle.id}>
              <Card>
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
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}