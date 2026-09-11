"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkshopSelector } from "@/components/layout/workshop-selector";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user, clearSession } = useAuth();
  const activeContext = useActiveContext();

  // Session lost (expired cookies, refresh failure) → redirect to login
  // preserving the intended destination (RF-3).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [status, router]);

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-12 max-w-screen-xl items-center justify-between px-4">
          <Link href="/dashboard" className="text-sm font-semibold">
            HCDV
          </Link>
          <nav className="flex items-center gap-2">
            <WorkshopSelector />
            {/* F-020 / P2-6: la creación de atenciones es WORKSHOP-only — el
                acceso aparece solo con taller seleccionado (UX mínima). */}
            {activeContext?.type === "WORKSHOP" && (
              <Link
                href="/atenciones/nueva"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Nueva atención
              </Link>
            )}
            <Link
              href="/profile"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Mi perfil
            </Link>
            {user && (
              <div className="flex items-center gap-2 ml-2">
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
        </div>
      </header>
      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-screen-xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}