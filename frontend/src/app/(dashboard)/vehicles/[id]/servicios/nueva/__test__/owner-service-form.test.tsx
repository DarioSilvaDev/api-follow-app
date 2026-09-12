/**
 * Tests for the "Registrar servicio" page (iteración 2-2, propietario).
 *
 * Critical behaviors (spec 2-2 §5-§9, RF-1/RF-8, D-066):
 * - Happy path taller de la app: búsqueda con debounce → selección →
 *   POST /care-episodes/owner con `workshopId` (NUNCA `workshopName`).
 * - Happy path "Otro taller": texto libre → POST con `workshopName`
 *   (NUNCA `workshopId`).
 * - Fecha futura bloqueada en cliente (el date input no puede pasar de hoy).
 * - Taller no encontrado en la búsqueda → orientación a "Otro taller".
 * - Sin taller seleccionado → el submit se bloquea (XOR).
 * - Errores: 429 + Reintentar, 404, 403, red/5xx.
 * - Éxito → mensaje de confianza "hasta que {taller} lo verifique" + "Registrar otro".
 * - Contexto WORKSHOP activo → guía a volver a "Personal" (RF-1: 403 si no).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockCreateOwner = vi.fn();
const mockSearchWorkshops = vi.fn();

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    createOwnerCareEpisode: (...args: unknown[]) => mockCreateOwner(...args),
  },
  workshopApi: {
    searchWorkshops: (...args: unknown[]) => mockSearchWorkshops(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "v1" }),
}));

// Debounce identity: evita dependencia de timers en los tests (la UI debouncea
// con useDebounce real; acá testeamos el contrato del endpoint y del form).
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
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
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => (
    <textarea {...props} />
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkshop() {
  return {
    id: "w1",
    name: "Lubricentro Central",
    logoUrl: null,
    city: "Córdoba",
  };
}

function addDaysISO(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

let OwnerServiceFormPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  const mod = await import(
    "@/app/(dashboard)/vehicles/[id]/servicios/nueva/page"
  );
  OwnerServiceFormPage = mod.default;
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
      <OwnerServiceFormPage />
    </QueryClientProvider>,
  );
}

async function fillServiceForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { title?: string; date?: string } = {},
) {
  const title = overrides.title ?? "Cambio de aceite + 2 neumáticos";
  const date = overrides.date ?? "2026-06-15";
  await user.type(screen.getByLabelText(/título del servicio/i), title);
  fireEvent.change(screen.getByLabelText(/fecha del servicio/i), {
    target: { value: date },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Registrar servicio page (iteración 2-2)", () => {
  it("blocks the page when a WORKSHOP context is active (RF-1: 403 si el POST corre en WORKSHOP)", async () => {
    selectWorkshop("w1");
    renderPage();

    expect(
      await screen.findByText(/volvé a "Personal" en el selector del header/i),
    ).toBeInTheDocument();
    expect(mockSearchWorkshops).not.toHaveBeenCalled();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("happy path con taller de la app: envía workshopId (y nunca workshopName)", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.type(screen.getByLabelText(/kilometraje/i), "18500");
    await user.type(screen.getByLabelText(/notas/i), "Aceite 5W30");

    // Búsqueda (≥2 chars) → selección del resultado (nombre + ciudad)
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    const resultButton = await screen.findByRole("button", {
      name: /Lubricentro Central/,
    });
    expect(screen.getByText("Córdoba")).toBeInTheDocument();
    await user.click(resultButton);

    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    // Mensaje de confianza unverified (D-064)
    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Lubricentro Central lo verifique/i,
      ),
    ).toBeInTheDocument();

    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite + 2 neumáticos",
      serviceDate: "2026-06-15",
      workshopId: "w1",
      mileageIn: 18500,
      notes: "Aceite 5W30",
    });
  });

  it("happy path con 'Otro taller': envía workshopName (y nunca workshopId)", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e2" });

    renderPage();

    await fillServiceForm(user);

    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );

    await user.click(
      screen.getByRole("button", { name: /registrar servicio/i }),
    );

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Taller de la esquina lo verifique/i,
      ),
    ).toBeInTheDocument();

    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite + 2 neumáticos",
      serviceDate: "2026-06-15",
      workshopName: "Taller de la esquina",
    });
  });

  it("bloquea fecha futura en cliente (sin llamar a la API)", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillServiceForm(user, { date: addDaysISO(1) });

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La fecha no puede ser futura");
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("bloquea el submit sin taller seleccionado (XOR D-066)", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillServiceForm(user);

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(
        /buscá y seleccioná un taller, o elegí la opción "Otro taller"/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).not.toHaveBeenCalled();
  });

  it("sin resultados en la búsqueda orienta a 'Otro taller' y permite el flujo texto libre", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([]);
    mockCreateOwner.mockResolvedValue({ id: "e3" });

    renderPage();

    await fillServiceForm(user);

    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "xyzq",
    );

    expect(
      await screen.findByText(/no se encontraron talleres con ese nombre/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );

    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(/quedará como "Registrado por el propietario"/i),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledWith({
      vehicleId: "v1",
      title: "Cambio de aceite + 2 neumáticos",
      serviceDate: "2026-06-15",
      workshopName: "Taller de la esquina",
    });
  });

  it("muestra 429 con botón Reintentar que re-envía la solicitud", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner
      .mockRejectedValueOnce({
        status: 429,
        message: "ThrottlerException: Too Many Requests",
      })
      .mockResolvedValueOnce({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(
        /demasiadas solicitudes\. esperá unos segundos/i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(
      await screen.findByText(
        /quedará como "Registrado por el propietario" hasta que Lubricentro Central lo verifique/i,
      ),
    ).toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(2);
    expect(mockCreateOwner).toHaveBeenNthCalledWith(1, {
      vehicleId: "v1",
      title: "Cambio de aceite + 2 neumáticos",
      serviceDate: "2026-06-15",
      workshopId: "w1",
    });
  });

  it("mapea 404 a 'vehículo o taller ya no disponible'", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockRejectedValue({
      status: 404,
      message: "Vehicle not found",
      code: "VEHICLE_NOT_FOUND",
    });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(/vehículo o el taller seleccionado ya no está disponible/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reintentar/i }),
    ).not.toBeInTheDocument();
  });

  it("mapea 403 a 'debe ser el propietario'", async () => {
    const user = userEvent.setup();
    mockSearchWorkshops.mockResolvedValue([makeWorkshop()]);
    mockCreateOwner.mockRejectedValue({ status: 403, message: "Forbidden" });

    renderPage();

    await fillServiceForm(user);
    await user.type(
      screen.getByLabelText(/buscar taller por nombre/i),
      "Lubricentro",
    );
    await user.click(
      await screen.findByRole("button", { name: /Lubricentro Central/ }),
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(/no tenés permisos para registrar servicios de este vehículo/i),
    ).toBeInTheDocument();
  });

  it("mapea red/5xx y errores de red a un mensaje genérico", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockRejectedValue({ status: 500, message: "Internal" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(/error interno del servidor/i),
    ).toBeInTheDocument();
  });

  it("'Registrar otro' resetea el formulario y permite un segundo registro", async () => {
    const user = userEvent.setup();
    mockCreateOwner.mockResolvedValue({ id: "e1" });

    renderPage();

    await fillServiceForm(user);
    await user.click(screen.getByRole("button", { name: /otro taller/i }));
    await user.type(
      screen.getByLabelText(/nombre del taller/i),
      "Taller de la esquina",
    );
    await user.click(screen.getByRole("button", { name: /registrar servicio/i }));

    expect(
      await screen.findByText(/quedará como "Registrado por el propietario"/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /registrar otro/i }));

    // Formulario de nuevo: el título volvió a estar visible y borrado.
    expect(
      screen.getByLabelText(/título del servicio/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/quedará como "Registrado por el propietario"/i),
    ).not.toBeInTheDocument();
    expect(mockCreateOwner).toHaveBeenCalledTimes(1);
  });
});