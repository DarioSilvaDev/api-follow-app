/**
 * Dashboard layout header — links condicionados al contexto activo.
 *
 * Iteración 2-2 / RF-8:
 * - "Verificaciones" (→ /atenciones/verificaciones) se muestra solo con un
 *   taller seleccionado (WORKSHOP-only, D-024 A2 / D-035).
 * - Regresión: "Nueva atención" conserva el mismo patrón (F-020 / P2-6).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

const mockPush = vi.fn();
const mockClearSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockPush,
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "u1",
      firstName: "Juan",
      lastName: "Perez",
      workshopMemberships: [
        {
          workshopId: "w1",
          workshop: { id: "w1", name: "Lubricentro Central" },
          role: "Owner",
        },
      ],
    },
    clearSession: (...args: unknown[]) => mockClearSession(...args),
  }),
}));

const mockLogout = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    logout: (...args: unknown[]) => mockLogout(...args),
  },
}));

// Mock del selector: la lógica propia de selección se testea en su archivo.
vi.mock("@/components/layout/workshop-selector", () => ({
  WorkshopSelector: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

let DashboardLayout: React.ComponentType<{ children: React.ReactNode }>;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  const mod = await import("@/app/(dashboard)/layout");
  DashboardLayout = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderLayout() {
  return render(
    <DashboardLayout>
      <p>contenido</p>
    </DashboardLayout>,
  );
}

describe("Dashboard header links por contexto activo (iteración 2-2)", () => {
  it("con taller seleccionado muestra 'Verificaciones' (y 'Nueva atención')", async () => {
    selectWorkshop("w1");
    renderLayout();

    const verificaciones = screen.getByRole("link", {
      name: "Verificaciones",
    });
    expect(verificaciones).toHaveAttribute(
      "href",
      "/atenciones/verificaciones",
    );

    // Regresión F-020: mismo patrón para Nueva atención.
    expect(screen.getByRole("link", { name: "Nueva atención" })).toHaveAttribute(
      "href",
      "/atenciones/nueva",
    );
  });

  it("en contexto PERSONAL no muestra 'Verificaciones' ni 'Nueva atención'", async () => {
    renderLayout();

    expect(
      screen.queryByRole("link", { name: "Verificaciones" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Nueva atención" }),
    ).not.toBeInTheDocument();

    // Links permanentes intactos.
    expect(screen.getByRole("link", { name: "HCDV" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Mi perfil" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});