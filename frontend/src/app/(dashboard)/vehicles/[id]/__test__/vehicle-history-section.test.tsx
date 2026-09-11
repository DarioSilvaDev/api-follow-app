/**
 * Tests for the Historial / timeline section (F-014, D-051/D-052/D-054/D-055).
 *
 * Critical behaviors:
 * - Transfers render "Transferencia {estado}" + from/to actor.
 * - Mileages render "{km} km registrado" + source + notes.
 * - Ownerships render "Inicio de propiedad" / "Propiedad transferida a …".
 * - Empty history → "Sin eventos registrados".
 * - History loads in parallel (progressive) — spinner while pending.
 * - Error state offers Reintentar and refetches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "v1" }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, status: "authenticated" }),
}));

const mockGetVehicle = vi.fn();
const mockListPhotos = vi.fn();
const mockListDocuments = vi.fn();
const mockGetVehicleHistory = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    getVehicle: (...args: unknown[]) => mockGetVehicle(...args),
    listPhotos: (...args: unknown[]) => mockListPhotos(...args),
    listDocuments: (...args: unknown[]) => mockListDocuments(...args),
    getVehicleHistory: (...args: unknown[]) => mockGetVehicleHistory(...args),
  },
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
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => (
    <textarea {...props} />
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** user-1 es owner activo — el resto de las secciones quedan read/empty. */
function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    licensePlate: "ABC123",
    brand: "Toyota",
    model: "Corolla",
    version: "XEI",
    manufactureYear: 2020,
    modelYear: 2021,
    color: null,
    vin: null,
    engineNumber: null,
    notes: null,
    ownerships: [
      {
        id: "o1",
        vehicleId: "v1",
        userId: "user-1",
        type: "owner",
        startsAt: "2026-09-09T00:00:00.000Z",
        endsAt: null,
        user: { id: "user-1", firstName: "Juan", lastName: "Perez" },
      },
    ],
    photos: [],
    documents: [],
    mileages: [],
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

const transferCompleted = {
  id: "t1",
  vehicleId: "v1",
  fromUser: { id: "u1", firstName: "Juan", lastName: "Perez" },
  toUser: { id: "u2", firstName: "Maria", lastName: "Lopez" },
  status: "completed",
  requestedAt: "2026-09-09T00:00:00.000Z",
  respondedAt: "2026-09-10T00:00:00.000Z",
  completedAt: "2026-09-10T00:00:00.000Z",
  expiresAt: null,
  notes: "Entrega presencial",
  createdAt: "2026-09-09T00:00:00.000Z",
};

const mileageOwner = {
  id: "m9",
  vehicleId: "v1",
  mileage: 25000,
  source: "owner",
  notes: "Cambio de aceite",
  recordedAt: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-10T00:00:00.000Z",
};

const ownershipFirst = {
  id: "o1",
  vehicleId: "v1",
  userId: "u1",
  type: "owner",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: null,
  user: { id: "u1", firstName: "Juan", lastName: "Perez" },
};

const ownershipSecond = {
  id: "o2",
  vehicleId: "v1",
  userId: "u2",
  type: "owner",
  startsAt: "2026-09-09T00:00:00.000Z",
  endsAt: null,
  user: { id: "u2", firstName: "Maria", lastName: "Lopez" },
};

let VehicleDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetVehicle.mockResolvedValue(makeVehicle());
  mockListPhotos.mockResolvedValue([]);
  mockListDocuments.mockResolvedValue([]);
  mockGetVehicleHistory.mockResolvedValue({
    transfers: [],
    mileages: [],
    ownerships: [],
  });
  const mod = await import("@/app/(dashboard)/vehicles/[id]/page");
  VehicleDetailPage = mod.default;
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
      <VehicleDetailPage />
    </QueryClientProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Vehicle detail — Historial section (F-014)", () => {
  it("renderiza una transferencia completada con from/to y notas", async () => {
    mockGetVehicleHistory.mockResolvedValue({
      transfers: [transferCompleted],
      mileages: [],
      ownerships: [],
    });

    renderPage();

    expect(await screen.findByText("Transferencia completada")).toBeInTheDocument();
    expect(screen.getByText("De Juan Perez a Maria Lopez")).toBeInTheDocument();
    expect(screen.getByText("Entrega presencial")).toBeInTheDocument();
  });

  it("renderiza un kilometraje con km, source y notas", async () => {
    mockGetVehicleHistory.mockResolvedValue({
      transfers: [],
      mileages: [mileageOwner],
      ownerships: [],
    });

    renderPage();

    const title = `${(25000).toLocaleString("es-AR")} km registrado`;
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText("Propietario")).toBeInTheDocument();
    expect(screen.getByText("Cambio de aceite")).toBeInTheDocument();
  });

  it("renderiza 'Inicio de propiedad' y 'Propiedad transferida a …' (D-055)", async () => {
    mockGetVehicleHistory.mockResolvedValue({
      transfers: [],
      mileages: [],
      ownerships: [ownershipFirst, ownershipSecond],
    });

    renderPage();

    expect(await screen.findByText("Inicio de propiedad")).toBeInTheDocument();
    expect(screen.getByText("Propiedad transferida a Maria Lopez")).toBeInTheDocument();
  });

  it("muestra 'Sin eventos registrados' cuando no hay eventos (RF-3)", async () => {
    renderPage(); // default: arrays vacíos

    expect(await screen.findByText("Sin eventos registrados")).toBeInTheDocument();
  });

  it("muestra el spinner mientras carga el historial (RF-6)", async () => {
    mockGetVehicleHistory.mockReturnValue(new Promise(() => {})); // never resolves

    renderPage();

    expect(
      await screen.findByRole("status", { name: "Cargando historial" }),
    ).toBeInTheDocument();
    // No confundir loading con empty state.
    expect(screen.queryByText("Sin eventos registrados")).not.toBeInTheDocument();
  });

  it("muestra error con Reintentar y reintenta la consulta", async () => {
    const user = userEvent.setup();
    mockGetVehicleHistory.mockRejectedValue({
      status: 500,
      message: "Server error",
    });

    renderPage();

    expect(
      await screen.findByText("No se pudo cargar el historial."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => {
      expect(mockGetVehicleHistory).toHaveBeenCalledTimes(2);
    });
  });
});