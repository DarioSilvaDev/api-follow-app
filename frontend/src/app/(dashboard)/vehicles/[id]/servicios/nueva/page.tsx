"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  Eye,
  ImagePlus,
  Loader2,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveContext } from "@/hooks/use-active-context";
import { useDebounce } from "@/hooks/use-debounce";
import { careEpisodeApi, workshopApi } from "@/lib/api";
import {
  ATTACHMENT_VALIDATION_MESSAGES,
  validateAttachmentFiles,
} from "@/lib/attachment-validation";
import { CARE_EPISODE_ATTACHMENT_LIMITS } from "@/types/care-episode";
import type { WorkshopSearchResult } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Iteración 2-2 / RF-8 — "Registrar servicio" (propietario, contexto PERSONAL).
// Journey: formulario del servicio histórico → taller responsable (búsqueda en
// la app con debounce **o** texto libre "Otro taller", XOR D-066) →
// POST /api/care-episodes/owner (spec 2-2 §5, RF-1).
//
// WORKSHOP-only al revés: si hay un taller seleccionado, el backend responde
// 403 (el handler exige ctx.type === 'PERSONAL'); la página orienta a volver a
// "Personal" (mismo patrón de orientación que /atenciones/nueva).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MESSAGE =
  "Demasiadas solicitudes. Esperá unos segundos e intentá de nuevo.";

/** Fecha local `YYYY-MM-DD` (el input type=date trabaja en hora local). */
function todayISOLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Comparación lexicográfica válida para fechas ISO `YYYY-MM-DD`. */
function isFutureDate(value: string): boolean {
  return value > todayISOLocal();
}

const ownerServiceSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio")
    .max(120, "El título no puede superar los 120 caracteres"),
  serviceDate: z
    .string()
    .min(1, "La fecha del servicio es obligatoria")
    .refine((value) => !isFutureDate(value), "La fecha no puede ser futura"),
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
  notes: z
    .string()
    .trim()
    .max(1000, "Las notas no pueden superar los 1000 caracteres")
    .optional(),
  workshopName: z
    .string()
    .trim()
    .max(150, "El nombre del taller no puede superar los 150 caracteres")
    .optional(),
});

type OwnerServiceFormValues = z.infer<typeof ownerServiceSchema>;

type WorkshopMode = "search" | "other";

export default function OwnerServiceFormPage() {
  const { id: vehicleId } = useParams<{ id: string }>();
  const activeContext = useActiveContext();

  // El journey del propietario es PERSONAL-only (RF-1): con un taller
  // seleccionado el POST /care-episodes/owner respondería 403.
  if (activeContext?.type === "WORKSHOP") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading vehicleId={vehicleId} />
        <Card>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Para registrar un servicio como propietario necesitás operar en
              tu contexto personal. Volvé a "Personal" en el selector del
              header y reintentá.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OwnerServiceForm vehicleId={vehicleId} />;
}

