import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  invitationErrorMessage,
  type InvitationErrorKind,
} from "@/lib/invitation-errors";

/**
 * Pantalla de error del wizard de invitación.
 *
 * Inválido / vencido / usado / cancelado → copy claro + "contactá al
 * administrador". NO hay formulario de reenvío (decisión PM D-B: el reenvío
 * solo existe desde el panel admin). Para errores genéricos (5xx / red) se
 * ofrece "Reintentar" además del contacto.
 */
export function InvitationError({
  kind,
  onRetry,
}: {
  kind: InvitationErrorKind;
  onRetry?: () => void;
}) {
  const { title, body } = invitationErrorMessage(kind);
  const isGeneric = kind === "generic";

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        {body}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {isGeneric && onRetry && (
          <Button variant="outline" className="w-full" onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
        )}
        <Link href="/" className="w-full">
          <Button variant={isGeneric ? "ghost" : "outline"} className="w-full">
            Volver al inicio
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}