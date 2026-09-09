"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useForgotPassword } from "@/hooks/use-password-reset";

const forgotPasswordSchema = z.object({
  email: z.string().email("Ingresa un email válido"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    try {
      await forgotPassword.mutateAsync(data.email);
      // Always show success (anti-enumeration)
      setSubmitted(true);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 429) {
        // Rate limited
        setSubmitted(true);
      } else {
        // For any other error, still show success (anti-enumeration)
        setSubmitted(true);
      }
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold">
          Recuperar contraseña
        </CardTitle>
        <CardDescription>
          Ingresa tu email y te enviaremos un enlace para restablecer tu
          contraseña.
        </CardDescription>
      </CardHeader>

      {submitted ? (
        <CardContent className="flex flex-col items-center gap-4 pb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <p className="text-center text-sm text-muted-foreground">
            Si el email está registrado, recibirás un enlace para restablecer tu
            contraseña.
          </p>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  className="pl-10"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar enlace de restablecimiento"
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
      )}

      {!submitted && (
        <CardFooter className="justify-center pt-0">
          <p className="text-sm text-muted-foreground">
            ¿No tenés una cuenta?{" "}
            <Link
              href="/register"
              className="font-medium text-foreground hover:underline"
            >
              Registrate
            </Link>
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
