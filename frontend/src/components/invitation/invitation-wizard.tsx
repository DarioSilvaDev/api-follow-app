import { Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "cn";

/**
 * Stepper visual de 2 pasos del wizard de invitación + shell de Card.
 *
 * Paso 1 "Tu cuenta" (registro o login según requiresRegister) y paso 2
 * "Tu concesionaria". El paso activo lleva `aria-current="step"` (requerido
 * por la spec). Los pasos completados muestran un check.
 */
export function InvitationWizard({
  currentStep,
  mode,
  children,
}: {
  currentStep: 1 | 2;
  mode: "register" | "login";
  children: React.ReactNode;
}) {
  const steps = [
    {
      n: 1 as const,
      label: "Tu cuenta",
      description: mode === "register" ? "Creá tu cuenta" : "Iniciá sesión",
    },
    {
      n: 2 as const,
      label: "Tu concesionaria",
      description: "Completá los datos",
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        {/* Stepper verticalmente accesible: aria-current="step" en el activo. */}
        <ol
          aria-label="Progreso del alta de concesionaria"
          className="flex items-center justify-center gap-2"
        >
          {steps.map((step, index) => {
            const isActive = currentStep === step.n;
            const isDone = currentStep > step.n;
            return (
              <li
                key={step.n}
                className="flex items-center gap-2"
                aria-current={isActive ? "step" : undefined}
              >
                {index > 0 && (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-px w-8 bg-border",
                      isDone && "bg-primary/60",
                    )}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isActive &&
                        "bg-primary text-primary-foreground",
                      isDone &&
                        "bg-primary/15 text-primary",
                      !isActive &&
                        !isDone &&
                        "border border-border text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      step.n
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <CardTitle className="pt-4 text-center text-xl font-semibold">
          {currentStep === 1
            ? mode === "register"
              ? "Creá tu cuenta"
              : "Iniciá sesión"
            : "Completá los datos de tu concesionaria"}
        </CardTitle>
        <CardDescription className="text-center">
          {currentStep === 1
            ? mode === "register"
              ? "Registrá tu cuenta para continuar con el alta de tu concesionaria."
              : "Ya tenés una cuenta. Ingresá para continuar con el alta."
            : "El nombre ya está cargado. Completá el resto del perfil público."}
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}