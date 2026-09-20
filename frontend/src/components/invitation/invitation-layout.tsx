import Link from "next/link";

/**
 * Shell centrado del wizard público de invitación de concesionaria.
 * Marca coherente con app/layout.tsx (Autentia) y patrón CenteredCard de
 * /transfer/qr/[token], pero con card max-w-2xl para soportar los formularios
 * de 2 pasos (feature "Onboarding administrado de concesionaria").
 */
export function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <Link
        href="/"
        className="mb-6 flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80"
      >
        <span className="text-xl font-bold tracking-tight text-foreground">
          Autentia
        </span>
        <span className="text-xs text-muted-foreground">
          Historia auténtica de tu vehículo
        </span>
      </Link>
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}