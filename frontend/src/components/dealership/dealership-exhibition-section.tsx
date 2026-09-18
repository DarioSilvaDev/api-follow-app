"use client";

/**
 * Milestone consignación — Exhibición de la concesionaria (D-105 / spec §8,
 * resolución PM §3.5).
 *
 * Lista los vehículos en exhibición (GET /dealerships/:id/vehicles) y expone
 * las acciones que la concesionaria puede ejecutar sobre cada uno:
 * - "Vender": QR de VENTA (purpose sale) — lo escanea el comprador.
 * - "Devolver": QR inverso (purpose return) — lo escanea el vendedor original
 *   para recuperar la titularidad (ciclo completo spec §8).
 *
 * Reutiliza QrTransferPanel (¡única fuente para la frontera QR, AGENTS.md
 * §22 / frontend §14) con el subset `{ id, licensePlate }` que el panel
 * necesita. Enforcement real: backend (membresía activa DEALERSHIP +
 * RB-10) — la UI solo habilita la acción.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, ImageIcon, RotateCcw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { dealershipApi } from "@/lib/api";
import { QrTransferPanel } from "@/components/transfer/qr-transfer-panel";
import type { DealershipExhibitionVehicle } from "@/types/dealership";

interface DealershipExhibitionSectionProps {
  dealershipId: string;
}

interface ExhibitionAction {
  vehicle: DealershipExhibitionVehicle;
  /** QR a generar: venta (sale) o devolución (return). */
  purpose: "sale" | "return";
}

function formatArtsDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function vehicleDescription(vehicle: DealershipExhibitionVehicle): string {
  const parts = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean);
  const years = [vehicle.manufactureYear, vehicle.modelYear]
    .filter((year): year is number => typeof year === "number")
    .join(" · ");
  return [parts.join(" "), years].filter(Boolean).join(" — ") || "Vehículo";
}

function primaryPhotoURL(vehicle: DealershipExhibitionVehicle): string | null {
  return (
    vehicle.photos?.find((photo) => photo.isPrimary)?.url ??
    vehicle.photos?.[0]?.url ??
    null
  );
}

export function DealershipExhibitionSection({
  dealershipId,
}: DealershipExhibitionSectionProps) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ExhibitionAction | null>(null);

  const vehiclesQuery = useQuery({
    queryKey: ["dealership-vehicles", dealershipId],
    queryFn: () => dealershipApi.listVehicles(dealershipId),
  });

  const vehicles = vehiclesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Vehículos consignados a esta concesionaria por sus vendedores. La
        concesionaria es la titular intermedia mientras están en exhibición.
      </p>

      {vehiclesQuery.isLoading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          Cargando vehículos en exhibición...
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin vehículos en exhibición"
          description="Cuando un vendedor escanee el QR de toma (consignación), el vehículo aparece acá en exhibición hasta su venta o devolución."
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {vehicles.map((vehicle) => {
            const photoUrl = primaryPhotoURL(vehicle);
            return (
              <li
                key={vehicle.id}
                className="flex items-center gap-4 px-4 py-3"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {photoUrl ? (
                    // URL firmada del storage (R2). Solo lectura de exhibición
                    // (RB-09) — nunca se usa para subir archivos.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={`${vehicle.licensePlate} en exhibición`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {vehicle.licensePlate}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {vehicleDescription(vehicle)}
                  </p>
                  {formatArtsDate(vehicle.consignedAt) && (
                    <p className="text-xs text-muted-foreground">
                      En exhibición desde {formatArtsDate(vehicle.consignedAt)}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ vehicle, purpose: "sale" })}
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Vender
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ vehicle, purpose: "return" })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Devolver
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <DialogPopup className="sm:max-w-md">
          <DialogTitle>
            {action?.purpose === "sale"
              ? `Vender ${action?.vehicle.licensePlate ?? "vehículo"}`
              : `Devolver ${action?.vehicle.licensePlate ?? "vehículo"}`}
          </DialogTitle>
          <DialogDescription>
            {action?.purpose === "sale"
              ? "Generá el QR de venta. El comprador lo escanea en la concesionaria para firmar la titularidad."
              : "Generá el QR de devolución. El vendedor original lo escanea para recuperar la titularidad."}
          </DialogDescription>

          {action && (
            <QrTransferPanel
              key={`${action.purpose}-${action.vehicle.id}`}
              vehicle={{
                id: action.vehicle.id,
                licensePlate: action.vehicle.licensePlate,
              }}
              purpose={action.purpose}
              onMutationEnd={() => {
                queryClient.invalidateQueries({
                  queryKey: ["dealership-vehicles", dealershipId],
                });
                setAction(null);
              }}
            />
          )}
        </DialogPopup>
      </Dialog>
    </div>
  );
}
