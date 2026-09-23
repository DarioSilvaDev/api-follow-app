/**
 * Tests for the CareEpisode detail page (iteración 2-4, S1/S4/S5/S6).
 *
 * Ruta: /vehicles/[id]/servicios/[servicioId]
 * - Loading / terminales 404 / 403 / 5xx+Reintentar.
 * - Proyección por actor: taller del episodio ve internalNotes; owner no.
 * - Galería de evidencia agrupada por fase + EmptyState.
 * - Uploader SOLO para taller-del-episodio + open + unverified (S4).
 * - Remoción S5: botón disabled+copytip para no autorizados; dialog con
 *   motivo OBLIGATORIO para el propietario; DELETE → invalida (refetch).
 * - Upload secuencial (1 request por archivo) → onUploaded invalida.
 *
 * Backend siempre es la autoridad; la página solo decide VISIBILIDAD y
 * feedback (los errores del backend se resuelven en care-episode-errors.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ActiveContext } from "@/lib/active-context";
import type {
  CareEpisodeAttachment,
  CareEpisodeDetail,
} from "@/types/care-episode";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "v1", servicioId: "e1" }),
}));

const mockGetDetail = vi.fn();
const mockUpload = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/api", () => ({
  careEpisodeApi: {
    getCareEpisodeDetail: (...args: unknown[]) => mockGetDetail(...args),
    uploadAttachment: (...args: unknown[]) => mockUpload(...args),
    deleteAttachment: (...args: unknown[]) => mockDelete(...args),
  },
}));

let authUser: { id: string; isVehicleOwner: boolean } | null;
let activeContext: ActiveContext;

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseActiveContext = vi.fn();
vi.mock("@/hooks/use-active-context", () => ({
  useActiveContext: () => mockUseActiveContext(),
}));

// Mock UI primitives (convención repo) — dialog se controla por `open`.
// `buttonVariants` se mantiene como stub puro: el 404 usa Link +
// buttonVariants({ variant: "outline" }) y el test solo verifica el href.
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: () => "",
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
}));
vi.mock("@/components/ui/dialog", () => {
  const Dialog = ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null);
  const DialogPopup = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  const DialogTitle = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <h2 {...props}>{children}</h2>;
  const DialogDescription = ({
    children,
    ...props
  }: React.ComponentProps<"div">) => <div {...props}>{children}</div>;
  const DialogClose = ({
    children,
    ...props
  }: React.ComponentProps<"button">) => <button {...props}>{children}</button>;
  return { Dialog, DialogPopup, DialogTitle, DialogDescription, DialogClose };
});
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: (props: React.ComponentProps<"select">) => <select {...props} />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAttachment(
  overrides: Partial<CareEpisodeAttachment> = {},
): CareEpisodeAttachment {
  return {
    id: "a1",
    key: "care-episodes/e1/a1",
    originalName: "foto.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    caption: "Recepción del vehículo",
    phase: "before",
    uploadedByMemberId: "m1",
    uploadedByUserId: null,
    removed: false,
    createdAt: "2026-09-12T10:05:00.000Z",
    url: "https://signed.example/a1",
    expiresAt: "2026-09-13T10:05:00.000Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<CareEpisodeDetail> = {}): CareEpisodeDetail {
  return {
    id: "e1",
    vehicleId: "v1",
    vehicle: {
      id: "v1",
      licensePlate: "ABC123",
      brand: "Toyota",
      model: "Corolla",
      manufactureYear: 2020,
    },
    status: "open",
    source: "workshop",
    verification: "unverified",
    title: "Cambio de aceite",
    serviceDate: "2026-09-12",
    workshopId: "w1",
    workshopName: "Lubricentro Central",
    mileageIn: 68500,
    customerComplaint: "Ruido al acelerar",
    customerNotes: "Aceite 5W30",
    internalNotes: undefined,
    checkedInAt: "2026-09-12T09:00:00.000Z",
    closedAt: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    attachments: { before: [], work: [], after: [], other: [] },
    attachmentCount: 0,
    ...overrides,
  };
}

let CareEpisodeDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  authUser = { id: "u1", isVehicleOwner: true };
  activeContext = null;
  mockUseAuth.mockImplementation(() => ({
    user: authUser,
    status: "authenticated",
  }));
  mockUseActiveContext.mockImplementation(() => activeContext);
  mockGetDetail.mockResolvedValue(makeDetail());
  mockUpload.mockResolvedValue(makeAttachment({ id: "a1" }));
  mockDelete.mockResolvedValue(undefined);
  const mod = await import(
    "@/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/page"
  );
  CareEpisodeDetailPage = mod.default;
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
      <CareEpisodeDetailPage />
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CareEpisode detail page (iteración 2-4)", () => {
  it("muestra el spinner mientras carga (S1)", async () => {
    mockGetDetail.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(
      await screen.findByRole("status", { name: "Cargando servicio" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cambio de aceite")).not.toBeInTheDocument();
  });

  it("404 → terminal 'Servicio no encontrado' + Volver al vehículo", async () => {
    mockGetDetail.mockRejectedValue({ status: 404, message: "Not found" });

    renderPage();

    expect(await screen.findByText("Servicio no encontrado")).toBeInTheDocument();
    expect(
      screen.getByText(/servicio no encontrado o ya no está disponible/i),
    ).toBeInTheDocument();

    const back = screen.getByRole("link", { name: /volver al vehículo/i });
    expect(back).toHaveAttribute("href", "/vehicles/v1");
  });

  it("5xx → mensaje genérico + Reintentar refetchea", async () => {
    const user = userEvent.setup();
    mockGetDetail
      .mockRejectedValueOnce({ status: 500, message: "Server error" })
      .mockResolvedValueOnce(makeDetail());

    renderPage();

    expect(
      await screen.findByText("No se pudo cargar el servicio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no se pudo completar la acción/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(mockGetDetail).toHaveBeenCalledTimes(2);
  });

  it("403 → copy de permiso + Reintentar (sin back-link de 404)", async () => {
    const user = userEvent.setup();
    mockGetDetail
      .mockRejectedValueOnce({ status: 403, message: "Forbidden" })
      .mockResolvedValueOnce(makeDetail());

    renderPage();

    expect(
      await screen.findByText(/no tenés permiso para ver este servicio/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /volver al vehículo/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
  });

  it("proyección owner: ve reclamo/notas pero NUNCA internalNotes; sin uploader en episodio owner (S1)", async () => {
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "unverified",
        internalNotes: undefined,
      }),
    );

    renderPage();

    expect(await screen.findByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText("Ruido al acelerar")).toBeInTheDocument();
    expect(screen.getByText("Aceite 5W30")).toBeInTheDocument();
    expect(screen.getByText("Registrado por el propietario")).toBeInTheDocument();
    expect(screen.queryByText("Notas internas")).not.toBeInTheDocument();

    // Episodios owner no admiten evidencia posterior (403 backend).
    expect(
      screen.queryByRole("button", { name: /adjuntar fotos/i }),
    ).not.toBeInTheDocument();

    // EmptyState de la galería
    expect(
      screen.getByText("Sin imágenes de evidencia"),
    ).toBeInTheDocument();
  });

  it("proyección taller-del-episodio: ve internalNotes, uploader visible y remoción sin motivo (S1/S4/S5)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };
    mockGetDetail.mockResolvedValue(
      makeDetail({
        internalNotes: "Repasar ajuste de frenos",
        attachments: {
          before: [makeAttachment({ id: "a1" })],
          work: [],
          after: [],
          other: [],
        },
        attachmentCount: 1,
      }),
    );

    renderPage();

    expect(await screen.findByText("Notas internas")).toBeInTheDocument();
    expect(screen.getByText("Repasar ajuste de frenos")).toBeInTheDocument();

    // Uploader habilitado (fuente workshop + contexto del taller + open + unverified)
    expect(screen.getByRole("button", { name: /adjuntar fotos/i })).toBeEnabled();

    // Galería: grupo "Antes" (heading; getByText matchearía también el
    // <option value="before">Antes</option> del select de fase del uploader)
    expect(
      screen.getByRole("heading", { name: /antes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Recepción del vehículo" }),
    ).toBeInTheDocument();

    // Remoción visible SIN botón disabled (miembro del taller del episodio)
    expect(screen.queryAllByTestId("remove-disabled")).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: /eliminar imagen recepción del vehículo/i }),
    );

    // Diálogo sin selector de motivo (self-removal / cleanup del taller)
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Eliminar imagen");
    expect(dialog).toHaveTextContent(
      /se eliminará de la historia del vehículo/i,
    );
    expect(
      screen.queryByLabelText(/motivo/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("e1", "a1", {});
    });
    // éxito → invalida → refetch del detalle
    await waitFor(() => {
      expect(mockGetDetail.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("propietario en PERSONAL: remoción exige motivo y envía removedReason (S5)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: true };
    activeContext = null;
    mockGetDetail.mockResolvedValue(
      makeDetail({
        source: "owner",
        verification: "unverified",
        attachments: { before: [], work: [], after: [], other: [makeAttachment()] },
        attachmentCount: 1,
      }),
    );

    renderPage();

    const deleteButton = await screen.findByRole("button", {
      name: /eliminar imagen recepción del vehículo/i,
    });
    await user.click(deleteButton);

    const dialog = await screen.findByRole("dialog");
    const reasonSelect = screen.getByLabelText(/motivo/i);
    expect(reasonSelect).toBeInTheDocument();

    // Submit deshabilitado hasta elegir motivo
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();

    await user.selectOptions(reasonSelect, "duplicada");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("e1", "a1", {
        removedReason: "duplicada",
      });
    });
  });

  it("lector neutral (taller ajeno): botón de eliminación disabled con copytip y SIN uploader (S5)", async () => {
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w2" }; // taller distinto
    mockGetDetail.mockResolvedValue(
      makeDetail({
        attachments: {
          before: [],
          work: [makeAttachment({ id: "a2", caption: null })],
          after: [],
          other: [],
        },
        attachmentCount: 1,
      }),
    );

    renderPage();

    await screen.findByText("Cambio de aceite");

    // Sin zona de subida (no es el taller del episodio)
    expect(
      screen.queryByRole("button", { name: /adjuntar fotos/i }),
    ).not.toBeInTheDocument();

    // Botón remove en estado disabled + tooltip nativo
    const disabledHints = screen.getAllByTestId("remove-disabled");
    expect(disabledHints).toHaveLength(1);
    expect(disabledHints[0]).toHaveAttribute(
      "title",
      "Solo el taller del servicio o el propietario pueden eliminar evidencia.",
    );
    // La imagen sin caption usa el alt por defecto
    expect(
      screen.getByRole("img", { name: "Evidencia de servicio" }),
    ).toBeInTheDocument();
  });

  it("upload secuencial: 1 request por archivo, progreso en barras y refetch post éxito (S4)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };

    renderPage();

    await screen.findByText("Cambio de aceite");

    const f1 = new File(["a"], "f1.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "f2.png", { type: "image/png" });
    await user.upload(screen.getByTestId("attachment-file-input"), [f1, f2]);

    // Fase default "after" para el tablero de taller
    await user.click(screen.getByRole("button", { name: /subir 2 fotos/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
    });
    expect(mockUpload.mock.calls[0][0]).toBe("e1");
    expect(mockUpload.mock.calls[0][1]).toMatchObject({
      file: f1,
      phase: "after",
    });
    expect(mockUpload.mock.calls[1][1]).toMatchObject({
      file: f2,
      phase: "after",
    });

    expect(
      await screen.findByText("2 imágenes subidas"),
    ).toBeInTheDocument();

    // onUploaded → invalida → refetch del detalle
    await waitFor(() => {
      expect(mockGetDetail.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("upload fallido → error inline con Reintentar que solo re-intenta ese archivo (S4)", async () => {
    const user = userEvent.setup();
    authUser = { id: "u1", isVehicleOwner: false };
    activeContext = { type: "WORKSHOP", workshopId: "w1" };

    mockUpload
      .mockRejectedValueOnce({ status: 413, message: "Payload Too Large" })
      .mockResolvedValueOnce(makeAttachment({ id: "a2" }));

    renderPage();

    await screen.findByText("Cambio de aceite");

    const f1 = new File(["a"], "f1.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "f2.png", { type: "image/png" });
    await user.upload(screen.getByTestId("attachment-file-input"), [f1, f2]);
    await user.click(screen.getByRole("button", { name: /subir 2 fotos/i }));

    // Un archivo falló con el copy de 413; el segundo subió bien.
    expect(
      await screen.findByText(/la imagen supera el tamaño máximo de 5mb/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 imagen subida")).toBeInTheDocument();

    // Reintentar re-envía SOLO el archivo fallido.
    mockUpload.mockClear();
    await user.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });
    expect(mockUpload.mock.calls[0][1].file).toBe(f1);
  });
});