function OwnerServiceForm({ vehicleId }: { vehicleId: string }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OwnerServiceFormValues>({
    resolver: zodResolver(ownerServiceSchema),
  });

  // ── Taller responsable (XOR D-066) ────────────────────────────────────────
  const [workshopMode, setWorkshopMode] = useState<WorkshopMode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 400);
  const [selectedWorkshop, setSelectedWorkshop] =
    useState<WorkshopSearchResult | null>(null);
  const [workshopError, setWorkshopError] = useState<string | null>(null);

  const trimmedQuery = debouncedQuery.trim();

  const searchQueryResult = useQuery({
    queryKey: ["workshops-search", trimmedQuery],
    queryFn: () => workshopApi.searchWorkshops(trimmedQuery),
    enabled:
      workshopMode === "search" &&
      selectedWorkshop === null &&
      trimmedQuery.length >= 2,
    retry: false,
  });

  const selectResult = (result: WorkshopSearchResult) => {
    setSelectedWorkshop(result);
    setSearchQuery("");
    setWorkshopError(null);
  };

  const clearSelection = () => {
    setSelectedWorkshop(null);
    setWorkshopError(null);
  };

  const switchMode = (mode: WorkshopMode) => {
    setWorkshopMode(mode);
    setWorkshopError(null);
    clearSelection();
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdWorkshopLabel, setCreatedWorkshopLabel] = useState<
    string | null
  >(null);
  const [retry, setRetry] = useState<{
    data: OwnerServiceFormValues;
    workshopId?: string;
    workshopName?: string;
  } | null>(null);

  // ── Evidencia opcional (S6, iteración 2-4) ────────────────────────────────
  // Multipart EN LA CREACIÓN (POST /care-episodes/owner con files): es una
  // transacción única (episodio + adjuntos), el camino preferido por el
  // contrato. Sin files → path JSON histórico intacto.
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceProgress, setEvidenceProgress] = useState<number | null>(null);
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);

  const handleEvidenceFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const node = event.target;
    const files = node.files;
    node.value = "";
    if (!files) return;
    const batch = Array.from(files);
    // El límite de lote del owner create (FilesInterceptor MAX 5) es por
    // servicio, no por selección → validar contra lo ya acumulado.
    if (
      evidenceFiles.length + batch.length >
      CARE_EPISODE_ATTACHMENT_LIMITS.maxBatch
    ) {
      setEvidenceError(ATTACHMENT_VALIDATION_MESSAGES.batch);
      return;
    }
    const result = validateAttachmentFiles(batch, 0);
    if (!result.ok) {
      setEvidenceError(result.message);
      return;
    }
    setEvidenceError(null);
    setEvidenceFiles((prev) => [...prev, ...result.files]);
  };

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Modal de confirmación (D-074) ────────────────────────────────────────
  // El POST solo se dispara al confirmar el modal; "Cancelar" lo descarta y
  // el form queda editable sin llamada de red.
  const [confirmPending, setConfirmPending] = useState<{
    data: OwnerServiceFormValues;
    workshopId?: string;
    workshopName?: string;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  const mapSubmitError = (error: unknown): string | null => {
    const apiError = error as { status?: number; message?: string };
    if (apiError.status === 400) {
      return (
        "Revisá los datos: la fecha no puede ser futura y solo podés indicar " +
        "un taller (seleccionado de la app o por texto libre, no ambos)."
      );
    }
    if (apiError.status === 404) {
      return "El vehículo o el taller seleccionado ya no está disponible.";
    }
    if (apiError.status === 403) {
      return (
        "No tenés permisos para registrar servicios de este vehículo: " +
        "debe ser el propietario."
      );
    }
    if (apiError.status === 429) {
      return RATE_LIMIT_MESSAGE;
    }
    if (apiError.status && apiError.status >= 500) {
      return "Error interno del servidor. Intentalo nuevamente.";
    }
    return (
      apiError.message || "No se pudo registrar el servicio. Intentalo nuevamente."
    );
  };

  const submitOwnerService = async (
    data: OwnerServiceFormValues,
    workshop: { workshopId?: string; workshopName?: string },
  ) => {
    setSubmitError(null);
    setWorkshopError(null);
    setEvidenceProgress(null);
    try {
      const commonInput = {
        vehicleId,
        title: data.title,
        serviceDate: data.serviceDate,
        ...(workshop.workshopId ? { workshopId: workshop.workshopId } : {}),
        ...(workshop.workshopName ? { workshopName: workshop.workshopName } : {}),
        mileageIn: data.mileageIn ? Number(data.mileageIn) : undefined,
        notes: data.notes || undefined,
      };

      // S6: con archivos → multipart transaccional (episodio + evidencia).
      // Sin archivos → path JSON histórico idéntico al de la iteración 2-2.
      let createdId: string;
      if (evidenceFiles.length > 0) {
        const created = await careEpisodeApi.createOwnerCareEpisodeWithFiles(
          commonInput,
          evidenceFiles,
          undefined,
          setEvidenceProgress,
        );
        createdId = created.id;
      } else {
        const created = await careEpisodeApi.createOwnerCareEpisode(commonInput);
        createdId = created.id;
      }

      setCreatedServiceId(createdId);
      setCreatedWorkshopLabel(
        workshop.workshopName ||
          selectedWorkshop?.name ||
          "el taller seleccionado",
      );
      setRetry(null);
    } catch (error) {
      const message = mapSubmitError(error);
      setSubmitError(message);
      if ((error as { status?: number }).status === 429) {
        setRetry({ data, ...workshop });
      } else {
        setRetry(null);
      }
    }
  };

  const onSubmit = (data: OwnerServiceFormValues) => {
    let workshopId: string | undefined;
    let workshopName: string | undefined;

    if (workshopMode === "search") {
      if (!selectedWorkshop) {
        setWorkshopError(
          "Buscá y seleccioná un taller, o elegí la opción \"Otro taller\".",
        );
        return;
      }
      workshopId = selectedWorkshop.id;
    } else {
      const name = data.workshopName?.trim();
      if (!name) {
        setWorkshopError(
          "Ingresá el nombre del taller, o buscá un taller en la app.",
        );
        return;
      }
      workshopName = name;
    }

    // XOR defensivo (D-066): nunca enviar ambos campos.
    if (workshopId && workshopName) {
      setWorkshopError(
        "Indicá un solo taller: seleccionado de la app o por texto libre.",
      );
      return;
    }

    // D-074: antes de enviar el POST, mostrar el modal de confirmación.
    setConfirmPending({ data, workshopId, workshopName });
  };

  const handleConfirm = async () => {
    if (!confirmPending || confirmSubmitting) return;
    setConfirmSubmitting(true);
    try {
      await submitOwnerService(confirmPending.data, {
        workshopId: confirmPending.workshopId,
        workshopName: confirmPending.workshopName,
      });
    } finally {
      setConfirmSubmitting(false);
      setConfirmPending(null);
    }
  };

  const handleCancelConfirm = () => {
    if (confirmSubmitting) return;
    setConfirmPending(null);
  };

  const handleRetry = async () => {
    if (!retry) return;
    await submitOwnerService(retry.data, {
      workshopId: retry.workshopId,
      workshopName: retry.workshopName,
    });
  };

  const resetAfterSuccess = () => {
    reset();
    setCreatedWorkshopLabel(null);
    setSubmitError(null);
    setWorkshopError(null);
    clearSelection();
    setWorkshopMode("search");
    setEvidenceFiles([]);
    setEvidenceError(null);
    setEvidenceProgress(null);
    setCreatedServiceId(null);
  };

  // ── Estado de éxito ───────────────────────────────────────────────────────
  if (createdWorkshopLabel) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Heading vehicleId={vehicleId} />
        <Card>
          <CardContent className="grid gap-3">
            <p role="status" className="text-sm font-medium text-primary">
              Servicio registrado
            </p>
            {createdServiceId && (
              <Link
                href={`/vehicles/${vehicleId}/servicios/${createdServiceId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <Eye className="h-4 w-4" />
                Ver detalle del servicio
              </Link>
            )}
            <p className="text-sm text-muted-foreground">
              Quedará como "Registrado por el propietario" hasta que{" "}
              {createdWorkshopLabel} lo verifique.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={resetAfterSuccess} variant="outline">
              Registrar otro
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Heading vehicleId={vehicleId} />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título del servicio</Label>
              <Input
                id="title"
                placeholder="Ej. Cambio de aceite + 2 neumáticos"
                maxLength={120}
                autoComplete="off"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="serviceDate">Fecha del servicio</Label>
              <Input
                id="serviceDate"
                type="date"
                max={todayISOLocal()}
                aria-invalid={!!errors.serviceDate}
                {...register("serviceDate")}
              />
              {errors.serviceDate ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.serviceDate.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Puede ser una fecha pasada (histórico). No puede ser futura.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mileageIn">Kilometraje (opcional)</Label>
              <Input
                id="mileageIn"
                inputMode="numeric"
                placeholder="Ej. 18500"
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
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Ej. Aceite 5W30, dos neumáticos delanteros..."
                rows={3}
                maxLength={1000}
                aria-invalid={!!errors.notes}
                {...register("notes")}
              />
              {errors.notes ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.notes.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Máximo 1000 caracteres.
                </p>
              )}
            </div>

            {/* Evidencia opcional (S6 — multipart en la creación) */}
            <div className="grid gap-2 rounded-lg ring-1 ring-foreground/10 p-3">
              <div>
                <p className="text-sm font-medium">Evidencia (opcional)</p>
                <p className="text-xs text-muted-foreground">
                  Podés adjuntar hasta 5 fotos (JPG, PNG, WebP o AVIF, máx. 5MB
                  c/u). Se guardarán como evidencia en el historial del
                  vehículo.
                </p>
              </div>

              {evidenceFiles.length > 0 ? (
                <ul className="grid gap-1.5">
                  {evidenceFiles.map((file, index) => (
                    <li
                      key={`${file.name}:${file.size}`}
                      data-testid={`evidence-file-${file.name}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar ${file.name}`}
                        disabled={isSubmitting}
                        onClick={() => removeEvidenceFile(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {evidenceProgress !== null && evidenceFiles.length > 0 && (
                <p role="status" className="text-xs text-muted-foreground">
                  Subiendo evidencia {evidenceProgress}%...
                </p>
              )}
              {evidenceError && (
                <p className="text-sm text-destructive" role="alert">
                  {evidenceError}
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={isSubmitting}
                onClick={() => evidenceInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {evidenceFiles.length > 0
                  ? "Agregar más fotos"
                  : "Adjuntar fotos"}
              </Button>
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                data-testid="owner-evidence-input"
                aria-label="Adjuntar imágenes de evidencia"
                onChange={handleEvidenceFiles}
              />
            </div>

            {/* Taller responsable (XOR D-066) */}
            <div className="grid gap-3 rounded-lg ring-1 ring-foreground/10 p-3">
              <div>
                <p className="text-sm font-medium">Taller responsable</p>
                <p className="text-xs text-muted-foreground">
                  El taller que realizó el trabajo. Si está en la app, lo verá
                  en su cola de verificaciones y podrá confirmarlo.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={workshopMode === "search" ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode("search")}
                >
                  Buscar en la app
                </Button>
                <Button
                  type="button"
                  variant={workshopMode === "other" ? "default" : "outline"}
                  size="sm"
                  onClick={() => switchMode("other")}
                >
                  Otro taller
                </Button>
              </div>

              {workshopMode === "search" && (
                <div className="grid gap-2">
                  {selectedWorkshop ? (
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2.5"
                      data-testid="workshop-selected"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {selectedWorkshop.name}
                        </p>
                        {selectedWorkshop.city && (
                          <p className="truncate text-xs text-muted-foreground">
                            {selectedWorkshop.city}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                      >
                        Cambiar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Label htmlFor="workshop-search">
                        Buscar taller por nombre (mínimo 2 caracteres)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="workshop-search"
                          placeholder="Ej. Lubricentro"
                          maxLength={50}
                          autoComplete="off"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        {searchQueryResult.isFetching ? (
                          <Button type="button" variant="outline" disabled>
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            aria-label="Buscar taller"
                            disabled={trimmedQuery.length < 2}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {trimmedQuery.length < 2 ? (
                        <p className="text-xs text-muted-foreground">
                          Escribí al menos 2 caracteres para buscar.
                        </p>
                      ) : searchQueryResult.isLoading ? (
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          Buscando talleres...
                        </p>
                      ) : searchQueryResult.data &&
                        searchQueryResult.data.length > 0 ? (
                        <ul className="grid gap-1">
                          {searchQueryResult.data.map((result) => (
                            <li key={result.id}>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start text-left"
                                onClick={() => selectResult(result)}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {result.name}
                                  </span>
                                  {result.city && (
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {result.city}
                                    </span>
                                  )}
                                </span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : searchQueryResult.isError ? (
                        <SearchErrorPanel
                          status={
                            (searchQueryResult.error as { status?: number })
                              .status
                          }
                          onRetry={() => void searchQueryResult.refetch()}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No se encontraron talleres con ese nombre. Podés
                          elegir "Otro taller" y escribirlo como texto libre.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {workshopMode === "other" && (
                <div className="grid gap-2">
                  <Label htmlFor="workshopName">
                    Nombre del taller (texto libre)
                  </Label>
                  <Input
                    id="workshopName"
                    placeholder="Ej. Taller de la esquina"
                    maxLength={150}
                    autoComplete="off"
                    aria-invalid={!!errors.workshopName}
                    {...register("workshopName")}
                  />
                  {errors.workshopName && (
                    <p className="text-sm text-destructive" role="alert">
                      {errors.workshopName.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Quedará sin verificación posible hasta que ese taller se
                    registre y lo reclame (fuera de alcance MVP).
                  </p>
                </div>
              )}

              {workshopError && (
                <p className="text-sm text-destructive" role="alert">
                  {workshopError}
                </p>
              )}
            </div>

            {submitError && (
              <div className="grid gap-2" role="alert">
                <p className="text-sm text-destructive">{submitError}</p>
                {retry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetry()}
                  >
                    Reintentar
                  </Button>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar servicio"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* D-074: modal de confirmación antes del POST /care-episodes/owner.
          Vive fuera del <form> para no anidar botones dentro del form. */}
      {confirmPending && (
        <ConfirmServiceModal
          evidenceCount={evidenceFiles.length}
          isSubmitting={confirmSubmitting}
          onCancel={handleCancelConfirm}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </div>
  );
}

function Heading({ vehicleId }: { vehicleId: string }) {
  return (
    <div>
      <Link
        href={`/vehicles/${vehicleId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al vehículo
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        Registrar servicio
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registrá un servicio histórico realizado sobre este vehículo.
      </p>
    </div>
  );
}

function SearchErrorPanel({
  status,
  onRetry,
}: {
  status?: number;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-2" role="alert">
      <p className="text-sm text-destructive">
        {status === 429
          ? RATE_LIMIT_MESSAGE
          : "No se pudo buscar talleres. Intentalo nuevamente."}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" />
        Reintentar
      </Button>
    </div>
  );
}

/**
 * D-074: modal de confirmación del registro de servicio (owner).
 *
 * Texto EXACTO aprobado (spec 2-3 §4 / D-074). "Cancelar" descarta el modal
 * sin llamada de red (el form queda editable); "Confirmar" dispara el
 * `POST /api/care-episodes/owner` con los datos del form.
 *
 * D-074A (iteración 2-4): cuando el form tiene archivos de evidencia, se
 * suma una segunda oración aclarando que viajan con el registro. [COPY POR
 * CONFIRMAR CON PM — propuesta FE, ver reporte.]
 */
function ConfirmServiceModal({
  evidenceCount,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  evidenceCount: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel}
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-service-title"
        className="relative w-full max-w-md"
      >
        <CardContent className="grid gap-4 pt-6">
          <p id="confirm-service-title" className="text-sm">
            No podrás editar ni cancelar este registro desde tu cuenta. Solo el
            taller asignado podrá gestionarlo. ¿Confirmás el registro?
          </p>
          {evidenceCount > 0 && (
            <p className="text-sm text-muted-foreground" role="status">
              {evidenceCount === 1
                ? "Se adjuntará 1 foto como evidencia en el historial del vehículo."
                : `Se adjuntarán ${evidenceCount} fotos como evidencia en el historial del vehículo.`}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}