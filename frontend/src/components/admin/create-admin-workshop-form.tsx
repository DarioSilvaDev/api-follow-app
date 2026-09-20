"use client";

/**
 * Formulario de alta administrada de taller (admin panel) — D-106.
 *
 * Espejo del alta de concesionaria: campos nombre*, CUIT (opcional), email del
 * dueño*. El backend valida duplicados (409 CONFLICT por CUIT o nombre — el
 * code es el mismo; el copy específico se resuelve clasificando el mensaje
 * interno, ver src/lib/admin-errors.ts) y crea el workshop en `pending_claim`
 * enviando el mail al dueño con el link al wizard.
 *
 * Post-success: banner + invalidate ["admin-workshops"] + navegación al
 * listado (patrón de feedback inline del repo, sin toast).
 */
import { useEffect, useState } from "react";
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
import { resolveCreateAdminWorkshopError } from "@/lib/admin-errors";

const createAdminWorkshopSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del taller.")
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

type CreateAdminWorkshopValues = z.infer<typeof createAdminWorkshopSchema>;

const SUCCESS_BANNER_DURATION_MS = 900;

export function CreateAdminWorkshopForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // Redirect diferido para dejar ver el banner de éxito (avoid refs en render).
  useEffect(() => {
    if (!pendingRedirect) return;
    const timer = setTimeout(() => {
      router.push("/admin/workshops");
    }, SUCCESS_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pendingRedirect, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAdminWorkshopValues>({
    resolver: zodResolver(createAdminWorkshopSchema),
    defaultValues: { name: "", taxId: "", ownerEmail: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await adminApi.createWorkshop({
        name: values.name,
        taxId: values.taxId?.trim() || undefined,
        ownerEmail: values.ownerEmail,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-workshops"] });
      setSuccessBanner(
        "Taller creado. Se envió una invitación al dueño.",
      );
      // Feedback visible breve → navegación al listado (patrón concesionarias).
      setPendingRedirect(true);
    } catch (error) {
      setSubmitError(resolveCreateAdminWorkshopError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-workshop-name">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="admin-workshop-name"
          type="text"
          placeholder="Ej. Taller Mecánico Centro"
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
        <Label htmlFor="admin-workshop-tax-id">CUIT (opcional)</Label>
        <Input
          id="admin-workshop-tax-id"
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
        <Label htmlFor="admin-workshop-owner-email">
          Email del dueño <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="admin-workshop-owner-email"
            type="email"
            autoComplete="email"
            placeholder="dueño@mitaller.com"
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
          El dueño recibe un email con el enlace para completar el alta del
          taller.
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
          onClick={() => router.push("/admin/workshops")}
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