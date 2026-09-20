/**
 * Tests del panel de transferencias (/transferencias) — Fase 1 / D-078.
 *
 * Comportamientos críticos (spec §6-§7, RF-1/RF-6/RF-7 + D-078):
 * - Pestañas Recibidas/Enviadas (Tabs Base UI, lazy por keepMounted=false).
 * - Items con vehicle desnormalizado + contraparte SIN email (PII).
 * - Estados: loading (skeleton), error + Reintentar, empty states.
 * - Acciones con confirmación (Aceptar/Rechazar/Cancelar) y error por item.
 * - 400 "Transfer has expired" → mensaje "La solicitud venció y ya no puede
 *   aceptarse." + refetch (Ajuste 1 UX: recomputo client-side de expirada).
 * - CTA "Transferir vehículo" → TransferDialog con vehículos propios (D-084).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockListIncoming = vi.fn();
const mockListOutgoing = vi.fn();
const mockListVehicles = vi.fn();
const mockAcceptTransfer = vi.fn();
const mockRejectTransfer = vi.fn();
const mockCancelTransfer = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    listIncomingTransfers: (...args: unknown[]) => mockListIncoming(...args),
    listOutgoingTransfers: (...args: unknown[]) => mockListOutgoing(...args),
    listVehicles: (...args: unknown[]) => mockListVehicles(...args),
    acceptTransfer: (...args: unknown[]) => mockAcceptTransfer(...args),
    rejectTransfer: (...args: unknown[]) => mockRejectTransfer(...args),
    cancelTransfer: (...args: unknown[]) => mockCancelTransfer(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, status: "authenticated" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

// Stub del diálogo compartido: la lógica propia se testea en su archivo.
vi.mock("@/components/transfer/transfer-dialog", () => ({
  TransferDialog: ({
    open,
    vehicles,
    onOpenChange,
  }: {
    open: boolean;
    vehicles?: unknown[];
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="transfer-dialog-stub">
      <p data-testid="transfer-dialog-open">{String(open)}</p>
      <p data-testid="transfer-dialog-vehicles">{vehicles?.length ?? 0}</p>
      <button onClick={() => onOpenChange(!open)}>toggle-transfer-dialog</button>
    </div>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fecha relativa a hoy (días desde Date.now()): fixtures robustos que no se
 * vencen con el paso del tiempo (los viáticos fijos con expiresAt pasado
 * hacían que el recomputo client-side marcara "Expirada").
 */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Transferencia entrante válida: emisor = Ana, receptor = user-1 (Juan). */
function makeIncoming(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    status: "pending",
    requestedAt: daysFromNow(-5),
    expiresAt: daysFromNow(5),
    notes: null,
    vehicle: {
      id: "v1",
      licensePlate: "ABC123",
      manufactureYear: 2020,
      modelYear: 2021,
      color: "Rojo",
    },
    fromUser: { id: "u-other", firstName: "Ana", lastName: "Perez" },
    toUser: { id: "user-1", firstName: "Juan", lastName: "Garcia" },
    ...overrides,
  };
}

/** Transferencia saliente válida: emisor = user-1 (Juan), receptor = Ana. */
function makeOutgoing(overrides: Record<string, unknown> = {}) {
  return makeIncoming({
    id: "t2",
    vehicle: { id: "v2", licensePlate: "XYZ789" },
    fromUser: { id: "user-1", firstName: "Juan", lastName: "Garcia" },
    toUser: { id: "u-other", firstName: "Ana", lastName: "Perez" },
    ...overrides,
  });
}

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    licensePlate: "ABC123",
    manufactureYear: 2020,
    modelYear: 2021,
    color: "Rojo",
    ownerships: [
      {
        id: "o1",
        vehicleId: "v1",
        userId: "user-1",
        type: "owner",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: null,
      },
    ],
    ...overrides,
  };
}

function emptyMeta() {
  return { total: 0, page: 1, limit: 100, totalPages: 0 };
}

let PanelPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockListVehicles.mockResolvedValue({ data: [], meta: emptyMeta() });
  const mod = await import("@/app/(dashboard)/transferencias/page");
  PanelPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PanelPage />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Transferencias panel page (Fase 1 / D-078)", () => {
  it("renderiza pestañas y las recibidas por defecto (sin email de la contraparte)", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    expect(screen.getByRole("tab", { name: "Recibidas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Enviadas" })).toBeInTheDocument();

    // Item: placa → link al detalle del vehículo.
    const plate = await screen.findByText("ABC123");
    expect(plate.closest("a")).toHaveAttribute("href", "/vehicles/v1");

    // Contraparte (emisor) con nombre completo…
    expect(screen.getByText(/^De\b/)).toBeInTheDocument();
    expect(screen.getByText("Ana Perez")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    // …y NUNCA el email (PII / D-078).
    expect(screen.queryByText(/ana@/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/perez@/i)).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Aceptar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });

  it("muestra notas cuando existen", async () => {
    mockListIncoming.mockResolvedValue([
      makeIncoming({ notes: "Entrega de llaves al mediodía" }),
    ]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText(/Entrega de llaves al mediodía/),
    ).toBeInTheDocument();
  });

  it("cambia a la pestaña Enviadas y muestra receptor + Cancelar", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([makeOutgoing()]);

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "Enviadas" }));

    expect(await screen.findByText("XYZ789")).toBeInTheDocument();
    expect(screen.getByText("Ana Perez")).toBeInTheDocument();
    expect(screen.getByText(/^Para\b/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
    // En Enviadas no hay acciones de receptor.
    expect(
      screen.queryByRole("button", { name: "Aceptar" }),
    ).not.toBeInTheDocument();
  });

  it("estado vacío de recibidas", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText("Sin transferencias recibidas"),
    ).toBeInTheDocument();
    // Ajuste 4 UX (§6.7): Recibidas vacía SIN acción extra → solo el CTA del header.
    expect(
      screen.getAllByRole("button", { name: "Transferir vehículo" }),
    ).toHaveLength(1);
  });

  it("Ajuste 4 UX (§6.7): estado vacío de Enviadas con CTA 'Transferir vehículo'", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);
    mockListVehicles.mockResolvedValue({ data: [], meta: emptyMeta() });

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "Enviadas" }));

    expect(
      await screen.findByText("Sin transferencias enviadas"),
    ).toBeInTheDocument();
    // Header + CTA del empty state = 2 botones; click en el CTA del estado.
    const ctas = screen.getAllByRole("button", {
      name: "Transferir vehículo",
    });
    expect(ctas).toHaveLength(2);
    await userEvent.click(ctas[1]);

    const stub = screen.getByTestId("transfer-dialog-stub");
    expect(within(stub).getByTestId("transfer-dialog-open")).toHaveTextContent(
      "true",
    );
  });

  it("Ajuste 3b UX: hash #enviadas abre el panel en la pestaña Enviadas", async () => {
    window.location.hash = "#enviadas";
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([makeOutgoing()]);

    renderPage();

    // La pestaña Enviadas es la activa → el item enviado es visible sin click.
    expect(await screen.findByText("XYZ789")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();

    window.location.hash = "";
  });

  it("error de carga + Reintentar recupera la lista", async () => {
    mockListIncoming
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText("No se pudieron cargar las transferencias recibidas"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("ABC123")).toBeInTheDocument();
  });

  it("acepta con confirmación y refresca la lista", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);
    mockAcceptTransfer.mockResolvedValue({ id: "t1", status: "accepted" });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Aceptar" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Aceptar transferencia"),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar" }));

    await waitFor(() => {
      expect(mockAcceptTransfer).toHaveBeenCalledWith("t1");
    });
    // Refetch post-éxito → el item sigue presente.
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
  });

  it("Ajuste 6 UX: aceptar muestra banner inline e invalida AMBAS listas y ['vehicles']", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([makeOutgoing()]);
    mockAcceptTransfer.mockResolvedValue({ id: "t1", status: "accepted" });
    mockListVehicles.mockResolvedValue({ data: [], meta: emptyMeta() });
    const { invalidateSpy } = renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Aceptar" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar" }));

    // Banner transitorio inline (role="status", NO toast).
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Transferencia aceptada. El vehículo ahora es tuyo.");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["transfers"] }),
      );
      // §6.2: post-aceptación "Mis vehículos" se invalida de inmediato.
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["vehicles"] }),
      );
    });
  });

  it("rechaza con confirmación", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);
    mockRejectTransfer.mockResolvedValue({ id: "t1", status: "rejected" });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Rechazar" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Rechazar transferencia"),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Rechazar" }));

    await waitFor(() => {
      expect(mockRejectTransfer).toHaveBeenCalledWith("t1");
    });
  });

  it("cancela una transferencia enviada con confirmación ('Sí, cancelar solicitud' / 'Volver')", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([makeOutgoing()]);
    mockCancelTransfer.mockResolvedValue({ id: "t2", status: "cancelled" });

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "Enviadas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Cancelar transferencia"),
    ).toBeInTheDocument();
    // Ajuste 7 UX (§6.4): primario sin colisión con "Cancelar"; cierre "Volver".
    expect(
      within(dialog).getByRole("button", { name: "Volver" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Sí, cancelar solicitud" }),
    );

    await waitFor(() => {
      expect(mockCancelTransfer).toHaveBeenCalledWith("t2");
    });
  });

  it("Ajuste 5 UX: doble-submit bloqueado — spinner 'Cancelando…' y botones deshabilitados", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([makeOutgoing()]);
    let resolveCancel!: (value: unknown) => void;
    mockCancelTransfer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve;
        }),
    );

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "Enviadas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Sí, cancelar solicitud" }),
    );

    const busyConfirm = within(dialog).getByRole("button", {
      name: /cancelando/i,
    });
    expect(busyConfirm).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Volver" })).toBeDisabled();

    resolveCancel({ id: "t2", status: "cancelled" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("error 400 expirada: mensaje por item y cierra la confirmación", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);
    mockAcceptTransfer.mockRejectedValue({
      status: 400,
      message: "Transfer has expired",
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Aceptar" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar" }));

    expect(
      await screen.findByText("La solicitud venció y ya no puede aceptarse."),
    ).toBeInTheDocument();
    // La confirmación se cerró (el error vive en el item, no en el modal).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockAcceptTransfer).toHaveBeenCalledWith("t1");
  });

  it("error 403 no-dirigida en recibidas", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);
    mockAcceptTransfer.mockRejectedValue({
      status: 403,
      message: "This transfer is not addressed to you",
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Aceptar" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aceptar" }));

    expect(
      await screen.findByText("No tenés permiso para realizar esta acción."),
    ).toBeInTheDocument();
  });

  it("Ajuste 1 UX (§6.5): pending con expiresAt pasado se muestra 'Expirada' (recomputo client-side)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockListIncoming.mockResolvedValue([
      makeIncoming({ status: "pending", expiresAt: past }),
    ]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    // Badge Expirada en vez de Pendiente.
    expect(await screen.findByText("Expirada")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
    // Copy de vencimiento (Recibidas) y SIN acciones (terminal §6.4).
    expect(screen.getByText(/La solicitud venció el/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aceptar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rechazar" }),
    ).not.toBeInTheDocument();
  });

  it("Ajuste 2 UX (§6.4/D-092): Enviadas expirada conserva 'Cancelar' (desbloquea el vehículo)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([
      makeOutgoing({ status: "pending", expiresAt: past }),
    ]);

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "Enviadas" }));

    expect(await screen.findByText("Expirada")).toBeInTheDocument();
    expect(screen.getByText(/Vencía el/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });

  it("CTA 'Transferir vehículo' abre el diálogo con los vehículos propios", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);
    mockListVehicles.mockResolvedValue({ data: [makeVehicle()], meta: emptyMeta() });

    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: "Transferir vehículo" }),
    );

    const stub = screen.getByTestId("transfer-dialog-stub");
    expect(within(stub).getByTestId("transfer-dialog-open")).toHaveTextContent(
      "true",
    );
    expect(
      within(stub).getByTestId("transfer-dialog-vehicles"),
    ).toHaveTextContent("1");
  });

  it("filtra vehículos ajenos (no los lista como transferibles)", async () => {
    mockListIncoming.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);
    mockListVehicles.mockResolvedValue({
      data: [
        makeVehicle({
          ownerships: [
            {
              id: "o2",
              vehicleId: "v1",
              userId: "other-user",
              type: "owner",
              startsAt: "2026-01-01T00:00:00.000Z",
              endsAt: null,
            },
          ],
        }),
      ],
      meta: emptyMeta(),
    });

    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: "Transferir vehículo" }),
    );

    const stub = screen.getByTestId("transfer-dialog-stub");
    expect(
      within(stub).getByTestId("transfer-dialog-vehicles"),
    ).toHaveTextContent("0");
  });

  it("muestra 'Pendiente' como badge y fecha de pedido", async () => {
    mockListIncoming.mockResolvedValue([makeIncoming()]);
    mockListOutgoing.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Pedido el/)).toBeInTheDocument();
  });
});