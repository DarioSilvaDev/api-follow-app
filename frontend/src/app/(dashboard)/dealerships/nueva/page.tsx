"use client";

/**
 * Milestone consignación — Alta rápida de concesionaria (D-103 / spec §8
 * "Concesionarias", RB-10). Renderiza `CreateDealershipForm` (D-104):
 * alta rápida + "yo soy el dueño" (crea el member owner). Post-success
 * navega a `/dealerships/[id]` (perfil: exhibición + miembros, D-105,
 * resolución PM §3.5 / D-107).
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { CreateDealershipForm } from "@/components/dealership/create-dealership-form";

export default function NuevaDealershipPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <Link
        href="/dealerships"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "-ml-3 w-fit gap-1 px-2 text-muted-foreground"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Nueva concesionaria
        </h1>
        <p className="text-sm text-muted-foreground">
          Registrá una concesionaria para exhibir y consignar vehículos,
          y sumá miembros (dueño, gestor, vendedor o asesor).
        </p>
      </div>

      <CreateDealershipForm />
    </div>
  );
}
