"use client";

/**
 * Link "Volver a <Sección>" del workspace admin (convención de UI).
 *
 * Botón ghost + ChevronLeft que navega al LISTADO de la sección con href
 * directo (NUNCA router.back() — el destino no depende del historial).
 *
 * `href` es parametrizable por sección (concesionarias, talleres y futuras
 * secciones admin); `label` puede personalizarse como "Volver a
 * concesionarias"/"Volver a talleres".
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

export function AdminBackLink({
  href = "/admin",
  label = "Volver a Administración",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "-ml-3 w-fit gap-1 px-2 text-muted-foreground",
      )}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}