"use client";

/**
 * Gate UX del workspace admin (feature "Onboarding administrado de
 * concesionaria").
 *
 * Redirige a /dashboard cuando el usuario NO tiene acceso admin y la sesión ya
 * resolvió (status !== "loading"). Mientras carga la sesión muestra un splash
 * mínimo (evita flash de contenido no autorizado).
 *
 * Esto es SOLO navegación/UX: el enforcement real es del backend
 * (PermissionsGuard + permissions admin.* sobre cada endpoint /admin).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminAccess } from "@/lib/admin-access";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== "loading" && !hasAdminAccess(user)) {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  if (status === "loading" || !hasAdminAccess(user)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      {children}
    </div>
  );
}