"use client";

/**
 * Gate UX del workspace admin (feature "Onboarding administrado de
 * concesionaria" + taller D-106 + fundación Platform Workspace).
 *
 * Responsabilidades:
 * 1. Gate de workspace: redirige a /dashboard cuando el usuario NO tiene
 *    acceso admin y la sesión ya resolvió (status !== "loading"). Mientras
 *    carga la sesión muestra un splash mínimo (evita flash de contenido no
 *    autorizado).
 * 2. Indicador de Active Context (decisión PM): barra distintiva "Plataforma"
 *    — el super admin opera con UNA cuenta; la separación personal/laboral se
 *    logra por contexto y la UI debe dejar MUY claro cuándo se administra la
 *    plataforma.
 * 3. Nav hub de secciones admin: Concesionarias / Talleres (+ futuras). Cada
 *    item se renderiza SOLO si el usuario tiene el permiso de la sección
 *    (`can(user, permiso)`). UX pura: nunca es boundary de seguridad.
 *
 * Esto es SOLO navegación/UX: el enforcement real es del backend
 * (PermissionsGuard + permissions admin.* sobre cada endpoint /admin).
 */
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminContextIndicator } from "@/components/admin/admin-context-indicator";
import { useAuth } from "@/hooks/use-auth";
import { can, hasAdminAccess } from "@/lib/admin-access";
import { cn } from "cn";

/** Secciones del hub de navegación admin (permiso backend por sección). */
const ADMIN_SECTIONS = [
  {
    href: "/admin/dealerships",
    label: "Concesionarias",
    permission: "admin.dealerships.list",
  },
  {
    href: "/admin/workshops",
    label: "Talleres",
    permission: "admin.workshops.list",
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    permission: "admin.users.list",
  },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
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

  // El gate de workspace ya garantizó hasAdminAccess(user) → user no null.
  const sections = ADMIN_SECTIONS.filter((section) =>
    can(user, section.permission),
  );
  const isSectionActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <AdminContextIndicator />

      {sections.length > 0 && (
        <nav
          aria-label="Secciones de administración"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                isSectionActive(section.href)
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}