"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  RotateCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { vehicleApi } from "@/lib/api";
import type {
  Vehicle,
  VehicleDocument,
  VehiclePhoto,
} from "@/types/vehicle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mismo mecanismo que el listado (D-039 / RF-1): owner = ownership activa
 *  (endsAt null) con type "owner" y userId = usuario actual. */
function isVehicleOwner(vehicle: Vehicle, userId: string | undefined): boolean {
  if (!userId) return false;
  return (
    vehicle.ownerships?.some(
      (o) => o.userId === userId && o.type === "owner" && !o.endsAt,
    ) ?? false
  );
}

function errorStatus(error: unknown): number | undefined {
  return (error as { status?: number }).status;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MILEAGE_SOURCE_LABELS: Record<string, string> = {
  owner: "Propietario",
  workshop: "Taller",
  inspection: "Inspección",
  dealership: "Concesionaria",
  imported: "Importado",
  system: "Sistema",
};

function mileageSourceLabel(source?: string | null): string {
  if (!source) return "—";
  return MILEAGE_SOURCE_LABELS[source] ?? source;
}

/** Detección de imagen por extensión del key (el schema NO expone mimeType). */
function isImageDocument(doc: VehicleDocument): boolean {
  return /\.(jpe?g|png|webp|avif)$/i.test(doc.key);
}

// ---------------------------------------------------------------------------
// Comisión: Cards verticales — Ficha / Fotos / Documentos / Kilometraje
// ---------------------------------------------------------------------------

function FichaCard({ vehicle }: { vehicle: Vehicle }) {
  const activeOwnership =
    vehicle.ownerships?.find((o) => o.type === "owner" && !o.endsAt) ?? null;

  const ownerDisplayName = activeOwnership?.user
    ? [activeOwnership.user.firstName, activeOwnership.user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Propietario registrado"
    : "Propietario registrado";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha del vehículo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Marca / modelo / versión</p>
          <p className="font-medium">
            {[vehicle.brand, vehicle.model, vehicle.version]
              .filter((part): part is string => Boolean(part && part.trim()))
              .join(" ") || "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Años</p>
          <p className="font-medium">
            {[vehicle.manufactureYear, vehicle.modelYear]
              .filter((year): year is number => typeof year === "number")
              .join(" / ") || "—"}
          </p>
        </div>
        {vehicle.color ? (
          <div>
            <p className="text-muted-foreground">Color</p>
            <p className="font-medium">{vehicle.color}</p>
          </div>
        ) : null}
        {vehicle.vin ? (
          <div>
            <p className="text-muted-foreground">VIN</p>
            <p className="font-medium">{vehicle.vin}</p>
          </div>
        ) : null}
        {vehicle.engineNumber ? (
          <div>
            <p className="text-muted-foreground">Número de motor</p>
            <p className="font-medium">{vehicle.engineNumber}</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Notas</p>
          <p className="font-medium whitespace-pre-wrap">
            {vehicle.notes?.trim() || "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Titular actual</p>
          {/* RF-2: sin exposición de PII innecesaria — solo nombre/apellido
              (el email lo controla el backend y NO se muestra). */}
          <p className="font-medium">{ownerDisplayName}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PhotosSection({
  vehicleId,
  canWrite,
  photos,
  isLoading,
  isError,
  refetch,
}: {
  vehicleId: string;
  canWrite: boolean;
  photos: VehiclePhoto[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId, "photos"] });

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => vehicleApi.uploadPhoto(vehicleId, file),
    onSuccess: () => {
      setUploadError(null);
      invalidate();
    },
  });

  const setPrimary = useMutation({
    mutationFn: (photoId: string) =>
      vehicleApi.setPrimaryPhoto(vehicleId, photoId),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => vehicleApi.deletePhoto(vehicleId, photoId),
    onSuccess: invalidate,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadPhoto.mutate(file, {
      onError: (error) => {
        const status = errorStatus(error);
        if (status === 400) {
          setUploadError(
            "El archivo no es una imagen válida (JPG, PNG, WebP o AVIF) o supera los 10MB.",
          );
        } else if (status === 403) {
          setUploadError("No tenés permiso para modificar las fotos de este vehículo.");
        } else {
          setUploadError("No se pudo subir la foto. Intentalo nuevamente.");
        }
      },
    });
  };

  const handleDelete = (photo: VehiclePhoto) => {
    if (!window.confirm("¿Eliminar esta foto?")) return;
    remove.mutate(photo.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotos</CardTitle>
        <CardDescription>
          {photos.length > 0
            ? `${photos.length} ${photos.length === 1 ? "foto" : "fotos"} — la foto principal se muestra primero.`
            : "Documentá visualmente el vehículo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudieron cargar las fotos.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        ) : photos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Todavía no hay fotos de este vehículo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="relative overflow-hidden rounded-lg ring-1 ring-foreground/10"
              >
                {photo.url ? (
                  // Signed R2 URL (batch ?signed=true). Al no conocer el host al
                  // build-time usamos <img> nativo (sin next/image) — aceptable
                  // para un set limitado de fotos (D-047 MVP).
                  <img
                    src={photo.url}
                    alt={photo.caption ?? "Foto del vehículo"}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-muted/40">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                {photo.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-primary/90 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
                    Principal
                  </span>
                )}
                {canWrite && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/80 p-1.5 backdrop-blur-sm">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label="Establecer como principal"
                      title="Establecer como principal"
                      disabled={photo.isPrimary || setPrimary.isPending}
                      onClick={() => setPrimary.mutate(photo.id)}
                    >
                      <Star
                        className={
                          photo.isPrimary
                            ? "fill-foreground text-foreground"
                            : ""
                        }
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-label="Eliminar foto"
                      title="Eliminar foto"
                      disabled={remove.isPending}
                      onClick={() => handleDelete(photo)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-destructive" role="alert">
            {uploadError}
          </p>
        )}

        {canWrite && (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={uploadPhoto.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadPhoto.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Subir foto
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DocumentsSection({
  vehicleId,
  canWrite,
  documents,
  isLoading,
  isError,
  refetch,
}: {
  vehicleId: string;
  canWrite: boolean;
  documents: VehicleDocument[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editExpiry, setEditExpiry] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["vehicle", vehicleId, "documents"],
    });

  const upload = useMutation({
    mutationFn: (args: { file: File; name: string; documentType: string; expiresAt?: string }) =>
      vehicleApi.uploadDocument(vehicleId, args.file, {
        name: args.name,
        documentType: args.documentType,
        expiresAt: args.expiresAt || undefined,
      }),
    onSuccess: () => {
      setUploadError(null);
      setUploadFile(null);
      setUploadName("");
      setUploadType("");
      setUploadExpiry("");
      setShowUpload(false);
      invalidate();
    },
  });

  const updateDoc = useMutation({
    mutationFn: (args: { docId: string; name: string; documentType: string; expiresAt?: string | null }) =>
      vehicleApi.updateDocument(vehicleId, args.docId, {
        name: args.name,
        documentType: args.documentType,
        expiresAt: args.expiresAt === "" ? null : args.expiresAt,
      }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (docId: string) => vehicleApi.deleteDocument(vehicleId, docId),
    onSuccess: invalidate,
  });

  const handleUploadSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setUploadError(null);
    if (!uploadFile) return;
    if (!uploadName.trim() || !uploadType.trim()) return;
    upload.mutate(
      {
        file: uploadFile,
        name: uploadName.trim(),
        documentType: uploadType.trim(),
        expiresAt: uploadExpiry || undefined,
      },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 400) {
            setUploadError(
              "El archivo no es válido (imagen o PDF, máximo 10MB) o faltan datos.",
            );
          } else if (status === 403) {
            setUploadError("No tenés permiso para modificar los documentos de este vehículo.");
          } else {
            setUploadError("No se pudo subir el documento. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  const startEdit = (doc: VehicleDocument) => {
    setEditingId(doc.id);
    setEditName(doc.name);
    setEditType(doc.documentType);
    setEditExpiry(doc.expiresAt ? doc.expiresAt.slice(0, 10) : "");
  };

  const handleEditSubmit = (event: React.FormEvent, docId: string) => {
    event.preventDefault();
    updateDoc.mutate(
      {
        docId,
        name: editName.trim(),
        documentType: editType.trim(),
        expiresAt: editExpiry === "" ? null : editExpiry,
      },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 403) {
            setUploadError("No tenés permiso para modificar los documentos de este vehículo.");
          } else {
            setUploadError("No se pudo actualizar el documento. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos</CardTitle>
        <CardDescription>
          {documents.length > 0
            ? `${documents.length} ${documents.length === 1 ? "documento" : "documentos"}.`
            : "Cargá documentos como cédula, seguro o VTV."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No se pudieron cargar los documentos.
            </p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RotateCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </div>
        ) : documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay documentos cargados.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-lg ring-1 ring-foreground/10 p-2"
              >
                {doc.url && isImageDocument(doc) ? (
                  <img
                    src={doc.url}
                    alt={doc.name}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted/50">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}

                {editingId === doc.id ? (
                  <form
                    className="grid flex-1 gap-2"
                    onSubmit={(e) => handleEditSubmit(e, doc.id)}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor={`doc-name-${doc.id}`} className="text-xs">
                        Nombre
                      </Label>
                      <Input
                        id={`doc-name-${doc.id}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`doc-type-${doc.id}`} className="text-xs">
                        Tipo
                      </Label>
                      <Input
                        id={`doc-type-${doc.id}`}
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`doc-expiry-${doc.id}`} className="text-xs">
                        Vence (opcional)
                      </Label>
                      <Input
                        id={`doc-expiry-${doc.id}`}
                        type="date"
                        value={editExpiry}
                        onChange={(e) => setEditExpiry(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.documentType}
                        {doc.expiresAt
                          ? ` · vence ${formatDate(doc.expiresAt)}`
                          : ""}
                      </p>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Descargar ${doc.name}`}
                        title="Descargar"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    {canWrite && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => startEdit(doc)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          aria-label={`Eliminar documento ${doc.name}`}
                          onClick={() => {
                            if (
                              window.confirm(`¿Eliminar el documento "${doc.name}"?`)
                            ) {
                              remove.mutate(doc.id);
                            }
                          }}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {uploadError && (
          <p className="text-sm text-destructive" role="alert">
            {uploadError}
          </p>
        )}

        {canWrite && (
          <div className="flex flex-col gap-2">
            {showUpload ? (
              <form
                className="grid gap-3 rounded-lg ring-1 ring-foreground/10 p-3"
                onSubmit={handleUploadSubmit}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-file">Archivo</Label>
                  <Input
                    id="doc-upload-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                    required
                    onChange={(e) =>
                      setUploadFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-name">Nombre</Label>
                  <Input
                    id="doc-upload-name"
                    placeholder="Ej. Cédula verde"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-type">Tipo</Label>
                  <Input
                    id="doc-upload-type"
                    placeholder="Ej. Cédula, Seguro, VTV"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-upload-expiry">
                    Vencimiento (opcional)
                  </Label>
                  <Input
                    id="doc-upload-expiry"
                    type="date"
                    value={uploadExpiry}
                    onChange={(e) => setUploadExpiry(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={upload.isPending || !uploadFile}
                  >
                    {upload.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      "Subir documento"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowUpload(false);
                      setUploadError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowUpload(true)}
              >
                <Upload className="h-4 w-4" />
                Subir documento
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function MileageSection({
  vehicle,
  canWrite,
}: {
  vehicle: Vehicle;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [km, setKm] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (dto: { mileage: number; source: "owner"; notes?: string }) =>
      vehicleApi.recordMileage(vehicle.id, dto),
    onSuccess: () => {
      setKm("");
      setNotes("");
      setFormError(null);
      // GET /:id incluye los últimos 5 km — invalidar con el prefijo del vehículo.
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicle.id] });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = Number(km);
    if (!km.trim() || Number.isNaN(parsed) || parsed < 0) {
      setFormError("Ingresá un kilometraje válido.");
      return;
    }
    record.mutate(
      { mileage: Math.round(parsed), source: "owner", notes: notes.trim() || undefined },
      {
        onError: (error) => {
          const status = errorStatus(error);
          if (status === 400 || status === 409) {
            setFormError(
              "El kilometraje debe ser mayor o igual al último registrado (RF-5).",
            );
          } else if (status === 403) {
            setFormError("No tenés permiso para registrar kilometraje.");
          } else {
            setFormError("No se pudo registrar el kilometraje. Intentalo nuevamente.");
          }
        },
      },
    );
  };

  const mileages = vehicle.mileages ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kilometraje</CardTitle>
        <CardDescription>
          {mileages.length > 0
            ? "Últimos registros de kilometraje."
            : "Registrá el kilometraje para mantener la historia del vehículo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mileages.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Todavía no hay registros de kilometraje.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mileages.map((mileage) => (
              <li
                key={mileage.id}
                className="flex items-baseline justify-between gap-3 rounded-lg ring-1 ring-foreground/10 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {mileage.mileage.toLocaleString("es-AR")} km
                  </p>
                  {mileage.notes ? (
                    <p className="text-muted-foreground text-xs">
                      {mileage.notes}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{mileageSourceLabel(mileage.source)}</p>
                  <p>{formatDateTime(mileage.recordedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canWrite && (
          <form
            className="grid gap-3 rounded-lg ring-1 ring-foreground/10 p-3"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-km">Kilometraje (km)</Label>
              <Input
                id="mileage-km"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="Ej. 25000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mileage-notes">Notas (opcional)</Label>
              <Textarea
                id="mileage-notes"
                rows={2}
                placeholder="Ej. Cambio de aceite realizado"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={record.isPending}
            >
              {record.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar km"
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // F-013 §5: 3 llamadas en paralelo (edición también usa ["vehicle", id]).
  const vehicleQuery = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => vehicleApi.getVehicle(id),
    retry: false,
  });

  const photosQuery = useQuery({
    queryKey: ["vehicle", id, "photos"],
    queryFn: () => vehicleApi.listPhotos(id),
    retry: false,
  });

  const documentsQuery = useQuery({
    queryKey: ["vehicle", id, "documents"],
    queryFn: () => vehicleApi.listDocuments(id),
    retry: false,
  });

  // Loading: ficha aún no disponible.
  if (vehicleQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // RF-6: errores de carga del vehículo (404 / 403 / genérico).
  if (vehicleQuery.isError || !vehicleQuery.data) {
    const status = errorStatus(vehicleQuery.error);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Card>
          <CardContent className="py-8 text-center">
            {status === 404 ? (
              <>
                <p className="text-lg font-semibold">Vehículo no encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El vehículo que buscás no existe o fue eliminado.
                </p>
              </>
            ) : status === 403 ? (
              <>
                <p className="text-lg font-semibold">Acceso denegado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No tenés permiso para ver este vehículo.
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
                <Button onClick={() => vehicleQuery.refetch()}>Reintentar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const isOwner = isVehicleOwner(vehicle, user?.id);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/vehicles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a mis vehículos
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {vehicle.licensePlate}
            </h1>
            {!isOwner && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                Acceso compartido
              </span>
            )}
          </div>
          {/* D-039: "Editar" solo para owners activos. */}
          {isOwner && (
            <Link href={`/vehicles/${vehicle.id}/edit`}>
              <Button variant="outline" size="sm">
                Editar
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Ficha (progressive: apenas llega GET /:id) */}
      <FichaCard vehicle={vehicle} />

      {/* Fotos (signed URLs batch ?signed=true) */}
      <PhotosSection
        vehicleId={vehicle.id}
        canWrite={isOwner}
        photos={photosQuery.data ?? []}
        isLoading={photosQuery.isLoading}
        isError={photosQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: ["vehicle", vehicle.id, "photos"],
          })
        }
      />

      {/* Documentos (signed URLs batch ?signed=true) */}
      <DocumentsSection
        vehicleId={vehicle.id}
        canWrite={isOwner}
        documents={documentsQuery.data ?? []}
        isLoading={documentsQuery.isLoading}
        isError={documentsQuery.isError}
        refetch={() =>
          queryClient.invalidateQueries({
            queryKey: ["vehicle", vehicle.id, "documents"],
          })
        }
      />

      {/* Kilometraje (últimos 5 de GET /:id) */}
      <MileageSection vehicle={vehicle} canWrite={isOwner} />
    </div>
  );
}