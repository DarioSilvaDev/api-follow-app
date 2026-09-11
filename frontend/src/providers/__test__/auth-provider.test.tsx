/**
 * AuthProvider — clearSession() resets the active context (F-020 / RF-3).
 *
 * AC: "logout resetea el contexto a null (próximo login en PERSONAL limpio)".
 * A stale workshopId in memory would 403 every PERSONAL request on the next
 * login (ContextResolver, D-020).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "@/providers/auth-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  clearWorkshop,
  getActiveContext,
  selectWorkshop,
} from "@/lib/active-context";

vi.mock("@/lib/api", () => ({
  authApi: {
    // Session bootstrap fails → provider lands in "unauthenticated".
    me: vi.fn().mockRejectedValue(new Error("no session")),
  },
}));

function LogoutHarness() {
  const { clearSession } = useAuth();
  return (
    <div>
      <button onClick={clearSession}>Cerrar sesión</button>
    </div>
  );
}

afterEach(() => {
  clearWorkshop();
  vi.restoreAllMocks();
});

describe("AuthProvider — clearSession resets active context (RF-3)", () => {
  it("resets the active context to null on logout", async () => {
    selectWorkshop("w1");
    expect(getActiveContext()).toEqual({ type: "WORKSHOP", workshopId: "w1" });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutHarness />
      </AuthProvider>,
    );

    // Provider renderiza los children tras resolver el bootstrap (sin sesión).
    await user.click(
      await screen.findByRole("button", { name: /cerrar sesión/i }),
    );

    expect(getActiveContext()).toBeNull();
  });
});