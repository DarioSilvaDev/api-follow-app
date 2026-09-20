"use client";

/**
 * Estado de acceso denegado para secciones del workspace admin.
 *
 * Se muestra cuando el usuario entró al workspace admin (hasAdminAccess) pero
 * NO tiene el permiso de la sección puntual (`can(user, permiso)` false).
 *
 * UX puro — nunca es una boundary de seguridad (el backend enforcea cada
 * endpoint /admin). Copy en español voseo (convención del repo).
 */
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AdminNoAccessState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-base font-semibold text-foreground">
          No tenés permisos para ver esta sección
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Contactá a un administrador de la plataforma.
        </p>
        <div className="mt-4 flex justify-center">
          <Link href="/admin">
            <Button variant="outline">Volver a Administración</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}