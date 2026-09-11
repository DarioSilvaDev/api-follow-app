/**
 * Tests for the vehicle edit form (/vehicles/[id]/edit).
 *
 * Critical behaviors (F-011 §7 RF-5/RF-6/RF-7, §10):
 * - GET /api/vehicles/:id prefills the form (plate, VIN, years, color, notes)
 *   and pre-selects the catalog cascade (brand/model/version, RF-5).
 * - Submit → PATCH /api/vehicles/:id → invalidate ["vehicles"] + redirect.
 * - 409 plate conflict → clear field message; form values preserved.
 * - 403 → access denied message; 404 (preload) → "Vehículo no encontrado".
 * - RF-2: clearing the version select omits versionId from the PATCH body
 *   (partial semantics — the existing version is NOT touched).
 * - D-043 (RF-8): clearing a prefilled optional text/number field sends
 *   explicit null; an already-empty field is omitted (no noise); versionId
 *   only travels when the user explicitly changed it (never null).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: "v1" }),
}));

const mockGetVehicle = vi.fn();
const mockUpdateVehicle = vi.fn();
const mockListBrands = vi.fn();
const mockListModels = vi.fn();
const mockListVersions = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    getVehicle: (...args: unknown[]) => mockGetVehicle(...args),
    updateVehicle: (...args: unknown[]) => mockUpdateVehicle(...args),
    listBrands: (...args: unknown[]) => mockListBrands(...args),
    listModels: (...args: unknown[]) => mockListModels(...args),
    listVersions: (...args: unknown[]) => mockListVersions(...args),
  },
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** GET /:id response shape (VehicleResponseDto, denormalized — F-010 §5). */
interface VehicleDetailOverrides {
  catalog?: boolean;
  vin?: string | null;
  versionId?: string | null;
  manufactureYear?: number | null;
  modelYear?: number | null;
  color?: string | null;
  notes?: string | null;
}

function makeVehicleDetail(overrides: VehicleDetailOverrides = {}) {
  const { catalog = true, ...rest } = overrides;
  return {
    id: "v1",
    licensePlate: "ABC123",
    vin: "WVW123",
    engineNumber: null,
    versionId: catalog ? "v9" : null,
    brand: catalog ? "Toyota" : null,
    model: catalog ? "Corolla" : null,
    version: catalog ? "XEI" : null,
    manufactureYear: 2020,
    modelYear: 2021,
    color: "Rojo",
    notes: "Nota original",
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...rest,
  };
}

function mockCatalogQueries() {
  mockListBrands.mockResolvedValue([{ id: "b1", name: "Toyota" }]);
  mockListModels.mockResolvedValue([
    { id: "m1", brandId: "b1", name: "Corolla" },
  ]);
  mockListVersions.mockResolvedValue([
    { id: "v9", modelId: "m1", name: "XEI" },
    { id: "v10", modelId: "m1", name: "XEI S" },
  ]);
}

