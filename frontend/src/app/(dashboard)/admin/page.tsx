"use client";

/**
 * Landing del workspace admin de plataforma.
 * Sección activa: Concesionarias (feature "Onboarding administrado de
 * concesionaria"). Otras secciones admin se sumarán acá cuando el backend
 * tenga perfil/roles/usuarios expuestos.
 */
import Link from "next/link";
import { Store } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
        <p className="text-sm text-muted-foreground">
          Panel administrativo de la plataforma.
        </p>
      </div>

      <Link href="/admin/dealerships" className="transition-opacity hover:opacity-80">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Concesionarias</CardTitle>
                <CardDescription>
                  Crear concesionarias, enviar invitaciones al dueño y
                  monitorear el estado de claim.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </Link>
    </>
  );
}