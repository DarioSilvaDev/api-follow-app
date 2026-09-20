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

/**
 * Pantalla de éxito del wizard de invitación (claim 201).
 *
 * CTA (decisión PM):
 * - Si la sesión ya tiene la membresía de la concesionaria → "Ir a mi
 *   concesionaria" → /dealerships/{id}.
 * - Si no → "Ir al inicio" → /dashboard.
 */
export function InvitationSuccess({
  dealershipId,
  dealershipName,
  hasMembership,
}: {
  dealershipId: string;
  dealershipName: string;
  hasMembership: boolean;
}) {
  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-xl font-semibold">
          ¡Concesionaria activada!
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        <p>
          Ya sos el propietario de{" "}
          <span className="font-medium text-foreground">{dealershipName}</span>.
          La concesionaria quedó activa y visible para tus clientes.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {hasMembership ? (
          <Link href={`/dealerships/${dealershipId}`} className="w-full">
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