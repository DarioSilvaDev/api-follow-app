"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || status !== "loading") return;

    let cancelled = false;

    authApi
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err as { status?: number; message?: string };
        if (error.status === 400 || error.status === 401) {
          setErrorMessage(
            error.message || "El enlace es inválido o ha expirado.",
          );
        } else if (error.status === 429) {
          setErrorMessage("Demasiados intentos. Intenta más tarde.");
        } else {
          setErrorMessage(
            error.message || "El enlace es inválido o ha expirado.",
          );
        }
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token, status]);

  // No token or failed verification → error card
  if (!token || status === "error") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Verificación fallida
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-center text-sm text-muted-foreground">
            {!token
              ? "No se proporcionó un token de verificación."
              : errorMessage || "El enlace es inválido o ha expirado."}
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link href="/forgot-password">
            <Button variant="outline" className="w-full">
              Solicitar nuevo enlace
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="link" className="w-full text-sm">
              Crear una nueva cuenta
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Email verificado
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <p className="text-center text-sm text-muted-foreground">
            Tu email ha sido verificado exitosamente. Ya podés iniciar sesión en
            tu cuenta.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button>Iniciar sesión</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Loading state
  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}