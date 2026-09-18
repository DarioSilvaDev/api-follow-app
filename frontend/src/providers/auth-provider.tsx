"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/types/auth";
import { authApi } from "@/lib/api";
import { clearActiveContext } from "@/lib/active-context";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /** Reload session from /auth/me (called after login, etc.) */
  refreshSession: () => Promise<void>;
  /** Load session and return the user (or null) */
  loadSession: () => Promise<SessionUser | null>;
  /** Clear session state (used after logout / refresh failure) */
  clearSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const mountedRef = useRef(true);

  const loadSession = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const me = await authApi.me();
      if (mountedRef.current) {
        setUser(me);
        setStatus("authenticated");
      }
      return me;
    } catch {
      if (mountedRef.current) {
        setUser(null);
        setStatus("unauthenticated");
      }
      return null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const clearSession = useCallback(() => {
    // F-020 / RF-3 + milstone consignación (D-TL-12): logout resetea el
    // contexto activo a null (WORKSHOP o DEALERSHIP). Si no, el próximo
    // login hereda un contexto stale y toda la navegación PERSONAL falla
    // con 403 INVALID_CONTEXT (ContextResolver, D-020).
    clearActiveContext();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  // Bootstrap: load session once on mount (fetch-on-mount pattern)
  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session bootstrap from external API on mount is the intended fetch-on-mount pattern
    loadSession();

    return () => {
      mountedRef.current = false;
    };
  }, [loadSession]);

  return (
    <AuthContext.Provider
      value={{ status, user, refreshSession, loadSession, clearSession }}
    >
      {/* Linear loading: avoid flashing login page while session resolves */}
      {status === "loading" ? <Splash /> : children}
    </AuthContext.Provider>
  );
}