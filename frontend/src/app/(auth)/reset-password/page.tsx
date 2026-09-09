"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { useResetPassword } from "@/hooks/use-password-reset";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(100, "La contraseña no puede exceder 100 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

function ResetPasswordFormInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const resetPassword = useResetPassword();

  // Token is derived directly from searchParams — no state copy needed.
  // This avoids setState-in-effect entirely: the value is read synchronously
  // during render and the URL cleanup runs as a side-effect without touching state.
  const token = searchParams.get("token");

  // Tracks whether the token was invalidated by a 401 response (form submit error).
  const [tokenInvalidated, setTokenInvalidated] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [success, setSuccess] = useState(false);

  // Clean URL on mount — remove token param from address bar.
  // Intentionally empty deps: one-time cleanup, no state needed.
  useEffect(() => {
    if (searchParams.get("token")) {
      window.history.replaceState({}, "", "/reset-password");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect countdown after success
  useEffect(() => {
    if (!success) return;
    if (redirectCountdown <= 0) {
      router.push("/login");
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [success, redirectCountdown, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) return;
    try {
      await resetPassword.mutateAsync({ token, password: data.password });
      setSuccess(true);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 401) {
        // Token invalid or expired — transition to "invalid link" state
        setTokenInvalidated(true);
      }
      // For 429 or other errors, the form will show the validation error
    }
  };

  // No token or token was invalidated
  if (!token || tokenInvalidated) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Restablecer contraseña
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-center text-sm text-muted-foreground">
            {resetPassword.isError
              ? "El enlace ha expirado o es inválido"
              : "Enlace inválido o no encontrado"}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Solicitar un nuevo enlace
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Success state
  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">
            Restablecer contraseña
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <p className="text-center text-sm text-muted-foreground">
            Contraseña restablecida exitosamente. Serás redirigido al inicio de
            sesión en {redirectCountdown} segundo
            {redirectCountdown !== 1 ? "s" : ""}.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button variant="outline">Ir al inicio de sesión</Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Form state
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold">
          Restablecer contraseña
        </CardTitle>
        <CardDescription>
          Ingresa tu nueva contraseña a continuación.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="grid gap-4">
          <PasswordInput
            id="password"
            label="Nueva contraseña"
            placeholder="Mínimo 8 caracteres"
            error={errors.password?.message}
            register={register("password")}
            autoComplete="new-password"
          />
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repite tu contraseña"
                autoComplete="new-password"
                className="flex h-8 w-full min-w-0 rounded-lg border border-input bg-transparent pl-10 pr-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
                aria-invalid={!!errors.confirmPassword}
                {...register("confirmPassword")}
              />
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-destructive" role="alert">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
          {resetPassword.isError && (
            <p className="text-sm text-destructive" role="alert">
              {(resetPassword.error as { message?: string })?.message ||
                "Error al restablecer la contraseña"}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Restableciendo...
              </>
            ) : (
              "Restablecer contraseña"
            )}
          </Button>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver al inicio de sesión
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
      <ResetPasswordFormInner />
    </Suspense>
  );
}
