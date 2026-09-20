"use client";

/**
 * Formulario de alta administrada de concesionaria (admin panel).
 *
 * Campos: nombre*, CUIT (opcional), email del dueño*. El backend valida
 * duplicados (409 CONFLICT por CUIT o nombre — el code es el mismo; el copy
 * específico se resuelve clasificando el mensaje interno, ver
 * src/lib/admin-errors.ts) y crea la dealership en `pending_claim` enviando
 * el mail al dueño con el link al wizard.
 *
 * Post-success: banner + invalidate ["admin-dealerships"] + navegación al
 * listado (patrón de feedback inline del repo, sin toast).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi } from "@/lib/api";
import { resolveCreateAdminDealershipError } from "@/lib/admin-errors";

const createAdminDealershipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de la concesionaria.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  taxId: z
    .string()
    .trim()
    .max(30, "El CUIT no puede superar los 30 caracteres.")
    .optional()
    .or(z.literal("")),
  ownerEmail: z
    .string()
    .trim()
    .email("Ingresá un email válido para el dueño."),
});

type CreateAdminDealershipValues = z.infer<typeof createAdminDealershipSchema>;

const SUCCESS_BANNER_DURATION_MS = 900;

export function CreateAdminDealershipForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAdminDealershipValues>({
    resolver: zodResolver(createAdminDealershipSchema),
    defaultValues: { name: "", taxId: "", ownerEmail: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await adminApi.createDealership({
        name: values.name,
        taxId: values.taxId?.trim() || undefined,
        ownerEmail: values.ownerEmail,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      setSuccessBanner(
        "Concesionaria creada. Se envió una invitación al dueño.",
      );
      // Feedback visible breve → navegación al listado (decisión PM: página
      // de alta, no modal; ver "Ir al listado" con el nuevo registro).
      redirectTimer.current = setTimeout(() => {
        router.push("/admin/dealerships");
      }, SUCCESS_BANNER_DURATION_MS);
    } catch (error) {
      setSubmitError(resolveCreateAdminDealershipError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-dealership-name">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="admin-dealership-name"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-dealership-tax-id">CUIT (opcional)</Label>
        <Input
          id="admin-dealership-tax-id"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-dealership-owner-email">
          Email del dueño <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="admin-dealership-owner-email"
            type="email"
            autoComplete="email"
            placeholder="dueño@miagencia.com"
            className="pl-10"
            aria-invalid={Boolean(errors.ownerEmail)}
            {...register("ownerEmail")}
          />
        </div>
        {errors.ownerEmail && (
          <p className="text-xs text-destructive" role="alert">
            {errors.ownerEmail.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          El dueño recibe un email con el enlace para completar el alta de la
          concesionaria.
        </p>
      </div>

      {successBanner && (
        <p
          role="status"
          className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-foreground"
        >
          {successBanner}
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
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || Boolean(successBanner)}
          onClick={() => router.push("/admin/dealerships")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || Boolean(successBanner)}>
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Creando..." : "Crear y enviar invitación"}
        </Button>
      </div>
    </form>
  );
}