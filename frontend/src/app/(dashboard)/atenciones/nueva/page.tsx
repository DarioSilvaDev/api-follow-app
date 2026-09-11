"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext } from "@/hooks/use-active-context";
import { careEpisodeApi, workshopApi } from "@/lib/api";
import type { CareEpisodeLookupVehicle } from "@/types/care-episode";

// ---------------------------------------------------------------------------
// F-020 — "Nueva atención" (creación de CareEpisode desde Taller, contexto
// WORKSHOP). Journey: buscar vehículo por placa → check-in (branch + datos
// mínimos) → POST /api/care-episodes (RF-1/RF-2, spec F-020 §5).
//
// WORKSHOP-only: sin taller seleccionado la página solo orienta (el backend
// responde 403 en PERSONAL, D-024 A2 / D-035).
// ---------------------------------------------------------------------------

type LookupState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; vehicle: CareEpisodeLookupVehicle }
  | { status: "not-found"; plate: string }
  | { status: "error"; message: string };

const RATE_LIMIT_MESSAGE =
  "Demasiadas búsquedas. Esperá unos segundos e intentá de nuevo.";

const checkInSchema = z.object({
  branchId: z.string().min(1, "Seleccioná una sucursal"),
  mileageIn: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "El kilometraje debe ser un número entero",
    )
    .refine(
      (value) => value === "" || Number(value) >= 0,
      "El kilometraje debe ser mayor o igual a 0",
    )
    .optional(),
  customerComplaint: z
    .string()
    .trim()
    .max(500, "El motivo no puede superar los 500 caracteres")
    .optional(),
  customerNotes: z
    .string()
    .trim()
    .max(1000, "Las notas no pueden superar los 1000 caracteres")
    .optional(),
});

type CheckInFormValues = z.infer<typeof checkInSchema>;

function vehicleSummary(vehicle: CareEpisodeLookupVehicle): string {
  const catalog = [vehicle.brand, vehicle.model, vehicle.version]
    .filter(Boolean)
    .join(" ");
  const years = [vehicle.manufactureYear, vehicle.modelYear]
    .filter((year) => year != null)
    .join(" / ");
  return [catalog, years].filter(Boolean).join(" — ");
}

