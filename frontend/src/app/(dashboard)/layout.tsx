"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkshopSelector } from "@/components/layout/workshop-selector";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api";
import { cn } from "cn";

const NAV_ITEMS_BASE = [
  { href: "/dashboard", label: "Inicio" },
] as const;

const NAV_ITEMS_WORKSHOP = [
  { href: "/atenciones/nueva", label: "Nueva atención" },
  { href: "/atenciones/verificaciones", label: "Verificaciones" },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, clearSession } = useAuth();
  const activeContext = useActiveContext();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Session lost (expired cookies, refresh failure) → redirect to login
  // preserving the intended destination (RF-3).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [status, router]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if logout fails, clear local state
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  const initials = user
    ? [user.firstName?.[0], user.lastName?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase()
    : null;

  const isWorkshop = activeContext?.type === "WORKSHOP";

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const navLinks = [
    ...NAV_ITEMS_BASE,
    ...(isWorkshop ? NAV_ITEMS_WORKSHOP : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-40">
        <div className="mx-auto flex h-12 max-w-screen-xl items-center justify-between px-4">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="text-base font-bold tracking-tight text-foreground"
          >
            Autentia
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <WorkshopSelector />
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/profile"
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                pathname === "/profile"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              Mi perfil
            </Link>

            {/* User avatar + logout */}
            {user && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
                  title={`${user.firstName} ${user.lastName}`}
                >
                  {initials || <User className="h-3.5 w-3.5" />}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="h-7 w-7"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </nav>

          {/* Mobile hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <WorkshopSelector />
            {user && (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium"
                title={`${user.firstName} ${user.lastName}`}
              >
                {initials || <User className="h-3.5 w-3.5" />}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="h-8 w-8"
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {mobileOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <nav className="flex flex-col px-4 py-3 gap-1">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 text-sm rounded-md transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/profile"
                className={cn(
                  "px-3 py-2 text-sm rounded-md transition-colors",
                  pathname === "/profile"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                Mi perfil
              </Link>
              <div className="border-t border-border mt-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="justify-start gap-2 text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-screen-xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
