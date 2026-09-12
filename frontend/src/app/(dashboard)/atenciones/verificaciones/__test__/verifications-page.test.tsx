/**
 * Tests for the "Verificaciones" page (iteración 2-2, taller).
 *
 * Critical behaviors (spec 2-2 §5-§9, RF-4/RF-5/RF-8, D-024 A2 / D-035):
 * - WORKSHOP-only: sin taller seleccionado solo orienta (el GET no corre).
 * - GET /care-episodes/verifications: cola del taller del contexto activo.
 * - Confirmar → POST /care-episodes/:id/verify (con window.confirm).
 * - Éxito → badge "Verificado por {taller}" y desaparece el botón Confirmar.
 * - Cancelar el confirm → NO llama a la API.
 * - Empty state "Sin verificaciones pendientes".
 * - Error de carga + Reintentar.
 * - 409 del verify → mensaje "ya fue verificado por otro taller".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearWorkshop, selectWorkshop } from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockGetVerifications = vi.fn();
const mockVerify = vi.fn();

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    getCareEpisodeVerifications: (...args: unknown[]) =>
      mockGetVerifications(...args),
    verifyCareEpisode: (...args: unknown[]) => mockVerify(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      workshopMemberships: [
        {
          workshopId: "w1",
          workshop: { id: "w1", name: "Lubricentro Central" },
          role: "Owner",
        },
      ],
    },
  }),
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
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const queueItem = {
  id: "e1",
  title: "Cambio de aceite",
  serviceDate: "2026-06-15T00:00:00.000Z",
  mileageIn: 18500,
  notes: "Aceite 5W30",
  vehicle: {
    licensePlate: "ABC123",
    brand: "Chevrolet",
    model: "Onix",
    version: "LT",
    manufactureYear: 2024,
  },
  owner: { firstName: "Pedro", lastName: "Gómez" },
};

let VerificationsPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  clearWorkshop();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const mod = await import(
    "@/app/(dashboard)/atenciones/verificaciones/page"
  );
  VerificationsPage = mod.default;
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
      <VerificationsPage />
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Verificaciones page (iteración 2-2)", () => {
  it("sin taller seleccionado muestra la guía y NO ejecuta el GET (WORKSHOP-only)", async () => {
    renderPage();

    expect(
      await screen.findByText(
        /seleccioná un taller en el selector del header/i,
      ),
    ).toBeInTheDocument();
    expect(mockGetVerifications).not.toHaveBeenCalled();
  });

  it("happy path: confirma y muestra 'Verificado por {taller}'", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockResolvedValue({ id: "e1", verification: "verified" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    // Datos del item en la cola.
    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText(/ABC123/)).toBeInTheDocument();
    expect(screen.getByText(/Chevrolet Onix LT/)).toBeInTheDocument();
    expect(screen.getByText(/Propietario: Pedro Gómez/)).toBeInTheDocument();
    expect(screen.getByText(/18[.\s]?500 km/)).toBeInTheDocument();
    expect(screen.getByText("Aceite 5W30")).toBeInTheDocument();
    expect(
      screen.getByText("Pendiente de verificación"),
    ).toBeInTheDocument();

    // Confirmar con window.confirm aceptado.
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText(/Verificado por Lubricentro Central/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar/i }),
    ).not.toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith("e1");
    expect(mockGetVerifications).toHaveBeenCalledTimes(1);
  });

  it("cancelar el confirm NO llama a verify ni cambia el estado", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    mockGetVerifications.mockResolvedValue([queueItem]);
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /confirmar/i }));

    expect(mockVerify).not.toHaveBeenCalled();
    expect(screen.getByText("Pendiente de verificación")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
  });

  it("empty state: 'Sin verificaciones pendientes'", async () => {
    mockGetVerifications.mockResolvedValue([]);
    selectWorkshop("w1");

    renderPage();

    expect(
      await screen.findByText("Sin verificaciones pendientes"),
    ).toBeInTheDocument();
  });

  it("error de carga + Reintentar corren el refetch y recuperan la cola", async () => {
    mockGetVerifications
      .mockRejectedValueOnce({ status: 500, message: "Internal" })
      .mockResolvedValueOnce([queueItem]);
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(/no se pudieron cargar las verificaciones/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(
      await screen.findByText("Cambio de aceite"),
    ).toBeInTheDocument();
    expect(mockGetVerifications).toHaveBeenCalledTimes(2);
  });

  it("409 del verify avisa 'ya fue verificado por otro taller' y mantiene el item", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({
      status: 409,
      message: "CARE_EPISODE_ALREADY_VERIFIED",
    });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /este episodio ya fue verificado por otro taller/i,
      ),
    ).toBeInTheDocument();
    // Sigue pendiente: el item mantiene su botón (podrá reintentar de forma
    // natural cuando la cola real lo cambie).
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  it("mapea 404 del verify a 'ya no está disponible'", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({ status: 404, message: "Not found" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(/el episodio ya no está disponible para tu taller/i),
    ).toBeInTheDocument();
  });

  it("mapea 403 del verify a mensaje de permisos / episodio de taller", async () => {
    mockGetVerifications.mockResolvedValue([queueItem]);
    mockVerify.mockRejectedValueOnce({ status: 403, message: "Forbidden" });
    selectWorkshop("w1");

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /confirmar/i }));

    expect(
      await screen.findByText(
        /no tenés permisos o es un episodio de taller/i,
      ),
    ).toBeInTheDocument();
  });
});