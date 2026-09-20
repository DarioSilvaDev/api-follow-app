"use client";

/**
 * Estado "No encontrada" para detalle de entidades del workspace admin.
 *
 * Copy canónico (spec UX): "No encontrada" + "No existe o no tenés acceso."
 * + acción de volver. Reutilizable por cualquier sección admin (talleres,
 * concesionarias, futuros usuarios/vehículos).
 *
 * `title`/`description` son configurables para respetar el género de la
 * entidad (p. ej. "Taller no encontrado" sin romper el copy canónico por
 * defecto). La acción de volver usa href directo (NUNCA router.back()).
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function EntityNotFoundState({
  title = "No encontrada",
  description = "No existe o no tenés acceso.",
  backHref = "/admin",
  backLabel = "Volver a Administración",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-4 flex justify-center">
          <Link href={backHref}>
            <Button variant="outline">{backLabel}</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}