let EditVehiclePage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/vehicles/[id]/edit/page");
  EditVehiclePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <EditVehiclePage />
    </QueryClientProvider>
  );
  return { invalidateSpy };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Vehicle edit form", () => {
  it("prefills the form fields from GET /:id (RF-5)", async () => {
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();

    renderPage();

    const plate = (await screen.findByLabelText(/placa/i)) as HTMLInputElement;
    expect(plate.value).toBe("ABC123");
    expect((screen.getByLabelText(/vin/i) as HTMLInputElement).value).toBe(
      "WVW123",
    );
    expect(
      (screen.getByLabelText(/año de fabricación/i) as HTMLInputElement).value,
    ).toBe("2020");
    expect(
      (screen.getByLabelText(/año del modelo/i) as HTMLInputElement).value,
    ).toBe("2021");
    expect((screen.getByLabelText(/color/i) as HTMLInputElement).value).toBe(
      "Rojo",
    );
    expect((screen.getByLabelText(/notas/i) as HTMLTextAreaElement).value).toBe(
      "Nota original",
    );
  });

  it("pre-selects the catalog cascade and submits an explicitly changed versionId (RF-5 + RF-7 + D-043)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    const { invalidateSpy } = renderPage();

    // Prefill resolves brand → model → version from the denormalized names.
    await waitFor(() => {
      expect((screen.getByLabelText("Marca") as HTMLSelectElement).value).toBe(
        "b1",
      );
    });
    await waitFor(() => {
      expect((screen.getByLabelText("Modelo") as HTMLSelectElement).value).toBe(
        "m1",
      );
    });
    await waitFor(() => {
      expect((screen.getByLabelText("Versión") as HTMLSelectElement).value).toBe(
        "v9",
      );
    });

    // D-043: versionId solo viaja cuando el usuario CAMBIA la versión.
    await user.selectOptions(screen.getByLabelText("Versión"), "v10");

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledWith(
        "v1",
        expect.objectContaining({ versionId: "v10", licensePlate: "ABC123" }),
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/vehicles");
    });
  });

  it("shows a field message on 409 plate conflict and preserves the values", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockRejectedValue({
      status: 409,
      message: "Ya existe un vehículo registrado con esa placa",
      code: "VEHICLE_PLATE_EXISTS",
    });

    renderPage();

    const plate = (await screen.findByLabelText(/placa/i)) as HTMLInputElement;
    await user.clear(plate);
    await user.type(plate, "XYZ999");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Ya existe un vehículo registrado con esa placa."),
      ).toBeInTheDocument();
    });

    // RF-6: the form retains the entered values
    expect(plate.value).toBe("XYZ999");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows 'Vehículo no encontrado' + back link on GET 404 (RF-6)", async () => {
    mockGetVehicle.mockRejectedValue({
      status: 404,
      message: "Vehicle not found",
    });

    renderPage();

    expect(
      await screen.findByText("Vehículo no encontrado"),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: /volver a mis vehículos/i,
    });
    expect(link).toHaveAttribute("href", "/vehicles");
  });

  it("shows an access denied message on PATCH 403 (D-039)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockRejectedValue({
      status: 403,
      message: "Forbidden",
    });

    renderPage();

    await screen.findByLabelText(/placa/i);
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(
      await screen.findByText("No tenés permiso para editar este vehículo."),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("omits versionId from the PATCH body when the version is cleared (RF-2)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    renderPage();

    // Wait for the prefill to resolve the cascade.
    const versionSelect = (await screen.findByLabelText(
      "Versión",
    )) as HTMLSelectElement;
    await waitFor(() => expect(versionSelect.value).toBe("v9"));

    // User clears the version → "Seleccionar" (value "").
    await user.selectOptions(versionSelect, "");

    const plate = screen.getByLabelText(/placa/i) as HTMLInputElement;
    await user.clear(plate);
    await user.type(plate, "ABC789");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockUpdateVehicle.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // RF-2/D-040: versionId va como undefined y JSON.stringify lo omite del
    // body que el backend recibe → la versión existente no se toca.
    expect(payload.versionId).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("versionId");
    expect(payload).toHaveProperty("licensePlate", "ABC789");
  });

  it("sends color: null when the user clears a prefilled optional field and omits versionId (D-043 RF-8)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    renderPage();

    const color = (await screen.findByLabelText(/color/i)) as HTMLInputElement;
    expect(color.value).toBe("Rojo");
    await user.clear(color);

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockUpdateVehicle.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // D-043: campo vaciado que tenía contenido → null explícito (no omitido).
    expect(payload).toHaveProperty("color", null);
    expect(JSON.stringify(payload)).toContain('"color":null');
    // La versión no se tocó (prefill v9) → NO viaja versionId (RF-2/D-043).
    expect(payload.versionId).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("versionId");
    // Un campo con valor sigue viajando.
    expect(payload).toHaveProperty("vin", "WVW123");
  });

  it("omits a field that was already empty in the prefill (no noise, D-043 RF-8)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail({ color: null }));
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    renderPage();

    const color = (await screen.findByLabelText(/color/i)) as HTMLInputElement;
    expect(color.value).toBe("");
    // El usuario no toca el campo (ya estaba vacío) → submit.
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockUpdateVehicle.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // D-043: no hay diff → el campo no se envía (ni null ni valor).
    expect(payload).not.toHaveProperty("color");
    expect(JSON.stringify(payload)).not.toContain('"color"');
  });

  it("submits modified values and omits versionId when the version is unchanged (D-043)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    renderPage();

    // Prefill cascade resuelto — la versión original (v9) NO se toca.
    const versionSelect = (await screen.findByLabelText(
      "Versión",
    )) as HTMLSelectElement;
    await waitFor(() => expect(versionSelect.value).toBe("v9"));

    const color = screen.getByLabelText(/color/i) as HTMLInputElement;
    await user.clear(color);
    await user.type(color, "Azul");
    const notes = screen.getByLabelText(/notas/i) as HTMLTextAreaElement;
    await user.clear(notes);
    await user.type(notes, "Nueva nota");

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockUpdateVehicle.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // Valores modificados/con valor → enviados.
    expect(payload).toHaveProperty("color", "Azul");
    expect(payload).toHaveProperty("notes", "Nueva nota");
    expect(payload).toHaveProperty("licensePlate", "ABC123");
    expect(payload).toHaveProperty("vin", "WVW123");
    expect(payload).toHaveProperty("manufactureYear", 2020);
    expect(payload).toHaveProperty("modelYear", 2021);
    // versionId sin cambio → NO viaja (D-043).
    expect(payload.versionId).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("versionId");
  });

  it("sends null (not 0 and not omitted) when manufactureYear is cleared (D-043 RF-8)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicleDetail());
    mockCatalogQueries();
    mockUpdateVehicle.mockResolvedValue(makeVehicleDetail());

    renderPage();

    const year = (await screen.findByLabelText(
      /año de fabricación/i,
    )) as HTMLInputElement;
    expect(year.value).toBe("2020");
    await user.clear(year);

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockUpdateVehicle.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // Campo numérico vaciado con prefill con contenido → null (no 0, no omitido).
    expect(payload).toHaveProperty("manufactureYear", null);
    expect(payload.manufactureYear).not.toBe(0);
    expect(payload.manufactureYear).not.toBeUndefined();
    // modelYear sin tocar (con valor) → se envía como número.
    expect(payload).toHaveProperty("modelYear", 2021);
    expect(payload).toHaveProperty("licensePlate", "ABC123");
  });
});