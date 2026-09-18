"use client";

/**
 * Milestone consignación — Alta rápida de concesionaria (D-103 / §9 spec).
 *
 * 1 pantalla: datos del negocio + "yo soy el dueño". CUIT opcional y
 * editable después (resolución PM §3.8 — sin fricción para concesionarias
 * chicas). Tras crear, se refresca la sesión (/auth/me) para que el
 * selector de contexto DEALERSHIP aparezca de inmediato y se navega al
 * panel de la concesionaria.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { dealershipApi } from "@/lib/api";

export const createDealershipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de la concesionaria.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  legalName: z
    .string()
    .trim()
    .max(200, "La razón social no puede superar los 200 caracteres.")
    .optional()
    .or(z.literal("")),
  taxId: z
    .string()
    .trim()
    .max(30, "El CUIT no puede superar los 30 caracteres.")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Ingresá un email válido.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono no puede superar los 30 caracteres.")
    .optional()
    .or(z.literal("")),
  iAmOwner: z
    .boolean()
    .refine((value) => value === true, {
      message: "Confirmá que sos el dueño para continuar.",
    }),
});

export type CreateDealershipFormValues = z.infer<typeof createDealershipSchema>;

export function CreateDealershipForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateDealershipFormValues>({
    resolver: zodResolver(createDealershipSchema),
    defaultValues: {
      name: "",
      legalName: "",
      taxId: "",
      email: "",
      phone: "",
      iAmOwner: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const dealership = await dealershipApi.create({
        name: values.name,
        // Campos opcionales: vacío → undefined (el backend no los persiste).
        legalName: values.legalName?.trim() || undefined,
        taxId: values.taxId?.trim() || undefined,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      });
      // La membresía del dueño aparece en /auth/me → refrescar la sesión
      // para que el selector de contexto DEALERSHIP se muestre.
      await refreshSession().catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["dealerships"] });
      router.push(`/dealerships/${dealership.id}`);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 403) {
        setSubmitError("No tenés permiso para crear una concesionaria.");
      } else {
        setSubmitError(
          "No se pudo crear la concesionaria. Intentá nuevamente.",
        );
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dealership-name">
          Nombre de la concesionaria <span className="text-destructive">*</span>
        </Label>
        <Input
          id="dealership-name"
          type="text"
          placeholder="Ej. FM Automotores"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dealership-legal-name">Razón social (opcional)</Label>
          <Input
            id="dealership-legal-name"
            type="text"
            placeholder="Ej. FM Automotores SRL"
            aria-invalid={Boolean(errors.legalName)}
            {...register("legalName")}
          />
          {errors.legalName && (
            <p className="text-xs text-destructive" role="alert">
              {errors.legalName.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {/* D-103 / resolución PM §3.8: CUIT opcional, editable después. */}
          <Label htmlFor="dealership-tax-id">CUIT (opcional)</Label>
          <Input
            id="dealership-tax-id"
            type="text"
            inputMode="numeric"
            placeholder="Ej. 30-12345678-9"
            aria-invalid={Boolean(errors.taxId)}
            {...register("taxId")}
          />
          {errors.taxId && (
            <p className="text-xs text-destructive" role="alert">
              {errors.taxId.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dealership-email">Email de contacto (opcional)</Label>
          <Input
            id="dealership-email"
            type="email"
            placeholder="contacto@fmautomotores.com"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dealership-phone">Teléfono (opcional)</Label>
          <Input
            id="dealership-phone"
            type="tel"
            placeholder="Ej. 11 5555 1234"
            aria-invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          {errors.phone && (
            <p className="text-xs text-destructive" role="alert">
              {errors.phone.message}
            </p>
          )}
        </div>
      </div>

      {/* D-103 / §9 spec: "yo soy el dueño" — aceptación del alta directa
          (el backend crea el member owner del user autenticado). */}
      <div className="flex items-start gap-2">
        <input
          id="dealership-i-am-owner"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-input"
          aria-invalid={Boolean(errors.iAmOwner)}
          {...register("iAmOwner")}
        />
        <Label htmlFor="dealership-i-am-owner">
          Yo soy el dueño y responsable de esta concesionaria.
        </Label>
      </div>
      {errors.iAmOwner && (
        <p className="text-xs text-destructive" role="alert">
          {errors.iAmOwner.message}
        </p>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Link href="/dealerships">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Creando..." : "Crear concesionaria"}
        </Button>
      </div>
    </form>
  );
}