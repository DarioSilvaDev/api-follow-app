/**
 * Tests for the "Nueva atención" page (F-020, contexto WORKSHOP).
 *
 * Critical behaviors:
 * - Without a selected workshop → guidance state (WORKSHOP-only design).
 * - Plate lookup: happy path, not-found (404), rate-limit (429), network error,
 *   retry.
 * - Check-in: branch select (from GET /workshops/:id), optional fields,
 *   successful POST → summary "Atención ingresada OK — vehículo {placa}".
 * - Create error (403) → controlled feedback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockLookup = vi.fn();
const mockCreate = vi.fn();
const mockGetWorkshop = vi.fn();

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    lookupVehicleByPlate: (...args: unknown[]) => mockLookup(...args),
    createCareEpisode: (...args: unknown[]) => mockCreate(...args),
  },
  workshopApi: {
    getWorkshop: (...args: unknown[]) => mockGetWorkshop(...args),
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
  Label: (props: React.ComponentProps<"label">) => <label {...props} />,
}));
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.ComponentProps<"select">) => <select {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => <textarea {...props} />,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkshop() {
  return {
    id: "w1",
    name: "Taller Mecánico Central",
    branches: [
      {
        id: "b1",
        workshopId: "w1",
        name: "Sucursal Norte",
        phone: null,
        isHeadquarters: true,
        isActive: true,
      },
      {
        id: "b2",
        workshopId: "w1",
        name: "Sucursal Sur",
        phone: null,
        isHeadquarters: false,
        isActive: true,
      },
    ],
  };
}

function makeVehicle(plate = "ABC123") {
  return {
    id: "v1",
    licensePlate: plate,
    brand: "Toyota",
    model: "Corolla",
    version: "XEI",
    manufactureYear: 2020,
    modelYear: 2021,
  };
}

function makeEpisode() {
  return {
    id: "e1",
    vehicleId: "v1",
    workshopId: "w1",
    branchId: "b1",
    status: "open",
    mileageIn: 50000,
    customerComplaint: "Ruido en el motor",
    customerNotes: null,
    checkedInAt: "2026-09-11T15:00:00.000Z",
    createdAt: "2026-09-11T15:00:00.000Z",
  };
}

let NewCareEpisodePage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  mockGetWorkshop.mockResolvedValue(makeWorkshop());

  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/atenciones/nueva/page");
  NewCareEpisodePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkshop();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewCareEpisodePage />
    </QueryClientProvider>,
  );
}

async function searchPlate(user: ReturnType<typeof userEvent.setup>, plate: string) {
  await user.type(screen.getByLabelText(/placa del vehículo/i), plate);
  await user.click(screen.getByRole("button", { name: /buscar/i }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Nueva atención page (F-020)", () => {
  it("shows guidance when no workshop is selected (WORKSHOP-only)", async () => {
    renderPage();

    expect(
      await screen.findByText(/seleccioná un taller en el selector del header/i),
    ).toBeInTheDocument();
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockGetWorkshop).not.toHaveBeenCalled();
  });

  it("happy path: lookup → check-in form → successful POST summary", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockResolvedValue(makeVehicle());
    mockCreate.mockResolvedValue(makeEpisode());

    renderPage();

    // Normalización de placa (D-037/D-042): lowercase input → uppercase query
    await searchPlate(user, "abc123");

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(
      screen.getByText("Toyota Corolla XEI — 2020 / 2021"),
    ).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledWith("ABC123");

    // Branch (GET /workshops/:id) — la sede se pre-selecciona (spec §5).
    const branchSelect = await screen.findByLabelText(/sucursal/i);
    expect(
      await screen.findByRole("option", { name: /Sucursal Norte/ }),
    ).toBeInTheDocument();
    await user.selectOptions(branchSelect, "b1");

    // Optional check-in fields
    await user.type(screen.getByLabelText(/kilometraje de ingreso/i), "50000");
    await user.type(screen.getByLabelText(/motivo/i), "Ruido en el motor");

    await user.click(screen.getByRole("button", { name: /registrar atención/i }));

    expect(await screen.findByText(/Atención ingresada OK/i)).toBeInTheDocument();
    expect(screen.getByText(/vehículo ABC123/)).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledWith({
      vehicleId: "v1",
      branchId: "b1",
      mileageIn: 50000,
      customerComplaint: "Ruido en el motor",
      customerNotes: undefined,
    });
  });

  it("shows a controlled message when the plate is not found (404)", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValue({
      status: 404,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });

    renderPage();
    await searchPlate(user, "XYZ999");

    expect(
      await screen.findByText(/No se encontró un vehículo con esa placa/i),
    ).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledWith("XYZ999");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /registrar atención/i })).not.toBeInTheDocument();
  });

  it("shows a rate-limit message on 429 and allows retry", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValueOnce({
      status: 429,
      message: "ThrottlerException: Too Many Requests",
    });
    mockLookup.mockResolvedValueOnce(makeVehicle());

    renderPage();
    await searchPlate(user, "ABC123");

    expect(
      await screen.findByText(/Demasiadas búsquedas\. Esperá unos segundos/i),
    ).toBeInTheDocument();

    // Retry succeeds
    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledTimes(2);
  });

  it("shows a network/server error message and retry", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockRejectedValueOnce({ status: 500, message: "Internal Server Error" });
    mockLookup.mockRejectedValueOnce({ status: 0 }); // network-timeout shape

    renderPage();
    await searchPlate(user, "ABC123");

    expect(
      await screen.findByText(/Error interno del servidor/i),
    ).toBeInTheDocument();

    // Retry with a network failure → generic message
    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(
      await screen.findByText(/No se pudo buscar el vehículo/i),
    ).toBeInTheDocument();
  });

  it("maps a 403 on create to a permissions message", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockResolvedValue(makeVehicle());
    mockCreate.mockRejectedValue({ status: 403, message: "Forbidden" });

    renderPage();
    await searchPlate(user, "ABC123");
    expect(await screen.findByText("ABC123")).toBeInTheDocument();

    await screen.findByRole("option", { name: /Sucursal Norte/ });
    await user.selectOptions(screen.getByLabelText(/sucursal/i), "b1");
    await user.click(screen.getByRole("button", { name: /registrar atención/i }));

    expect(
      await screen.findByText(/No tenés permisos para registrar atenciones/i),
    ).toBeInTheDocument();
  });

  it("'Registrar otra atención' resets to the plate search", async () => {
    const user = userEvent.setup();
    selectWorkshop("w1");
    mockLookup.mockResolvedValue(makeVehicle());
    mockCreate.mockResolvedValue(makeEpisode());

    renderPage();
    await searchPlate(user, "ABC123");
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
    await screen.findByRole("option", { name: /Sucursal Norte/ });
    await user.selectOptions(screen.getByLabelText(/sucursal/i), "b1");
    await user.click(screen.getByRole("button", { name: /registrar atención/i }));
    expect(await screen.findByText(/Atención ingresada OK/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /registrar otra atención/i }));

    // Back to the search form (no result card, no create request sent again)
    expect(screen.getByLabelText(/placa del vehículo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Atención ingresada OK/i)).not.toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});