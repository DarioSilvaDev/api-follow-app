/**
 * Tests for the "Mis vehículos" list page (/vehicles).
 *
 * Critical behaviors (F-010 §8 / §10):
 * - Renders the paginated list (plate, catalog triplet, year, color).
 * - Renders "—" when brand/model/version are missing (D-038 / §9 tolerance).
 * - Empty state with CTA "Registrar vehículo" → /vehicles/new.
 * - Load error shows a message and a retry action.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockListVehicles = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    listVehicles: (...args: unknown[]) => mockListVehicles(...args),
  },
}));

// D-039: the Edit button visibility depends on the current session user id.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, status: "authenticated" }),
}));

// Mock UI components to avoid deep dependency trees (existing convention)
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardFooter: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptyMeta = { total: 0, page: 1, limit: 20, totalPages: 0 };

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    licensePlate: "ABC123",
    brand: "Toyota",
    model: "Corolla",
    version: "XEI",
    manufactureYear: 2020,
    modelYear: 2021,
    color: "Rojo",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

let VehiclesPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/vehicles/page");
  VehiclesPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VehiclesPage />
    </QueryClientProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Vehicles list page", () => {
  it("renders vehicles with plate, catalog triplet, year and color", async () => {
    mockListVehicles.mockResolvedValue({
      data: [makeVehicle()],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("Toyota Corolla XEI")).toBeInTheDocument();
    expect(screen.getByText("2020 / 2021")).toBeInTheDocument();
    expect(screen.getByText("Rojo")).toBeInTheDocument();
  });

  it("renders '—' when brand/model/version, years and color are missing", async () => {
    mockListVehicles.mockResolvedValue({
      data: [
        makeVehicle({
          brand: null,
          model: null,
          version: null,
          manufactureYear: null,
          modelYear: null,
          color: null,
        }),
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    // catalog triplet + years + color → at least 3 "—" placeholders
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows the empty state with a CTA to /vehicles/new", async () => {
    mockListVehicles.mockResolvedValue({ data: [], meta: emptyMeta });

    renderPage();

    expect(
      await screen.findByText("No tenés vehículos registrados"),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link", {
      name: /registrar vehículo/i,
    });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/vehicles/new");
  });

  it("shows the load error with a retry action", async () => {
    const user = userEvent.setup();

    mockListVehicles.mockRejectedValueOnce({
      status: 500,
      message: "Internal Server Error",
    });

    renderPage();

    expect(
      await screen.findByText("No se pudieron cargar los vehículos"),
    ).toBeInTheDocument();

    // Retry succeeds
    mockListVehicles.mockResolvedValueOnce({
      data: [makeVehicle()],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(mockListVehicles).toHaveBeenCalledTimes(2);
  });

  it("shows an Editar link for owner vehicles (D-039 / RF-1)", async () => {
    mockListVehicles.mockResolvedValue({
      data: [
        makeVehicle({
          ownerships: [
            {
              id: "o1",
              vehicleId: "v1",
              userId: "user-1",
              type: "owner",
              startsAt: "2026-09-09T00:00:00.000Z",
              endsAt: null,
            },
          ],
        }),
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    renderPage();

    const editLink = await screen.findByRole("link", { name: /editar/i });
    expect(editLink).toHaveAttribute("href", "/vehicles/v1/edit");
  });

  it("does NOT show Editar for co_owner access (D-039: solo owner)", async () => {
    mockListVehicles.mockResolvedValue({
      data: [
        makeVehicle({
          ownerships: [
            {
              id: "o1",
              vehicleId: "v1",
              userId: "user-1",
              type: "co_owner",
              startsAt: "2026-09-09T00:00:00.000Z",
              endsAt: null,
            },
          ],
        }),
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /editar/i })).not.toBeInTheDocument();
  });

  it("does NOT show Editar when the owner row belongs to another user", async () => {
    mockListVehicles.mockResolvedValue({
      data: [
        makeVehicle({
          ownerships: [
            {
              id: "o1",
              vehicleId: "v1",
              userId: "other-user",
              type: "owner",
              startsAt: "2026-09-09T00:00:00.000Z",
              endsAt: null,
            },
            {
              id: "o2",
              vehicleId: "v1",
              userId: "user-1",
              type: "co_owner",
              startsAt: "2026-09-09T00:00:00.000Z",
              endsAt: null,
            },
          ],
        }),
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /editar/i })).not.toBeInTheDocument();
  });
});