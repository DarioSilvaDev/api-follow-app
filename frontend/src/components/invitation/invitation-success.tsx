import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvitationKind } from "@/types/invitation";

/**
 * Pantalla de éxito del wizard de invitación (claim 201) — concesionaria y
 * taller (D-106).
 *
 * CTA (decisión PM):
 * - Concesionaria + membresía de sesión → "Ir a mi concesionaria" →
 *   /dealerships/{id}.
 * - Resto (incluye taller; aún no existe /workshops/{id}) → "Ir al inicio" →
 *   /dashboard.
 */
export function InvitationSuccess({
  kind,
  entityId,
  entityName,
  hasMembership,
}: {
  kind: InvitationKind;
  entityId: string;
  entityName: string;
  hasMembership: boolean;
}) {
  const isWorkshop = kind === "workshop";

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-xl font-semibold">
          {isWorkshop ? "¡Taller activado!" : "¡Concesionaria activada!"}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        <p>
          Ya sos el propietario de{" "}
          <span className="font-medium text-foreground">{entityName}</span>. El{" "}
          {isWorkshop ? "taller" : "concesionaria"} quedó{" "}
          {isWorkshop ? "activo" : "activa"} y visible para tus clientes.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {!isWorkshop && hasMembership ? (
          <Link href={`/dealerships/${entityId}`} className="w-full">
            <Button className="w-full">Ir a mi concesionaria</Button>
          </Link>
        ) : (
          <Link href="/dashboard" className="w-full">
            <Button className="w-full">Ir al inicio</Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}