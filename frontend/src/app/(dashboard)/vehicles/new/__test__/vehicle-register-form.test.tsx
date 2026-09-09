/**
 * Tests for the vehicle registration form (/vehicles/new).
 *
 * Critical behaviors (F-010 §7 RF-6/RF-7, §10):
 * - Plate validation (alphanumeric 2–10) blocks the submit (D-037).
 * - Successful submit → normalized plate (uppercase) + redirect to /vehicles
 *   after invalidating the list query and refreshing the session.
 * - 409 plate conflict → clear field message; form values preserved.
 * - 409 VIN conflict → clear VIN message.
 * - Optional catalog cascade (brand → model → version) sends versionId (D-038).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockRegister = vi.fn();
const mockListBrands = vi.fn();
const mockListModels = vi.fn();
const mockListVersions = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    registerVehicle: (...args: unknown[]) => mockRegister(...args),
    listBrands: (...args: unknown[]) => mockListBrands(...args),
    listModels: (...args: unknown[]) => mockListModels(...args),
    listVersions: (...args: unknown[]) => mockListVersions(...args),
  },
}));

const mockRefreshSession = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ refreshSession: mockRefreshSession }),
}));

// Mock UI components to avoid deep dependency trees (existing convention)
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
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
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.ComponentProps<"select">) => <select {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => (
    <textarea {...props} />
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

// ── Dynamic import of SUT ────────────────────────────────────────────────────

let NewVehiclePage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/vehicles/new/page");
  NewVehiclePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NewVehiclePage />
    </QueryClientProvider>
  );
  return { invalidateSpy };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Vehicle register form", () => {
  it("blocks submit with an invalid plate (non-alphanumeric)", async () => {
    const user = userEvent.setup();
    mockListBrands.mockResolvedValue([]);

    renderForm();

    await user.type(screen.getByLabelText(/placa/i), "A!");
    await user.click(screen.getByRole("button", { name: /registrar vehículo/i }));

    await waitFor(() => {
      expect(
        screen.getByText("La placa solo puede contener letras y números"),
      ).toBeInTheDocument();
    });
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("submits a normalized plate, invalidates the list and redirects to /vehicles", async () => {
    const user = userEvent.setup();
    mockListBrands.mockResolvedValue([]);
    mockRegister.mockResolvedValue({
      id: "v1",
      licensePlate: "ABC123",
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    });
    mockRefreshSession.mockResolvedValue(undefined);

    const { invalidateSpy } = renderForm();

    // D-037: lowercase + spaces are normalized to uppercase trimmed
    await user.type(screen.getByLabelText(/placa/i), "  abc123  ");
    await user.click(screen.getByRole("button", { name: /registrar vehículo/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ licensePlate: "ABC123" }),
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
    });
    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/vehicles");
    });
  });

  it("shows a clear message on 409 plate conflict and preserves form values", async () => {
    const user = userEvent.setup();
    mockListBrands.mockResolvedValue([]);
    mockRegister.mockRejectedValue({
      status: 409,
      message: "Vehicle with plate 'ABC123' already exists",
      code: "VEHICLE_PLATE_EXISTS",
    });

    renderForm();

    await user.type(screen.getByLabelText(/placa/i), "abc123");
    await user.click(screen.getByRole("button", { name: /registrar vehículo/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Ya existe un vehículo registrado con esa placa."),
      ).toBeInTheDocument();
    });

    // RF-6: the form retains the entered values
    const plateInput = screen.getByLabelText(/placa/i) as HTMLInputElement;
    expect(plateInput.value).toBe("abc123");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a clear message on 409 VIN conflict", async () => {
    const user = userEvent.setup();
    mockListBrands.mockResolvedValue([]);
    mockRegister.mockRejectedValue({
      status: 409,
      message: "Vehicle with vin 'WVW123' already exists",
    });

    renderForm();

    await user.type(screen.getByLabelText(/placa/i), "ABC123");
    await user.type(screen.getByLabelText(/vin/i), "WVW123");
    await user.click(screen.getByRole("button", { name: /registrar vehículo/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Ya existe un vehículo registrado con ese VIN."),
      ).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("loads catalog on demand and sends versionId (cascade, D-038)", async () => {
    const user = userEvent.setup();
    mockListBrands.mockResolvedValue([{ id: "b1", name: "Toyota" }]);
    mockListModels.mockResolvedValue([
      { id: "m1", brandId: "b1", name: "Corolla" },
    ]);
    mockListVersions.mockResolvedValue([
      { id: "v1", modelId: "m1", name: "XEI" },
    ]);
    mockRegister.mockResolvedValue({
      id: "v1",
      licensePlate: "ABC123",
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    });

    renderForm();

    // Brand → models loaded on demand
    await user.type(screen.getByLabelText(/placa/i), "ABC123");
    await user.selectOptions(screen.getByLabelText("Marca"), "b1");
    expect(await screen.findByRole("option", { name: "Corolla" })).toBeInTheDocument();
    expect(mockListModels).toHaveBeenCalledWith("b1");

    // Model → versions loaded on demand
    await user.selectOptions(screen.getByLabelText("Modelo"), "m1");
    expect(await screen.findByRole("option", { name: "XEI" })).toBeInTheDocument();
    expect(mockListVersions).toHaveBeenCalledWith("m1");

    // Version selection → versionId in the submit payload
    await user.selectOptions(screen.getByLabelText("Versión"), "v1");
    await user.click(screen.getByRole("button", { name: /registrar vehículo/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: "v1" }),
      );
    });
  });
});