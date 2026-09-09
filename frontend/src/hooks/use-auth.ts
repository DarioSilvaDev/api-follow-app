"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/providers/auth-provider";

/**
 * Access auth session state and methods.
 *
 * Must be used within an <AuthProvider>.
 *
 * Provides:
 * - status: 'loading' | 'authenticated' | 'unauthenticated'
 * - user: SessionUser | null
 * - refreshSession(): reload from GET /auth/me
 * - loadSession(): same as refreshSession but returns user
 * - clearSession(): reset to unauthenticated
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
