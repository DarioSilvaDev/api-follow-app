"use client";

/**
 * Milestone consignación — Detalle de concesionaria (spec §8 / RB-10,
 * resolución PM §3.5). Ruta `/dealerships/[id]`, fuente:
 * `GET /dealerships/:id` (`dealershipApi.get`) — concesionaria donde el
 * usuario es miembro activo (RB-10; enforcement real en backend).
 *
 * Estructura:
 * - Cabecera de perfil: nombre, razón social / CUIT, estado (Activa/Inactiva
 *   por `isActive`, D-106) y acciones "Exhibición" · "Miembros".
 * - `DealershipExhibitionSection` (D-107, spec §8): vehículos consignados en
 *   exhibición — Vender (QR sale, RB-D) / Devolver (QR return) vía
 *   QrTransferPanel (ÚNICA frontera QR, AGENTS.md §22 / frontend §14).
 * - `DealershipMembersSection` (D-108, spec §8): invitar / cambiar rol /
 *   quitar miembro (admin/owner, RB-10 + RB-19; enforcement backend).
 *
 * La UI solo oculta visibilidad; nunca es security boundary (AGENTS.md §20/§22).
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DealershipExhibitionSection } from "@/components/dealership/dealership-exhibition-section";
import { DealershipMembersSection } from "@/components/dealership/dealership-members-section";
import { dealershipApi } from "@/lib/api";

export default function DealershipDetailPage() {
  const params = useParams<{ id: string }>();
  const dealershipId = params.id;

  const dealershipQuery = useQuery({
    queryKey: ["dealership", dealershipId],
    queryFn: () => dealershipApi.get(dealershipId),
  });

  const dealership = dealershipQuery.data;
  const dealershipError = dealershipQuery.error;
  const isNotFound =
    (dealershipError as { status?: number } | null)?.status === 404;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link
        href="/dealerships"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "-ml-2 w-fit gap-1 text-muted-foreground",
        })}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a concesionarias
      </Link>

      {dealershipQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Cargando concesionaria…
          </CardContent>
        </Card>
      )}

      {isNotFound && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-10">
            <Store className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-medium">Concesionaria no encontrada</p>
              <p className="text-sm text-muted-foreground">
                No existe o no tenés acceso a esta concesionaria.
              </p>
            </div>
            <Link
              href="/dealerships"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Ver mis concesionarias
            </Link>
          </CardContent>
        </Card>
      )}

      {!isNotFound && dealershipQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-10">
            <p className="font-medium text-destructive">
              No se pudo cargar la concesionaria
            </p>
            <p className="text-sm text-muted-foreground">
              {dealershipError instanceof Error
                ? dealershipError.message
                : "Ocurrió un error inesperado. Intentá nuevamente."}
            </p>
          </CardContent>
        </Card>
      )}

      {dealership && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight">
                      {dealership.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                      {dealership.legalName && <span>{dealership.legalName}</span>}
                      {dealership.taxId && <span>· {dealership.taxId}</span>}
                      {!dealership.legalName &&
                        !dealership.taxId &&
                        "Sin razón social / CUIT cargados"}
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs">
                      <span
                        className={
                          dealership.isActive
                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600"
                            : "rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
                        }
                      >
                        {dealership.isActive ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Tabs defaultValue="exhibition">
            <TabsList>
              <TabsTrigger value="exhibition">Exhibición</TabsTrigger>
              <TabsTrigger value="members">Miembros</TabsTrigger>
            </TabsList>
            <TabsContent value="exhibition" className="pt-3">
              <DealershipExhibitionSection dealershipId={dealershipId} />
            </TabsContent>
            <TabsContent value="members" className="pt-3">
              <DealershipMembersSection dealershipId={dealershipId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
