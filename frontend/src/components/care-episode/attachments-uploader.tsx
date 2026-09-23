"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { careEpisodeApi } from "@/lib/api";
import { validateAttachmentFiles } from "@/lib/attachment-validation";
import { resolveAttachmentUploadErrorMessage } from "@/lib/care-episode-errors";
import { attachmentPhaseLabel } from "@/lib/attachments";
import type {
  CareEpisodeAttachment,
  CareEpisodeAttachmentPhase,
} from "@/types/care-episode";

/**
 * Iteración 2-4 (S4/S6) — Subida de evidencia del episodio.
 *
 * - UN archivo por request (FileInterceptor single 'files'); el "lote" se
 *   resuelve con subida SECUENCIAL en el cliente (patrón vehicleApi.uploadPhoto).
 * - Estados por archivo: pending → uploading (progreso aria-valuenow) → done,
 *   y error con Reintentar.
 * - Validación cliente espejo del backend (validateAttachmentFiles): tipos,
 *   5MB, lote 5 (input multiple) y tope 15 contra `existingCount`.
 * - El componente NO posee la mutación: en cada éxito llama `onUploaded`,
 *   y la página invalida las queries del detalle.
 * - Feedback inline role="status"/"alert"; sin toasts (convención repo).
 */
export interface AttachmentsUploaderProps {
  episodeId: string;
  /** Fase por defecto del select (tablero taller S4 → "after"). */
  defaultPhase?: Exclude<CareEpisodeAttachmentPhase, null>;
  /** Fases permitidas por el backend en el select. */
  phases?: Exclude<CareEpisodeAttachmentPhase, null>[];
  /** Adjuntos activos actuales del episodio (tope 15 del backend). */
  existingCount?: number;
  /** Deshabilita toda la zona (episodio congelado / sin permiso). */
  disabled?: boolean;
  /** Por cada upload exitoso (la página invalida ["care-episode", id]). */
  onUploaded?: (attachment: CareEpisodeAttachment) => void;
}

export interface UploadItem {
  /** key local (no es id de servidor). */
  key: string;
  file: File;
  caption: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

let itemKeyCounter = 0;
function nextItemKey(): string {
  itemKeyCounter += 1;
  return `upload-item-${itemKeyCounter}`;
}

const PHASE_OPTIONS: Exclude<CareEpisodeAttachmentPhase, null>[] = [
  "before",
  "work",
  "after",
];

const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/avif";

export function AttachmentsUploader({
  episodeId,
  defaultPhase = "after",
  phases = PHASE_OPTIONS,
  existingCount = 0,
  disabled = false,
  onUploaded,
}: AttachmentsUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<UploadItem[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [phase, setPhase] =
    useState<Exclude<CareEpisodeAttachmentPhase, null>>(defaultPhase);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function commitItems(updater: (prev: UploadItem[]) => UploadItem[]) {
    itemsRef.current = updater(itemsRef.current);
    setItems(itemsRef.current);
  }

  function updateItem(key: string, updater: (item: UploadItem) => UploadItem) {
    commitItems((prev) => prev.map((item) => (item.key === key ? updater(item) : item)));
  }

  const doneCount = items.filter((item) => item.status === "done").length;
  /** El tope 15 se valida contra activos reales + lo que ya está en la lista. */
  const usedSlots = existingCount + items.length;

  function handleSelectFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    const result = validateAttachmentFiles(files, usedSlots);
    if (!result.ok) {
      setSelectionError(result.message);
      return;
    }
    setSelectionError(null);
    const next: UploadItem[] = files.map((file) => ({
      key: nextItemKey(),
      file,
      caption: "",
      status: "pending",
      progress: 0,
    }));
    commitItems((prev) => [...prev, ...next]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  /** Sube UN item (retry: pending o error) o TODOS los pendientes (bulk). */
  async function uploadItems(itemKey?: string) {
    const isRetry = itemKey !== undefined;
    const snapshot = itemsRef.current.filter((item) =>
      isRetry
        ? item.key === itemKey &&
          (item.status === "pending" || item.status === "error")
        : item.status === "pending",
    );
    if (snapshot.length === 0) return;
    setUploading(true);
    // Congela la fase con la que arrancó el lote (consistencia S4).
    const uploadPhase = phase;
    for (const item of snapshot) {
      const current = itemsRef.current.find((entry) => entry.key === item.key);
      if (!current || current.status === "uploading" || current.status === "done") {
        continue;
      }
      updateItem(item.key, (entry) => ({ ...entry, status: "uploading", progress: 0 }));
      try {
        const attachment = await careEpisodeApi.uploadAttachment(
          episodeId,
          { file: item.file, phase: uploadPhase, caption: item.caption || undefined },
          (percent) =>
            updateItem(item.key, (entry) => ({ ...entry, progress: percent })),
        );
        updateItem(item.key, (entry) => ({
          ...entry,
          status: "done",
          progress: 100,
        }));
        onUploaded?.(attachment);
      } catch (error) {
        updateItem(item.key, (entry) => ({
          ...entry,
          status: "error",
          error: resolveAttachmentUploadErrorMessage(error),
        }));
      }
    }
    setUploading(false);
  }

  const visibleItems = items.filter(
    (item) => item.status !== "done",
  );
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const hasPending = pendingCount > 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="attachment-phase">Fase</Label>
          <Select
            id="attachment-phase"
            value={phase}
            onChange={(event) =>
              setPhase(event.target.value as Exclude<CareEpisodeAttachmentPhase, null>)
            }
            disabled={disabled || uploading}
            className="w-44"
          >
            {phases.map((p) => (
              <option key={p} value={p}>
                {attachmentPhaseLabel(p)}
              </option>
            ))}
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Adjuntar fotos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          data-testid="attachment-file-input"
          aria-label="Adjuntar imágenes de evidencia"
          onChange={(event) => handleSelectFiles(event.target.files)}
        />
      </div>

      {selectionError && (
        <p className="text-sm text-destructive" role="alert">
          {selectionError}
        </p>
      )}

      {visibleItems.length > 0 && (
        <div className="grid gap-2">
          {visibleItems.map((item) => (
            <div
              key={item.key}
              data-testid={`upload-item-${item.file.name}`}
              className="flex flex-col gap-1 rounded-lg border border-foreground/10 px-3 py-2"
            >
              <div className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {item.file.name}
                  {item.status === "error" && item.error ? (
                    <span className="ml-2 text-xs text-destructive" role="alert">
                      {item.error}
                    </span>
                  ) : null}
                </span>
                {item.status === "uploading" && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Subiendo {item.progress}%
                  </span>
                )}
                {item.status === "error" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => {
                      void uploadItems(item.key);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reintentar
                  </Button>
                )}
                {item.status === "pending" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={uploading}
                    aria-label={`Quitar ${item.file.name}`}
                    onClick={() =>
                      commitItems((prev) => prev.filter((entry) => entry.key !== item.key))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {item.status === "uploading" && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  aria-label={`Subiendo ${item.file.name}`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}

          {hasPending && !uploading && (
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => {
                void uploadItems();
              }}
            >
              <ImagePlus className="h-4 w-4" />
              Subir {pendingCount} foto{pendingCount === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}

      {doneCount > 0 && (
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          role="status"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {/* Un solo text node: evita que el matcher rompa el texto en varios
              nodes y garantiza el acento de "imágenes". */}
          {`${doneCount} ${doneCount === 1 ? "imagen subida" : "imágenes subidas"}`}
        </p>
      )}
    </div>
  );
}