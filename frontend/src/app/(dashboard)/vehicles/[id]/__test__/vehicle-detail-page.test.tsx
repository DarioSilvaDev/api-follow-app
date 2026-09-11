/**
 * Tests for the vehicle detail page (/vehicles/[id]).
 *
 * Critical behaviors (F-013 §5-§9, D-039, RF-2, RF-5):
 * - Parallel queries: ["vehicle", id] + ["vehicle", id, "photos"] +
 *   ["vehicle", id, "documents"] with progressive rendering.
 * - 404 → "Vehículo no encontrado"; 403 → "Acceso denegado" (RF-6).
 * - Owner (active ownership + type owner + current user) sees Editar,
 *   photo/document writes and the mileage form (D-039).
 * - Non-owner sees the "Acceso compartido" badge and read-only sections.
 * - Ficha shows the active owner full name (RF-2, nested user from GET /:id).
 * - Mutations invalidate their query keys and refetch.
 * - Photo/document upload errors are surfaced with role="alert".
 * - Mileage monotonicity error shows the RF-5 message (400/409).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: "v1" }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, status: "authenticated" }),
}));

const mockGetVehicle = vi.fn();
const mockListPhotos = vi.fn();
const mockUploadPhoto = vi.fn();
const mockSetPrimaryPhoto = vi.fn();
const mockDeletePhoto = vi.fn();
const mockListDocuments = vi.fn();
const mockUploadDocument = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockRecordMileage = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    getVehicle: (...args: unknown[]) => mockGetVehicle(...args),
    listPhotos: (...args: unknown[]) => mockListPhotos(...args),
    uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
    setPrimaryPhoto: (...args: unknown[]) => mockSetPrimaryPhoto(...args),
    deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
    listDocuments: (...args: unknown[]) => mockListDocuments(...args),
    uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
    updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
    recordMileage: (...args: unknown[]) => mockRecordMileage(...args),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** GET /:id response shape (denormalized VehicleResponseDto + photos,
 *  documents + last-5 mileages — F-013 §5). user-1 es owner activo. */
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
    vin: "WVW123",
    engineNumber: null,
    notes: "Nota original",
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
    photos: [
      {
        id: "p1",
        vehicleId: "v1",
        key: "vehicles/v1/photos/p1.webp",
        caption: null,
        isPrimary: true,
        createdAt: "2026-09-10T00:00:00.000Z",
        url: "https://signed.example/p1",
      },
      {
        id: "p2",
        vehicleId: "v1",
        key: "vehicles/v1/photos/p2.webp",
        caption: null,
        isPrimary: false,
        createdAt: "2026-09-10T00:00:00.000Z",
        url: "https://signed.example/p2",
      },
    ],
    documents: [
      {
        id: "d1",
        vehicleId: "v1",
        key: "vehicles/v1/documents/d1.txt",
        name: "Cédula verde",
        documentType: "Cédula",
        expiresAt: null,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
        url: "https://signed.example/d1",
      },
    ],
    mileages: [
      {
        id: "m1",
        vehicleId: "v1",
        mileage: 25000,
        source: "owner",
        notes: null,
        recordedAt: "2026-09-10T00:00:00.000Z",
        createdAt: "2026-09-10T00:00:00.000Z",
      },
    ],
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

let VehicleDetailPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // Dynamic import ensures mocks are resolved first
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

