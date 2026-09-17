"use client";

/**
 * Fase 3 / D-079..D-088 + D-090 — Panel de generación/gestión de QR de
 * transferencia presencial / concesionaria.
 *
 * Flujo (RF-8):
 * 1. Modo detalle: vehículo fijo → selector presencial (1h) / concesionaria
 *    (48h) (D-085, D-086) → "Generar QR" (POST vehicles/:id/qr).
 * 2. QR generado: se renderiza (qrcode.react, D-090) + URL deep link + copy
 *    (D-080) + countdown (calculado de `expiresAt` server-side, nunca local)
 *    + acciones: Revocar (DELETE vehicles/:id/qr) / Descargar PNG.
 * 3. 409 (D-079): si ya hay otro QR pendiente → error + CTA "Revocar QR".
 * 4. Errores 403/404 → mensajes mapeados en @/lib/transfer-errors (nunca
 *    texto crudo del backend).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Loader2,
  QrCode,
  OctagonX,
  RefreshCw,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "cn";
import { vehicleApi } from "@/lib/api";
import { resolveQrGenerateErrorMessage } from "@/lib/transfer-errors";
import type { GeneratedTransferQr, TransferQrSource } from "@/types/vehicle";

const SOURCE_OPTIONS: { value: TransferQrSource; label: string }[] = [
  { value: "presencial", label: "Presencial (1 hora)" },
  { value: "concesionaria", label: "Concesionaria (48 horas)" },
];

interface QrTransferPanelProps {
  /** Vehículo fijo del detalle (modo detalle). */
  vehicle?: { id: string; licensePlate: string } | null;
  /** Invalidate queries del llamador tras revocar (para resincronizar). */
  onMutationEnd?: () => void;
}

/** mm:ss para el countdown (ej. "59:41"). */
function formatSeconds(total: number): string {
  const safe = Math.max(0, total);
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function QrTransferPanel({ vehicle, onMutationEnd }: QrTransferPanelProps) {
  const vehicleId = vehicle?.id;

  const [source, setSource] = useState<TransferQrSource>("presencial");
  const [qr, setQr] = useState<GeneratedTransferQr | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Countdown desde `expiresAt` (server-side). Se recalcula cada segundo solo
  // mientras hay un QR pendiente; evita derivar vencimiento desde el cliente.
  useEffect(() => {
    if (!qr) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [qr]);

  const secondsRemaining = useMemo(() => {
    if (!qr) return 0;
    return Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - now) / 1000));
  }, [qr, now]);

  const expired = Boolean(qr && secondsRemaining === 0);

  const handleGenerate = async () => {
    if (!vehicleId) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await vehicleApi.generateTransferQr(vehicleId, { source });
      setQr(data);
      setNow(Date.now());
    } catch (err: unknown) {
      setError(resolveQrGenerateErrorMessage(err));
      // 409 → el llamador resincroniza el vehículo (perfil de owner).
      onMutationEnd?.();
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!vehicleId || !qr) return;
    setError(null);
    try {
      await vehicleApi.revokeTransferQr(vehicleId);
      setQr(null);
      onMutationEnd?.();
    } catch (err: unknown) {
      setError(resolveQrGenerateErrorMessage(err));
    }
  };

  const handleCopy = async () => {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles → no bloqueamos la acción principal.
    }
  };

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const href = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = href;
    a.download = `qr-transferencia-${vehicle?.licensePlate ?? "vehiculo"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [vehicle?.licensePlate]);

  if (!vehicleId) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        Seleccioná primero un vehículo para generar el QR.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {qr ? (
        <>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-4">
            <QRCodeCanvas
              ref={canvasRef}
              value={qr.url}
              size={176}
              level="M"
              marginSize={2}
              title={`QR de transferencia de ${vehicle?.licensePlate ?? "vehículo"}`}
            />
            <p className="max-w-full truncate text-xs text-muted-foreground">
              {qr.url}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar enlace
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Descargar QR
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
              expired
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <QrCode className="h-4 w-4" />
              {qr.source === "presencial" ? "Presencial" : "Concesionaria"}
            </span>
            <span className="font-mono font-medium" aria-live="polite">
              {expired ? "Expirado" : formatSeconds(secondsRemaining)}
            </span>
          </div>

          {expired && (
            <p className="text-xs text-muted-foreground">
              Este QR ya no es válido. Generá uno nuevo para transferir el
              vehículo.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRevoke}
              disabled={expired}
            >
              <OctagonX className="mr-1.5 h-3.5 w-3.5" />
              Revocar QR
            </Button>
            {expired && (
              <Button type="button" size="sm" onClick={handleGenerate}>
                Generar nuevo QR
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qr-source">Origen de la transferencia</Label>
            <Select
              id="qr-source"
              value={source}
              onChange={(e) => setSource(e.target.value as TransferQrSource)}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Presencial (1h) para entregas en persona; concesionaria (48h) si
              lo imprime un concesionario.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {generating ? "Generando…" : "Generar QR"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}