export default function NewCareEpisodePage() {
  const activeContext = useActiveContext();
  const workshopId =
    activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null;

  // ── Búsqueda por placa ────────────────────────────────────────────────────
  const [plateInput, setPlateInput] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const lastPlateRef = useRef("");

  const runLookup = async (plate: string) => {
    const normalized = plate.trim().toUpperCase(); // D-037/D-042
    if (normalized.length === 0) {
      return;
    }
    lastPlateRef.current = normalized;
    setLookup({ status: "searching" });
    try {
      const vehicle = await careEpisodeApi.lookupVehicleByPlate(normalized);
      setLookup({ status: "found", vehicle });
    } catch (error) {
      const apiError = error as { status?: number; message?: string };
      if (apiError.status === 404) {
        setLookup({ status: "not-found", plate: normalized });
        return;
      }
      if (apiError.status === 429) {
        setLookup({ status: "error", message: RATE_LIMIT_MESSAGE });
        return;
      }
      if (apiError.status && apiError.status >= 500) {
        setLookup({
          status: "error",
          message: "Error interno del servidor. Intentalo nuevamente.",
        });
        return;
      }
      setLookup({
        status: "error",
        message: apiError.message || "No se pudo buscar el vehículo. Intentalo nuevamente.",
      });
    }
  };

  const handleLookupSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runLookup(plateInput);
  };

  // ── Sucursales del taller (GET /workshops/:id — branches activas) ─────────
  const workshopQuery = useQuery({
    queryKey: ["workshop", workshopId],
    queryFn: () => workshopApi.getWorkshop(workshopId!),
    enabled: workshopId !== null,
  });
  const branches = workshopQuery.data?.branches ?? [];
  const branchesLoading = workshopId !== null && workshopQuery.isLoading;

  // ── Formulario de check-in ────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInSchema),
  });

  const branchId = watch("branchId");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdEpisodeId, setCreatedEpisodeId] = useState<string | null>(null);
  const [createdPlate, setCreatedPlate] = useState("");

  // Al cambiar de taller, la branch seleccionada deja de ser válida.
  useEffect(() => {
    setValue("branchId", "");
  }, [workshopId, setValue]);

  // Spec §5: "branch (pre-seleccionada)" — el backend devuelve la sede primero.
  useEffect(() => {
    if (branchId === "" && branches.length > 0) {
      setValue("branchId", branches[0].id);
    }
  }, [branchId, branches, setValue]);

  const resetAfterSuccess = () => {
    setCreatedEpisodeId(null);
    setCreatedPlate("");
    setLookup({ status: "idle" });
    setPlateInput("");
    setSubmitError(null);
  };

  const onSubmit = async (data: CheckInFormValues) => {
    if (lookup.status !== "found") {
      return;
    }
    setSubmitError(null);
    try {
      const episode = await careEpisodeApi.createCareEpisode({
        vehicleId: lookup.vehicle.id,
        branchId,
        mileageIn: data.mileageIn ? Number(data.mileageIn) : undefined,
        customerComplaint: data.customerComplaint || undefined,
        customerNotes: data.customerNotes || undefined,
      });
      setCreatedEpisodeId(episode.id);
      setCreatedPlate(lookup.vehicle.licensePlate);
    } catch (error) {
      const apiError = error as { status?: number; message?: string };
      if (apiError.status === 403) {
        setSubmitError(
          "No tenés permisos para registrar atenciones en este taller.",
        );
        return;
      }
      if (apiError.status === 404) {
        setSubmitError(
          "El vehículo o la sucursal ya no están disponibles. Volvé a buscar.",
        );
        return;
      }
      if (apiError.status && apiError.status >= 500) {
        setSubmitError("Error interno del servidor. Intentalo nuevamente.");
        return;
      }
      setSubmitError(
        apiError.message || "Error al registrar la atención. Intentalo nuevamente.",
      );
    }
  };

  // ── Estados de la página ──────────────────────────────────────────────────

  // Sin taller seleccionado: WORKSHOP-only por diseño (D-024 A2 / D-035).
  if (workshopId === null) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para registrar una atención necesitás operar en el contexto de un
              taller. Seleccioná un taller en el selector del header y volvé a
              intentar.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading />

      {createdEpisodeId ? (
        <Card>
          <CardContent className="grid gap-3">
            <p role="status" className="text-sm font-medium text-primary">
              Atención ingresada OK — vehículo {createdPlate}
            </p>
            <p className="text-sm text-muted-foreground">
              El episodio quedó abierto y forma parte de la historia del
              vehículo.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={resetAfterSuccess} variant="outline">
              Registrar otra atención
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          {/* Búsqueda por placa */}
          <Card>
            <CardContent className="grid gap-4">
              <form onSubmit={handleLookupSubmit} className="grid gap-2">
                <Label htmlFor="plate">Placa del vehículo</Label>
                <div className="flex gap-2">
                  <Input
                    id="plate"
                    placeholder="Ej. ABC123"
                    maxLength={10}
                    autoComplete="off"
                    value={plateInput}
                    onChange={(event) => setPlateInput(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={lookup.status === "searching" || plateInput.trim() === ""}
                  >
                    {lookup.status === "searching" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Buscar
                  </Button>
                </div>
              </form>

              {lookup.status === "searching" && (
                <p className="text-sm text-muted-foreground" role="status">
                  Buscando vehículo...
                </p>
              )}

              {lookup.status === "found" && (
                <div
                  className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3"
                  data-testid="vehicle-found"
                >
                  <p className="text-sm font-semibold">
                    {lookup.vehicle.licensePlate}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {vehicleSummary(lookup.vehicle) || "Sin datos de catálogo"}
                  </p>
                </div>
              )}

              {lookup.status === "not-found" && (
                <p className="text-sm text-destructive" role="alert">
                  No se encontró un vehículo con esa placa.{" "}
                  <span className="text-muted-foreground">
                    El vehículo debe estar registrado en la plataforma (lo
                    registra su propietario).
                  </span>
                </p>
              )}

              {lookup.status === "error" && (
                <div className="grid gap-2" role="alert">
                  <p className="text-sm text-destructive">{lookup.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runLookup(lastPlateRef.current)}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Check-in (solo con vehículo encontrado) */}
          {lookup.status === "found" && (
            <Card>
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="branchId">Sucursal</Label>
                    <Select
                      id="branchId"
                      value={branchId ?? ""}
                      onChange={(event) => setValue("branchId", event.target.value)}
                      disabled={branchesLoading || branches.length === 0}
                      aria-invalid={branches.length === 0 && !branchesLoading}
                    >
                      <option value="">
                        {branchesLoading
                          ? "Cargando sucursales..."
                          : "Seleccionar sucursal"}
                      </option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                          {branch.isHeadquarters ? " (Sede)" : ""}
                        </option>
                      ))}
                    </Select>
                    {!branchesLoading && branches.length === 0 && (
                      <p className="text-sm text-muted-foreground" role="alert">
                        El taller no tiene sucursales activas configuradas. No
                        se puede registrar una atención hasta que exista al
                        menos una sucursal.
                      </p>
                    )}
                    {workshopQuery.isError && (
                      <p className="text-sm text-destructive" role="alert">
                        No se pudieron cargar las sucursales del taller.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mileageIn">Kilometraje de ingreso (opcional)</Label>
                    <Input
                      id="mileageIn"
                      inputMode="numeric"
                      placeholder="Ej. 45000"
                      maxLength={10}
                      autoComplete="off"
                      aria-invalid={!!errors.mileageIn}
                      {...register("mileageIn")}
                    />
                    {errors.mileageIn && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors.mileageIn.message}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="customerComplaint">Motivo / queja del cliente (opcional)</Label>
                    <Textarea
                      id="customerComplaint"
                      placeholder="Ej. Ruido en el motor al acelerar..."
                      rows={3}
                      maxLength={500}
                      aria-invalid={!!errors.customerComplaint}
                      {...register("customerComplaint")}
                    />
                    {errors.customerComplaint ? (
                      <p className="text-sm text-destructive" role="alert">
                        {errors.customerComplaint.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Máximo 500 caracteres.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="customerNotes">Notas del cliente (opcional)</Label>
                    <Textarea
                      id="customerNotes"
                      placeholder="Observaciones adicionales del cliente..."
                      rows={3}
                      maxLength={1000}
                      aria-invalid={!!errors.customerNotes}
                      {...register("customerNotes")}
                    />
                    {errors.customerNotes ? (
                      <p className="text-sm text-destructive" role="alert">
                        {errors.customerNotes.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Máximo 1000 caracteres.
                      </p>
                    )}
                  </div>

                  {submitError && (
                    <p className="text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || branches.length === 0}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      "Registrar atención"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}
        </>
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
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Nueva atención</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registrá el ingreso (check-in) de un vehículo en el taller.
      </p>
    </div>
  );
}