describe("Vehicle detail page", () => {
  it("renders the ficha, owner controls, photos, documents and mileage", async () => {
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue(makeVehicle().photos);
    mockListDocuments.mockResolvedValue(makeVehicle().documents);

    renderPage();

    // Header + ficha
    expect(await screen.findByRole("heading", { name: "ABC123" })).toBeInTheDocument();
    expect(screen.getByText("Ficha del vehículo")).toBeInTheDocument();
    expect(screen.getByText("Toyota Corolla XEI")).toBeInTheDocument();
    expect(screen.getByText("2020 / 2021")).toBeInTheDocument();
    expect(screen.getByText("Rojo")).toBeInTheDocument();
    expect(screen.getByText("WVW123")).toBeInTheDocument();
    expect(screen.getByText("Nota original")).toBeInTheDocument();
    // RF-2: titular = nombre/apellido del ownership activo (nested user)
    expect(screen.getByText("Juan Perez")).toBeInTheDocument();

    // Owner controls (D-039)
    expect(screen.getByRole("link", { name: /editar/i })).toHaveAttribute(
      "href",
      "/vehicles/v1/edit",
    );
    // No "Acceso compartido" for an active owner
    expect(screen.queryByText("Acceso compartido")).not.toBeInTheDocument();

    // Photos section
    expect(await screen.findByText("2 fotos — la foto principal se muestra primero.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /subir foto/i })).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    // Cada foto tiene su overlay; la de la foto primary está deshabilitada.
    const primaryButtons = screen.getAllByRole("button", {
      name: "Establecer como principal",
    });
    expect(primaryButtons).toHaveLength(2);
    expect(primaryButtons[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Eliminar foto" })).toHaveLength(2);

    // Documents section
    expect(await screen.findByText("Cédula verde")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar Cédula verde" })).toHaveAttribute(
      "href",
      "https://signed.example/d1",
    );
    expect(screen.getByRole("button", { name: /subir documento/i })).toBeInTheDocument();

    // Mileage section (list + form)
    expect(screen.getByText("25.000 km")).toBeInTheDocument();
    expect(screen.getByText("Propietario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar km/i })).toBeInTheDocument();
  });

  it("shows Acceso compartido and hides owner-only controls for non-owners", async () => {
    // Owner row belongs to another user; user-1 is co_owner.
    mockGetVehicle.mockResolvedValue(
      makeVehicle({
        ownerships: [
          {
            id: "o1",
            vehicleId: "v1",
            userId: "other-user",
            type: "owner",
            startsAt: "2026-09-09T00:00:00.000Z",
            endsAt: null,
            user: { id: "other-user", firstName: "Otra", lastName: "Persona" },
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
    );
    mockListPhotos.mockResolvedValue(makeVehicle().photos);
    mockListDocuments.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Acceso compartido")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /editar/i })).not.toBeInTheDocument();

    // Read-only: no upload / mutation controls
    expect(screen.queryByRole("button", { name: /subir foto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /subir documento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar km/i })).not.toBeInTheDocument();
    // Photo edit overlay (primary/delete) hidden too
    expect(screen.queryByRole("button", { name: "Eliminar foto" })).not.toBeInTheDocument();

    // Read still works: photos + mileage list visible
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("25.000 km")).toBeInTheDocument();
  });

  it("shows 'Vehículo no encontrado' + back link without Reintentar on 404 (RF-6)", async () => {
    mockGetVehicle.mockRejectedValue({ status: 404, message: "Vehicle not found" });

    renderPage();

    expect(await screen.findByText("Vehículo no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver a mis vehículos/i })).toHaveAttribute(
      "href",
      "/vehicles",
    );
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("shows 'Acceso denegado' without Reintentar on 403 (RF-6)", async () => {
    mockGetVehicle.mockRejectedValue({ status: 403, message: "Forbidden" });

    renderPage();

    expect(await screen.findByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("uploads a photo and refetches the photos query (F-013)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue(makeVehicle().photos);
    mockListDocuments.mockResolvedValue([]);
    mockUploadPhoto.mockResolvedValue({
      id: "p3",
      vehicleId: "v1",
      key: "vehicles/v1/photos/p3.webp",
      caption: null,
      isPrimary: false,
      createdAt: "2026-09-10T00:00:00.000Z",
    });

    const { container } = renderPage();

    await screen.findByText("Ficha del vehículo");
    await screen.findByText("2 fotos — la foto principal se muestra primero.");

    await user.click(screen.getByRole("button", { name: /subir foto/i }));

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = new File(["dummy"], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith("v1", file);
    });
    // onSuccess invalidates → refresh
    await waitFor(() => {
      expect(mockListPhotos).toHaveBeenCalledTimes(2);
    });
  });

  it("surfaces a photo upload error (400) with role=alert (F-013)", async () => {
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue([]);
    mockUploadPhoto.mockRejectedValue({ status: 400, message: "Invalid image" });

    const { container } = renderPage();
    await screen.findByText("Ficha del vehículo");
    await screen.findByText("Todavía no hay fotos de este vehículo.");

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["x"], "a.exe", { type: "application/octet-stream" })] },
    });

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("El archivo no es una imagen válida (JPG, PNG, WebP o AVIF) o supera los 10MB.");
  });

  it("sets the primary photo and deletes a photo with confirm (F-013)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue(makeVehicle().photos);
    mockListDocuments.mockResolvedValue([]);
    mockSetPrimaryPhoto.mockResolvedValue({ ...makeVehicle().photos[0] });
    mockDeletePhoto.mockResolvedValue(undefined);

    renderPage();

    await screen.findByText("2 fotos — la foto principal se muestra primero.");

    // La foto 1 es primary (botón deshabilitado), la foto 2 no lo es.
    await user.click(
      screen.getAllByRole("button", { name: "Establecer como principal" })[1],
    );
    await waitFor(() => {
      expect(mockSetPrimaryPhoto).toHaveBeenCalledWith("v1", "p2");
    });
    // Wait refetch so the next assertion is on a fresh state
    await waitFor(() => {
      expect(mockListPhotos).toHaveBeenCalledTimes(2);
    });

    await user.click(
      screen.getAllByRole("button", { name: "Eliminar foto" })[0],
    );
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("¿Eliminar esta foto?");
      expect(mockDeletePhoto).toHaveBeenCalledWith("v1", "p1");
    });
  });

  it("registers mileage with source owner and refetches the vehicle (F-013 D-048)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue([]);
    mockRecordMileage.mockResolvedValue({
      id: "m2",
      vehicleId: "v1",
      mileage: 25100,
      source: "owner",
      notes: "Cambio de aceite",
      recordedAt: "2026-09-11T00:00:00.000Z",
      createdAt: "2026-09-11T00:00:00.000Z",
    });

    renderPage();

    const kmInput = await screen.findByLabelText("Kilometraje (km)");
    await user.type(kmInput, "25100");
    await user.type(screen.getByLabelText("Notas (opcional)"), "Cambio de aceite");
    await user.click(screen.getByRole("button", { name: /registrar km/i }));

    await waitFor(() => {
      expect(mockRecordMileage).toHaveBeenCalledWith("v1", {
        mileage: 25100,
        source: "owner",
        notes: "Cambio de aceite",
      });
    });
    // onSuccess invalidates ["vehicle", id] → getVehicle refetch
    await waitFor(() => {
      expect(mockGetVehicle).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the RF-5 message when mileage is not monotonic (400)", async () => {
    const user = userEvent.setup();
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue([]);
    mockRecordMileage.mockRejectedValue({
      status: 400,
      message: "Mileage must be greater than or equal to last recorded",
      code: "VALIDATION_ERROR",
    });

    renderPage();

    const kmInput = await screen.findByLabelText("Kilometraje (km)");
    await user.type(kmInput, "1000");
    await user.click(screen.getByRole("button", { name: /registrar km/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El kilometraje debe ser mayor o igual al último registrado (RF-5).",
    );
  });

it("rejects invalid mileage input without calling the API", async () => {
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue([]);

    const { container } = renderPage();

    // Set km to "-5" via direct DOM value + change event
    const kmInput = await screen.findByLabelText("Kilometraje (km)") as HTMLInputElement;
    // Use the native setter to bypass React's value tracker, then fire change
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(kmInput, "-5");
    fireEvent.change(kmInput);

    // Submit the form directly
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingresá un kilometraje válido.",
    );
    expect(mockRecordMileage).not.toHaveBeenCalled();
  });

  it("uploads, edits and deletes a document (F-013)", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGetVehicle.mockResolvedValue(makeVehicle());
    mockListPhotos.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue(makeVehicle().documents);
    mockUploadDocument.mockResolvedValue({ id: "d2" });
    mockUpdateDocument.mockResolvedValue({ id: "d1" });
    mockDeleteDocument.mockResolvedValue(undefined);

    renderPage();

    // Upload flow
    await screen.findByText("Cédula verde");
    await user.click(screen.getByRole("button", { name: /subir documento/i }));

    const docFileInput = screen.getByLabelText("Archivo") as HTMLInputElement;
    await user.upload(docFileInput, new File(["dummy"], "seguro.pdf", { type: "application/pdf" }));
    await user.type(screen.getByLabelText("Nombre"), "Seguro");
    await user.type(screen.getByLabelText("Tipo"), "Seguro");
    // Vencimiento queda vacío → expiresAt undefined
    await user.click(screen.getByRole("button", { name: /subir documento/i }));

    await waitFor(() => {
      expect(mockUploadDocument).toHaveBeenCalledWith(
        "v1",
        expect.any(File),
        { name: "Seguro", documentType: "Seguro", expiresAt: undefined },
      );
    });

    // Edit flow → updateDocument (Vencimiento vacío → null)
    const li = screen.getByText("Cédula verde").closest("li") as HTMLElement;
    await user.click(within(li).getByRole("button", { name: /editar/i }));
    const nameInput = screen.getByLabelText("Nombre");
    await user.clear(nameInput);
    await user.type(nameInput, "Cédula actualizada");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockUpdateDocument).toHaveBeenCalledWith("v1", "d1", {
        name: "Cédula actualizada",
        documentType: "Cédula",
        expiresAt: null,
      });
    });

    // Delete flow (confirm → deleteDocument)
    await waitFor(() => {
      expect(screen.getByText("Cédula verde")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Eliminar documento Cédula verde" }),
    );
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
      expect(mockDeleteDocument).toHaveBeenCalledWith("v1", "d1");
    });
  });
});