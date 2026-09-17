"use client";

/**
 * Fase 3 / D-090 — Escáner de QR de transferencia (/escaneo).
 *
 * Flujo:
 * - Cámara en vivo (html5-qrcode) sobre un contenedor montado al abrir.
 * - Al detectar un QR, se parsea la URL (deep link `/transfer/qr/{token}`)
 *   y se navega. Si el escaneo arroja texto que no es un deep link, se ignora.
 * - Fallback manual (RF-9): ingreso del token del QR si la cámara no está
 *   disponible o el usuario prefiere pegar el enlace.
 * - Errores de cámara (permisos / no HTTPS) → mensaje + fallback manual.
 *
 * html5-qrcode necesita un elemento DOM: se monta el contenedor solo cuando
 * el usuario presiona "Escanear con cámara" (evita abrir la cámara al cargar).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  KeyRound,
  Loader2,
  ScanLine,
  X,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractQrToken, qrDeepLink } from "@/lib/qr-deep-link";

/** Extrae el token de una URL de deep link (o token crudo). */

export default function ScannerPage() {
  const router = useRouter();
  const videoContainerId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  // Cleanup al desmontar: detener y limpiar el scanner siempre.
  useEffect(() => {
    const scanner = scannerRef.current;
    return () => {
      if (scanner?.isScanning) {
        void scanner.stop().catch(() => undefined);
        scanner.clear();
        scannerRef.current = null;
      }
    };
  }, []);

  const handleNavigate = (text: string) => {
    const token = extractQrToken(text);
    if (!token) return;
    void scannerRef.current
      ?.stop()
      .catch(() => undefined)
      .finally(() => {
        scannerRef.current?.clear();
        scannerRef.current = null;
        setScanning(false);
      });
    router.push(qrDeepLink(token));
  };

  const startScanner = async () => {
    if (!document.getElementById(videoContainerId)) {
      setCameraError("No se pudo montar la vista de cámara.");
      return;
    }
    setCameraError(null);
    const scanner = new Html5Qrcode(videoContainerId);
    scannerRef.current = scanner;
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: { ideal: "environment" } },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        (decodedText) => handleNavigate(decodedText),
        () => undefined,
      );
    } catch {
      setScanning(false);
      scannerRef.current = null;
      setCameraError(
        "No se pudo acceder a la cámara. Verificá los permisos o usá el ingreso manual.",
      );
    }
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // ya detenido → ignorar
    }
    scannerRef.current = null;
    setScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = extractQrToken(tokenInput);
    if (!token) {
      setManualError(
        "Ingresá el enlace completo del QR o el token de transferencia.",
      );
      return;
    }
    router.push(qrDeepLink(token));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Escanear QR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escaneá el QR de transferencia para aceptar un vehículo.
        </p>
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5 text-primary" />
            Cámara
          </CardTitle>
          <CardDescription>
            Apuntá la cámara al QR. Si la cámara no está disponible, usá el
            ingreso manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {scanning ? (
            <div className="flex flex-col gap-3">
              <div
                id={videoContainerId}
                className="override-h5q-width [--h5q-width:100%] relative overflow-hidden rounded-xl border border-border bg-muted/40 [&_video]:max-w-full [&_video]:rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stopScanner}
                className="self-start"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Detener escaneo
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={startScanner}>
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-1.5 h-4 w-4" />
              )}
              Iniciar cámara
            </Button>
          )}

          {cameraError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {cameraError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-primary" />
            Ingreso manual
          </CardTitle>
          <CardDescription>
            Pegá el enlace del QR o el token de transferencia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleManualSubmit}
            className="flex flex-col gap-3"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qr-token">Enlace o token</Label>
              <Input
                id="qr-token"
                type="text"
                autoComplete="off"
                placeholder="/transfer/qr/ABC123… o ABC123…"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              {manualError && (
                <p className="text-xs text-destructive" role="alert">
                  {manualError}
                </p>
              )}
            </div>
            <Button type="submit" className="self-start">
              Ir al QR
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}