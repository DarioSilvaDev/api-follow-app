"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
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
import { useAuth } from "@/hooks/use-auth";
import { vehicleApi } from "@/lib/api";
import type { RegisterVehicleInput } from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Client-side validation (mirror of the backend DTO, F-010 §9)
// D-037: alphanumeric plate 2–10, normalized to uppercase + trim.
// D-036: VIN optional. D-038: catalog optional.
// ---------------------------------------------------------------------------

const vehicleFormSchema = z.object({
  licensePlate: z
    .string()
    .trim()
    .min(2, "La placa debe tener al menos 2 caracteres")
    .max(10, "La placa debe tener como máximo 10 caracteres")
    .refine(
      (value) => /^[a-zA-Z0-9]+$/.test(value),
      "La placa solo puede contener letras y números",
    )
    .transform((value) => value.toUpperCase()),
  vin: z.string().trim().optional(),
  manufactureYear: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}$/.test(value),
      "El año de fabricación debe ser un año válido (ej. 2020)",
    )
    .refine(
      (value) =>
        value === "" || (Number(value) >= 1900 && Number(value) <= 2100),
      "El año de fabricación debe estar entre 1900 y 2100",
    )
    .optional(),
  modelYear: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}$/.test(value),
      "El año del modelo debe ser un año válido (ej. 2020)",
    )
    .refine(
      (value) =>
        value === "" || (Number(value) >= 1900 && Number(value) <= 2100),
      "El año del modelo debe estar entre 1900 y 2100",
    )
    .optional(),
  color: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

/** Build the API payload, dropping empty optional fields (undefined omitted). */
function toRegisterInput(
  data: VehicleFormValues,
  versionId: string,
): RegisterVehicleInput {
  return {
    licensePlate: data.licensePlate,
    vin: data.vin || undefined,
    versionId: versionId || undefined,
    manufactureYear: data.manufactureYear
      ? Number(data.manufactureYear)
      : undefined,
    modelYear: data.modelYear ? Number(data.modelYear) : undefined,
    color: data.color || undefined,
    notes: data.notes || undefined,
  };
}

/**
 * Map a 409 CONFLICT message to the offending field (RF-3, RF-6).
 * Backend messages (F-010 §5): plate "Vehicle with plate 'X' already exists";
 * VIN/engineNumber specifc messages are a backend robustness adjustment (§9).
 */
function conflictField(
  message?: string,
): "licensePlate" | "vin" | "engineNumber" | null {
  const text = (message ?? "").toLowerCase();
  if (text.includes("placa") || text.includes("plate")) return "licensePlate";
  if (text.includes("vin")) return "vin";
  if (text.includes("motor") || text.includes("engine")) return "engineNumber";
  return null;
}

const CONFLICT_MESSAGES = {
  licensePlate: "Ya existe un vehículo registrado con esa placa.",
  vin: "Ya existe un vehículo registrado con ese VIN.",
  engineNumber: "Ya existe un vehículo registrado con ese número de motor.",
} as const;

export default function NewVehiclePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();

  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
  });

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
    try {
      await vehicleApi.registerVehicle(toRegisterInput(data, selectedVersionId));

      // RF-7: force the list to refetch and refresh the session so the
      // dashboard reflects isVehicleOwner.
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      try {
        await refreshSession();
      } catch {
        // Best-effort: stale session data is not fatal for the redirect
      }
      router.push("/vehicles");
    } catch (error) {
      const apiError = error as {
        status?: number;
        message?: string;
        code?: string;
      };

      // RF-6: 409 → clear field-level message, form values are preserved.
      if (apiError.status === 409) {
        const field = conflictField(apiError.message);
        if (field === "licensePlate" || field === "vin") {
          setError(field, {
            type: "conflict",
            message: CONFLICT_MESSAGES[field],
          });
        } else if (field === "engineNumber") {
          // Field not present in the MVP form; surface as a general error.
          setSubmitError(CONFLICT_MESSAGES.engineNumber);
        } else {
          setSubmitError(
            apiError.message ||
              "Ya existe un vehículo registrado con esos datos.",
          );
        }
        return;
      }

      if (apiError.status === 401) {
        setSubmitError("Tu sesión expiró. Iniciá sesión nuevamente.");
        return;
      }

      if (apiError.status && apiError.status >= 500) {
        setSubmitError("Error interno del servidor. Intentalo nuevamente.");
        return;
      }

      setSubmitError(
        apiError.message || "Error al registrar el vehículo. Intentalo nuevamente.",
      );
    }
  };

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
          Registrar vehículo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completá los datos del vehículo. Los campos opcionales pueden dejarse
          vacíos.
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
                  Si seleccionás marca, modelo y versión, el vehículo se guarda
                  con esos datos del catálogo (D-038).
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
                      No se pudo cargar el catálogo. Podés registrarlo sin
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
                  Registrando...
                </>
              ) : (
                "Registrar vehículo"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}