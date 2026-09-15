"use client";

import Link from "next/link";
import { ArrowLeft, Calendar, Gauge, Pencil, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/types/vehicle";

interface VehicleHeaderProps {
  vehicle: Vehicle;
  isOwner?: boolean;
}

function catalogLabel(vehicle: Vehicle): string | null {
  const parts = [vehicle.brand, vehicle.model, vehicle.version].filter(
    (part): part is string => Boolean(part && part?.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

export function VehicleHeader({ vehicle, isOwner = false }: VehicleHeaderProps) {
  const catalog = catalogLabel(vehicle);
  const latestMileage =
    vehicle.mileages && vehicle.mileages.length > 0
      ? vehicle.mileages[0]
      : null;

  const years = [vehicle.manufactureYear, vehicle.modelYear].filter(
    (y): y is number => typeof y === "number",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Vehículos
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
          {vehicle.licensePlate}
        </span>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: vehicle identity */}
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {vehicle.licensePlate}
              </h1>
              {catalog && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {catalog}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                {years.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {years.join(" / ")}
                  </span>
                )}
                {vehicle.color && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-border"
                      style={{ backgroundColor: vehicle.color === "Blanco" ? "#f5f5f5" : vehicle.color === "Negro" ? "#1a1a1a" : vehicle.color }}
                    />
                    {vehicle.color}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: mileage + actions */}
          <div className="flex items-center gap-3 shrink-0">
            {latestMileage && (
              <Badge variant="secondary" className="font-mono text-sm">
                <Gauge className="mr-1.5 h-3.5 w-3.5" />
                {latestMileage.mileage.toLocaleString("es-AR")} km
              </Badge>
            )}
            {isOwner && (
              <Link href={`/vehicles/${vehicle.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
