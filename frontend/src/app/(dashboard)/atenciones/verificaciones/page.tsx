"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { careEpisodeApi } from "@/lib/api";
import type { CareEpisodeVerificationItem } from "@/types/care-episode";

// ---------------------------------------------------------------------------
// Iteración 2-2 / RF-8 — "Verificaciones" (taller, contexto WORKSHOP).
// Journey: el taller ve la cola de episodios `source='owner'` + `unverified`
// de SU taller (GET /care-episodes/verifications, RF-4) y confirma el trabajo
// (POST /care-episodes/:id/verify, RF-5).
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL — WorkshopOnly).
// ---------------------------------------------------------------------------

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function vehicleSummary(item: CareEpisodeVerificationItem): string {
  const catalog = [item.vehicle.brand, item.vehicle.model, item.vehicle.version]
    .filter(Boolean)
    .join(" ");
  const year = item.vehicle.manufactureYear ?? null;
  return [catalog, year].filter(Boolean).join(" · ") || "Sin datos de catálogo";
}

/** Estado transicional del item: pending → verified → error (mensaje). */
type ItemState =
  | { status: "pending" }
  | { status: "verified" }
  | { status: "error"; message: string };

export default function VerificationsPage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;
  const { user } = useAuth();

  const workshopName = user?.workshopMemberships.find(
    (membership) => membership.workshopId === workshopId,
  )?.workshop.name;

  // ── Cola de verificaciones (RF-4: source=owner + unverified + ctx) ───────
  const itemsQuery = useQuery({
    queryKey: ["care-episode-verifications", workshopId],
    queryFn: () => careEpisodeApi.getCareEpisodeVerifications(),
    enabled: workshopId !== null,
    retry: false,
  });

  // Estado local por item: el backend confirma; la UI refleja el cambio sin
  // refetch (el item sale de la cola en el próximo GET).
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  const isVerified = (itemId: string) =>
    itemStates[itemId]?.status === "verified";

  const confirmVerify = async (item: CareEpisodeVerificationItem) => {
    const target = workshopName ?? "mi taller";
    if (!window.confirm(`¿Confirmar que tu taller realizó "${item.title}"?`)) {
      return;
    }

    try {
      await careEpisodeApi.verifyCareEpisode(item.id);
      setItemStates((prev) => ({ ...prev, [item.id]: { status: "verified" } }));
    } catch (error) {
      const status = (error as { status?: number }).status;
      let message = "No se pudo confirmar el episodio. Intentalo nuevamente.";
      if (status === 403) {
        message =
          "Este episodio no puede confirmarse: no tenés permisos o es un episodio de taller.";
      } else if (status === 404) {
        message = "El episodio ya no está disponible para tu taller.";
      } else if (status === 409) {
        message = "Este episodio ya fue verificado por otro taller.";
      }
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { status: "error", message },
      }));
    }
  };

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para ver las verificaciones pendientes necesitás operar en el
              contexto de un taller. Seleccioná un taller en el selector del
              header y volvé a intentar.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading />

      {itemsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" role="status">
              Cargando verificaciones...
            </p>
          </CardContent>
        </Card>
      ) : itemsQuery.isError ? (
        <Card>
          <CardContent className="grid gap-3 py-6 text-center">
            <p className="text-sm text-destructive" role="alert">
              No se pudieron cargar las verificaciones pendientes.
            </p>
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void itemsQuery.refetch()}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : itemsQuery.data?.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin verificaciones pendientes
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {itemsQuery.data?.map((item) => {
            const state = itemStates[item.id] ?? { status: "pending" };
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      {isVerified(item.id) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                          data-testid={`verified-${item.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Verificado por {workshopName ?? "este taller"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          Pendiente de verificación
                        </span>
                      )}
                    </div>

                    <div className="grid gap-1 text-sm">
                      <p className="text-muted-foreground">
                        {formatDate(item.serviceDate)}
                        {item.mileageIn != null
                          ? ` · ${item.mileageIn.toLocaleString("es-AR")} km`
                          : ""}
                      </p>
                      <p className="font-medium">
                        {item.vehicle.licensePlate}{" "}
                        <span className="text-muted-foreground">
                          ({vehicleSummary(item)})
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Propietario: {item.owner.firstName} {item.owner.lastName}
                      </p>
                      {item.notes ? (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground/80">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>

                    {state.status === "error" && (
                      <p className="text-sm text-destructive" role="alert">
                        {state.message}
                      </p>
                    )}

                    {!isVerified(item.id) && (
                      <div>
                        <Button
                          size="sm"
                          onClick={() => void confirmVerify(item)}
                        >
                          Confirmar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Heading() {
  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al inicio
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        Verificaciones
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirmá los servicios registrados por propietarios que te declararon
        como taller responsable.
      </p>
    </div>
  );
}