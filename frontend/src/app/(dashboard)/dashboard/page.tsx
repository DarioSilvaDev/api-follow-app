"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Car,
  FileText,
  Gauge,
  Loader2,
  Plus,
  RotateCw,
  Wrench,
} from "lucide-react";
import { vehicleApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { VehicleCard } from "@/components/vehicle/vehicle-card";
import { useAuth } from "@/hooks/use-auth";
import { useActiveContext } from "@/hooks/use-active-context";
import type { Vehicle } from "@/types/vehicle";

function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

export default function DashboardPage() {
  const { status, user } = useAuth();
  const router = useRouter();
  const activeContext = useActiveContext();

  const vehicleQuery = useQuery({
    queryKey: ["vehicles", 1, 10],
    queryFn: () => vehicleApi.listVehicles({ page: 1, limit: 10 }),
  });

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const vehicles = vehicleQuery.data?.data ?? [];
  const hasVehicles = vehicles.length > 0;
  const isWorkshop = activeContext?.type === "WORKSHOP";

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {user.firstName || "Usuario"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {hasVehicles
            ? "Tus vehículos y su historial."
            : "Empezá registrando tu primer vehículo."}
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href="/vehicles/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Registrar vehículo
          </Button>
        </Link>
        {isWorkshop && (
          <>
            <Link href="/atenciones/nueva">
              <Button variant="outline" size="sm">
                <Wrench className="mr-1.5 h-3.5 w-3.5" />
                Nueva atención
              </Button>
            </Link>
            <Link href="/atenciones/verificaciones">
              <Button variant="outline" size="sm">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Verificaciones
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Vehicles section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Mis vehículos
          </h2>
          {hasVehicles && (
            <Link
              href="/vehicles"
              className="text-sm text-primary hover:underline"
            >
              Ver todos
            </Link>
          )}
        </div>

        {vehicleQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vehicleQuery.isError ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No se pudieron cargar los vehículos.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => vehicleQuery.refetch()}
              >
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </CardContent>
          </Card>
        ) : !hasVehicles ? (
          <EmptyState
            icon={Car}
            title="No tenés vehículos registrados"
            description="Registrá tu primer vehículo para empezar a construir su historia."
            action={
              <Link href="/vehicles/new">
                <Button>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Registrar vehículo
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <VehicleCard
                  vehicle={vehicle}
                  isOwner={isVehicleOwner(vehicle, user.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
