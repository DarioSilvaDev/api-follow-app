"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Loader2 } from "lucide-react";
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
import { vehicleApi } from "@/lib/api";
import {
  CONFLICT_MESSAGES,
  conflictField,
  toEditVehicleInput,
  vehicleFormSchema,
  vehicleToFormValues,
  type VehicleFormValues,
} from "@/app/(dashboard)/vehicles/vehicle-form-schema";

/** Read the API error status (apiClient throws { status, message, code }). */
function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // RF-5: once the prefilled catalog cascade is resolved, user edits take over.
  const prefillDoneRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Pre-carga (RF-5): GET /api/vehicles/:id → VehicleResponseDto desnormalizado.
  // retry:false — un 404/403 nunca se resuelve reejecutando la query.
  // ---------------------------------------------------------------------------
  const vehicleQuery = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => vehicleApi.getVehicle(id),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
  });

  // Prefill text fields once the vehicle is loaded (RF-5).
  useEffect(() => {
    if (vehicleQuery.data) {
      reset(vehicleToFormValues(vehicleQuery.data));
    }
  }, [vehicleQuery.data, reset]);

  // Catalog cascade (D-038): brands on mount; models/versions on demand (RF-4).
  const brandsQuery = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: vehicleApi.listBrands,
  });

  const modelsQuery = useQuery({
    queryKey: ["vehicle-models", selectedBrandId],
    queryFn: () => vehicleApi.listModels(selectedBrandId),
    enabled: selectedBrandId !== "",
  });

  const versionsQuery = useQuery({
    queryKey: ["vehicle-versions", selectedModelId],
    queryFn: () => vehicleApi.listVersions(selectedModelId),
    enabled: selectedModelId !== "",
  });

  // ---------------------------------------------------------------------------
  // Pre-selección de la cascada a partir del detalle desnormalizado (RF-5).
  // El backend NO expone brandId/modelId en VehicleResponseDto, solo los nombres
  // (brand/model/version) + versionId. Por eso emparejamos por nombre, con
  // fallback a "Seleccionar" si el catálogo cambió y ya no matchea.
  // ---------------------------------------------------------------------------
  const vehicle = vehicleQuery.data;

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    // Sin catálogo → no hay nada que preseleccionar (D-038).
    if (vehicle.versionId == null) {
      prefillDoneRef.current = true;
      return;
    }
    if (!selectedBrandId && brandsQuery.data) {
      const brand = brandsQuery.data.find(
        (b) => b.name.toLowerCase() === vehicle.brand?.toLowerCase(),
      );
      if (brand) setSelectedBrandId(brand.id);
    }
  }, [vehicle, brandsQuery.data, selectedBrandId]);

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    if (!selectedBrandId || selectedModelId || !modelsQuery.data) return;
    const model = modelsQuery.data.find(
      (m) => m.name.toLowerCase() === vehicle.model?.toLowerCase(),
    );
    if (model) setSelectedModelId(model.id);
  }, [vehicle, selectedBrandId, modelsQuery.data, selectedModelId]);

  useEffect(() => {
    if (!vehicle || prefillDoneRef.current) return;
    if (!selectedModelId || selectedVersionId || !versionsQuery.data) return;
    const version =
      versionsQuery.data.find((v) => v.id === vehicle.versionId) ??
      versionsQuery.data.find(
        (v) => v.name.toLowerCase() === vehicle.version?.toLowerCase(),
      );
    if (version) {
      setSelectedVersionId(version.id);
      prefillDoneRef.current = true;
    }
  }, [vehicle, selectedModelId, versionsQuery.data, selectedVersionId]);

  const handleBrandChange = (value: string) => {
    setSelectedBrandId(value);
    setSelectedModelId("");
    setSelectedVersionId("");
  };

  const handleModelChange = (value: string) => {
    setSelectedModelId(value);
    setSelectedVersionId("");
  };

  const onSubmit = async (data: VehicleFormValues) => {
    setSubmitError(null);
    // El form solo se renderiza con la precarga resuelta (RF-5); guard defensivo.
    if (!vehicleQuery.data) return;
    try {
      // D-040/D-043 (RF-8): PATCH parcial. toEditVehicleInput compara con el
      // prefill — opcionales vaciados → null explícito; ya vacíos → omitidos;
      // con valor → valor. versionId solo viaja si cambió (NUNCA null, RF-2).
      await vehicleApi.updateVehicle(
        id,
        toEditVehicleInput(vehicleQuery.data, data, selectedVersionId),
      );

      // RF-7: invalidar el listado y redirigir (mismo patrón que alta).
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      router.push("/vehicles");
    } catch (error) {
      const apiError = error as {
        status?: number;
        message?: string;
        code?: string;
      };

      // RF-6/D-041: 409 → mensaje junto al campo (placa/VIN) o general
      // (engineNumber); los valores del formulario se conservan.
      if (apiError.status === 409) {
        const field = conflictField(apiError.message);
        if (field === "licensePlate" || field === "vin") {
          setError(field, {
            type: "conflict",
            message: CONFLICT_MESSAGES[field],
          });
        } else if (field === "engineNumber") {
          setSubmitError(CONFLICT_MESSAGES.engineNumber);
        } else {
          setSubmitError(
            apiError.message ||
              "Ya existe un vehículo registrado con esos datos.",
          );
        }
        return;
      }

      if (apiError.status === 403) {
        setSubmitError("No tenés permiso para editar este vehículo.");
        return;
      }

      if (apiError.status === 401) {
        setSubmitError("Tu sesión expiró. Iniciá sesión nuevamente.");
        return;
      }

      if (apiError.status === 404) {
        setSubmitError("El vehículo no existe.");
        return;
      }

      if (apiError.status && apiError.status >= 500) {
        setSubmitError("Error interno del servidor. Intentalo nuevamente.");
        return;
      }

      setSubmitError(
        apiError.message || "Error al editar el vehículo. Intentalo nuevamente.",
      );
    }
  };

  // Loading (precarga del form).
  if (vehicleQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // RF-6: error de precarga.
  if (vehicleQuery.isError) {
    const status = errorStatus(vehicleQuery.error);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 404 ? (
              <>
                <p className="text-lg font-semibold">Vehículo no encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El vehículo que intentás editar no existe o fue eliminado.
                </p>
              </>
            ) : status === 403 ? (
              <>
                <p className="text-lg font-semibold">
                  No tenés permiso para editar este vehículo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Solo el propietario puede editar un vehículo en MVP (D-039).
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  No se pudo cargar el vehículo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ocurrió un error al consultar el vehículo. Intentalo
                  nuevamente.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/vehicles">
                <Button variant="outline">Volver a mis vehículos</Button>
              </Link>
              {status !== 404 && status !== 403 && (
                <Button onClick={() => vehicleQuery.refetch()}>
                  Reintentar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a mis vehículos
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Editar vehículo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Corregí los datos del vehículo. Solo el propietario puede editar
          (D-039).
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="licensePlate">Placa</Label>
              <Input
                id="licensePlate"
                placeholder="Ej. ABC123"
                maxLength={10}
                autoComplete="off"
                aria-invalid={!!errors.licensePlate}
                {...register("licensePlate")}
              />
              {errors.licensePlate && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.licensePlate.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vin">VIN (opcional)</Label>
              <Input
                id="vin"
                placeholder="Número de chasis"
                autoComplete="off"
                aria-invalid={!!errors.vin}
                {...register("vin")}
              />
              {errors.vin ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.vin.message}
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Completar el VIN mejora la trazabilidad de la historia del
                  vehículo (D-036).
                </p>
              )}
            </div>

            <div className="grid gap-3">
              <div>
                <p className="text-sm font-medium">
                  Catálogo vehicular (opcional)
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Si no se modifica, se mantiene la versión del catálogo
                  actual. Si se vacía, la versión existente no se borra (RF-2).
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="brand">Marca</Label>
                  <Select
                    id="brand"
                    value={selectedBrandId}
                    onChange={(event) => handleBrandChange(event.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    {brandsQuery.data?.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                  {brandsQuery.isError && (
                    <p className="text-xs text-muted-foreground" role="alert">
                      No se pudo cargar el catálogo. Podés guardar sin
                      marca/modelo/versión.
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="model">Modelo</Label>
                  <Select
                    id="model"
                    value={selectedModelId}
                    onChange={(event) => handleModelChange(event.target.value)}
                    disabled={!selectedBrandId || modelsQuery.isLoading}
                  >
                    <option value="">
                      {modelsQuery.isLoading ? "Cargando..." : "Seleccionar"}
                    </option>
                    {modelsQuery.data?.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="version">Versión</Label>
                  <Select
                    id="version"
                    value={selectedVersionId}
                    onChange={(event) => setSelectedVersionId(event.target.value)}
                    disabled={!selectedModelId || versionsQuery.isLoading}
                  >
                    <option value="">
                      {versionsQuery.isLoading ? "Cargando..." : "Seleccionar"}
                    </option>
                    {versionsQuery.data?.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="manufactureYear">
                  Año de fabricación (opcional)
                </Label>
                <Input
                  id="manufactureYear"
                  inputMode="numeric"
                  placeholder="Ej. 2020"
                  maxLength={4}
                  autoComplete="off"
                  aria-invalid={!!errors.manufactureYear}
                  {...register("manufactureYear")}
                />
                {errors.manufactureYear && (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.manufactureYear.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="modelYear">Año del modelo (opcional)</Label>
                <Input
                  id="modelYear"
                  inputMode="numeric"
                  placeholder="Ej. 2021"
                  maxLength={4}
                  autoComplete="off"
                  aria-invalid={!!errors.modelYear}
                  {...register("modelYear")}
                />
                {errors.modelYear && (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.modelYear.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="color">Color (opcional)</Label>
              <Input
                id="color"
                placeholder="Ej. Rojo"
                autoComplete="off"
                {...register("color")}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Observaciones adicionales..."
                rows={3}
                {...register("notes")}
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}