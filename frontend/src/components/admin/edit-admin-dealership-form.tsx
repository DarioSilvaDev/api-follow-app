"use client";

/**
 * Formulario de edición admin de concesionaria — Fase 3 handoff PM (P1).
 *
 * Reglas (decisiones PM cerradas):
 * - Campos editables SOLO identidad y contacto: nombre*, razón social, CUIT,
 *   email de contacto, teléfono, website, descripción (P1).
 * - CUIT deshabilitado cuando `status === "active" && claimedAt` (la
 *   concesionaria fue reclamada), EXCEPTO super_admin (hasRole super_admin).
 * - PATCH parcial (P7): se envían únicamente los campos modificados
 *   (dirtyFields); opcionales vaciados → null (limpiar).
 * - Botón submit: deshabilitado mientras submitting o form dirty inválido.
 * - Post-success: invalidate ["admin-dealerships"] + ["admin-dealership",
 *   id] + banner role="status" + redirect al detalle tras ~900ms (patrón
 *   create-admin-dealership-form).
 *
 * Fuente de datos: prop `dealership` (GET /admin/dealerships/:id resuelto por
 * la página; NUNCA refetch acá — prefill seguro vía defaultValues al montar).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { adminApi } from "@/lib/api";
import { resolveEditAdminDealershipError } from "@/lib/admin-errors";
import { hasRole } from "@/lib/admin-access";
import { cn } from "cn";
import type { AdminDealershipDetail, UpdateAdminDealershipInput } from "@/types/admin";

const editAdminDealershipSchema = z.object({
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
    .email("Ingresá un email de contacto válido.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono no puede superar los 30 caracteres.")
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Ingresá una URL válida (ej. https://miagencia.com).")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(500, "La descripción no puede superar los 500 caracteres.")
    .optional()
    .or(z.literal("")),
});

type EditAdminDealershipValues = z.infer<typeof editAdminDealershipSchema>;

const SUCCESS_BANNER_DURATION_MS = 900;

export function EditAdminDealershipForm({
  dealership,
}: {
  dealership: AdminDealershipDetail;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState(false);

  // P1: CUIT bloqueado cuando la concesionaria está reclamada y activa
  // (salvo super_admin — hasRole por type de rol, contrato /auth/me).
  const taxIdLocked =
    dealership.status === "active" &&
    Boolean(dealership.claimedAt) &&
    !hasRole(user, "super_admin");

  // Redirect diferido para dejar ver el banner de éxito (patrón alta).
  useEffect(() => {
    if (!pendingRedirect) return;
    const timer = setTimeout(() => {
      router.push(`/admin/dealerships/${dealership.id}`);
    }, SUCCESS_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pendingRedirect, router, dealership.id]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isValid, dirtyFields },
  } = useForm<EditAdminDealershipValues>({
    resolver: zodResolver(editAdminDealershipSchema),
    mode: "onChange",
    defaultValues: {
      name: dealership.name ?? "",
      legalName: dealership.legalName ?? "",
      taxId: dealership.taxId ?? "",
      email: dealership.email ?? "",
      phone: dealership.phone ?? "",
      website: dealership.website ?? "",
      description: dealership.description ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    // P7: PATCH parcial — solo campos modificados; opcionales vaciados → null
    // para limpiarlos (contrato UpdateAdminDealershipInput acepta null).
    const payload: UpdateAdminDealershipInput = {};
    if (dirtyFields.name) payload.name = values.name.trim();
    if (dirtyFields.legalName) payload.legalName = values.legalName?.trim() || null;
    if (dirtyFields.taxId) payload.taxId = values.taxId?.trim() || null;
    if (dirtyFields.email) payload.email = values.email?.trim() || null;
    if (dirtyFields.phone) payload.phone = values.phone?.trim() || null;
    if (dirtyFields.website) payload.website = values.website?.trim() || null;
    if (dirtyFields.description) payload.description = values.description?.trim() || null;

    try {
      await adminApi.updateDealership(dealership.id, payload);
      queryClient.invalidateQueries({ queryKey: ["admin-dealerships"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dealership", dealership.id] });
      setSuccessBanner("Concesionaria actualizada correctamente.");
      setPendingRedirect(true);
    } catch (error) {
      setSubmitError(resolveEditAdminDealershipError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-dealership-name">
          Nombre <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-dealership-name"
          type="text"
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
        <Label htmlFor="edit-dealership-legal-name">Razón social (opcional)</Label>
        <Input
          id="edit-dealership-legal-name"
          type="text"
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
        <Label htmlFor="edit-dealership-tax-id">CUIT (opcional)</Label>
        <Input
          id="edit-dealership-tax-id"
          type="text"
          inputMode="numeric"
          disabled={taxIdLocked}
          aria-invalid={Boolean(errors.taxId)}
          {...register("taxId")}
        />
        {taxIdLocked ? (
          <p className="text-xs text-muted-foreground">
            El CUIT no puede modificarse porque la concesionaria ya fue
            reclamada y está activa.
          </p>
        ) : null}
        {errors.taxId && (
          <p className="text-xs text-destructive" role="alert">
            {errors.taxId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-dealership-email">
          Email de contacto (opcional)
        </Label>
        <Input
          id="edit-dealership-email"
          type="email"
          autoComplete="email"
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
        <Label htmlFor="edit-dealership-phone">Teléfono (opcional)</Label>
        <Input
          id="edit-dealership-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={Boolean(errors.phone)}
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-xs text-destructive" role="alert">
            {errors.phone.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-dealership-website">Website (opcional)</Label>
        <Input
          id="edit-dealership-website"
          type="url"
          inputMode="url"
          placeholder="https://miagencia.com"
          aria-invalid={Boolean(errors.website)}
          {...register("website")}
        />
        {errors.website && (
          <p className="text-xs text-destructive" role="alert">
            {errors.website.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-dealership-description">
          Descripción (opcional)
        </Label>
        <Textarea
          id="edit-dealership-description"
          rows={4}
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description.message}
          </p>
        )}
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
        <Link
          href={`/admin/dealerships/${dealership.id}`}
          aria-disabled={isSubmitting || Boolean(successBanner) || undefined}
          className={cn(
            buttonVariants({ variant: "outline" }),
            (isSubmitting || Boolean(successBanner)) &&
              "pointer-events-none opacity-50",
          )}
        >
          Cancelar
        </Link>
        <Button
          type="submit"
          disabled={
            isSubmitting || !isDirty || !isValid || Boolean(successBanner)
          }
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}