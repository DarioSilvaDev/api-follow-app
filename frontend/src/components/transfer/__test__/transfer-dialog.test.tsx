/**
 * Tests for TransferDialog (Fase 1 / D-078 / D-084).
 *
 * Comportamientos críticos:
 * - Modo detalle (`vehicle` fijo): sin selector, envía el vehicle.id.
 * - Modo panel (`vehicles`): selector de vehículos propios (default = primero).
 * - Validación zod: email inválido → error y NO llama a la API.
 * - Errores normalizados (nunca mensaje crudo del backend):
 *   400 "self", 400 "pending" (RF-6 → link al panel), 403/404/genérico.
 * - Éxito: cierra el diálogo e invalida ["transfers"] y ["vehicle"] (el
 *   timeline de la ficha refleja la transferencia pendiente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransferDialog } from "@/components/transfer/transfer-dialog";

const mockTransferVehicle = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    transferVehicle: (...args: unknown[]) => mockTransferVehicle(...args),
  },
}));

// Sesión del usuario actual (necesaria para el self-check client-side de §6.1).
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u-me", email: "yo@autentia.com" },
    status: "authenticated",
  }),
}));

// El Link real (next/link) necesita router context; en el diálogo hay un link
// al panel (caso pending) → mock funcional.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const VEHICLE = { id: "v1", licensePlate: "ABC123" };

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    licensePlate: "ABC123",
    manufactureYear: 2020,
    modelYear: 2021,
    color: "Rojo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ownerships: [],
    ...overrides,
  };
}

function renderDialog({
  open = true,
  onOpenChange = vi.fn(),
  vehicle,
  vehicles,
  onSuccess = vi.fn(),
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  vehicle?: { id: string; licensePlate: string } | null;
  vehicles?: ReturnType<typeof makeVehicle>[];
  onSuccess?: () => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TransferDialog
        open={open}
        onOpenChange={onOpenChange}
        vehicle={vehicle}
        vehicles={vehicles}
        onSuccess={onSuccess}
      />
    </QueryClientProvider>,
  );
  return { ...utils, invalidateSpy, onOpenChange, onSuccess, queryClient };
}

async function submitValidForm(email = "ana@test.com", notes?: string) {
  await userEvent.type(
    screen.getByLabelText("Email del nuevo titular"),
    email,
  );
  if (notes !== undefined) {
    await userEvent.type(screen.getByLabelText("Notas (opcional)"), notes);
  }
  await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TransferDialog", () => {
  it("modo detalle: muestra email + notas y envía el vehicle.id fijo", async () => {
    renderDialog({ vehicle: VEHICLE });

    expect(screen.getByText("Transferir vehículo")).toBeInTheDocument();
    expect(
      screen.getByText("Transferí la titularidad de ABC123 a otro usuario de Autentia."),
    ).toBeInTheDocument();
    // Modo detalle NO tiene selector de vehículo.
    expect(screen.queryByLabelText("Vehículo")).not.toBeInTheDocument();

    mockTransferVehicle.mockResolvedValue({ id: "t1", status: "pending" });

    await userEvent.type(
      screen.getByLabelText("Email del nuevo titular"),
      "ana@test.com",
    );
    await userEvent.type(
      screen.getByLabelText("Notas (opcional)"),
      "Entrega de llaves",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar solicitud" }),
    );

    await waitFor(() => {
      expect(mockTransferVehicle).toHaveBeenCalledWith("v1", {
        email: "ana@test.com",
        notes: "Entrega de llaves",
      });
    });
  });

  it("modo panel: selector con vehículos propios y default = primero", async () => {
    const vehicles = [
      makeVehicle({ finance: undefined }),
      makeVehicle({ id: "v2", licensePlate: "XYZ789" }),
    ];
    renderDialog({ vehicles });

    expect(screen.getByLabelText("Vehículo")).toBeInTheDocument();
    const select = screen.getByLabelText("Vehículo") as HTMLSelectElement;
    expect(select.value).toBe("v1");

    mockTransferVehicle.mockResolvedValue({ id: "t1", status: "pending" });
    await userEvent.selectOptions(select, "v2");
    await submitValidForm();

    await waitFor(() => {
      expect(mockTransferVehicle).toHaveBeenCalledWith("v2", {
        email: "ana@test.com",
        notes: undefined,
      });
    });
  });

  it("email inválido: error zod y NO llama a la API", async () => {
    renderDialog({ vehicle: VEHICLE });

    await userEvent.type(
      screen.getByLabelText("Email del nuevo titular"),
      "no-es-un-email",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar solicitud" }),
    );

    expect(
      await screen.findByText("Ingresá un email válido."),
    ).toBeInTheDocument();
    expect(mockTransferVehicle).not.toHaveBeenCalled();
  });

  it("notas vacías se omiten del payload (undefined)", async () => {
    renderDialog({ vehicle: VEHICLE });
    mockTransferVehicle.mockResolvedValue({ id: "t1", status: "pending" });

    await userEvent.type(
      screen.getByLabelText("Email del nuevo titular"),
      "ana@test.com",
    );
    await userEvent.type(screen.getByLabelText("Notas (opcional)"), "   ");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar solicitud" }),
    );

    await waitFor(() => {
      expect(mockTransferVehicle).toHaveBeenCalledWith("v1", {
        email: "ana@test.com",
        notes: undefined,
      });
    });
  });

  it("400 self: mensaje normalizado sin exponer el texto del backend", async () => {
    renderDialog({ vehicle: VEHICLE });
    mockTransferVehicle.mockRejectedValue({
      status: 400,
      message: "Cannot transfer vehicle to yourself",
    });

    await submitValidForm();

    expect(
      await screen.findByText(
        "No podés transferir el vehículo a vos mismo. Ingresá el email de otra persona.",
      ),
    ).toBeInTheDocument();
    expect(mockTransferVehicle).toHaveBeenCalledTimes(1);
  });

  it("Ajuste 3a UX: email propio detectado client-side (sin llamar a la API)", async () => {
    renderDialog({ vehicle: VEHICLE });

    await userEvent.type(
      screen.getByLabelText("Email del nuevo titular"),
      "YO@autentia.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar solicitud" }),
    );

    expect(
      await screen.findByText(
        "No podés transferir el vehículo a vos mismo. Ingresá el email de otra persona.",
      ),
    ).toBeInTheDocument();
    expect(mockTransferVehicle).not.toHaveBeenCalled();
    // El diálogo permanece abierto con los datos intactos.
    expect(
      (screen.getByLabelText("Email del nuevo titular") as HTMLInputElement)
        .value,
    ).toBe("YO@autentia.com");
  });

  it("Ajuste 8 UX: helper del email (cuenta en Autentia)", async () => {
    renderDialog({ vehicle: VEHICLE });

    expect(
      screen.getByText("El destinatario debe tener una cuenta en Autentia."),
    ).toBeInTheDocument();
  });

  it("400 pending (RF-6): CTA 'Ver solicitud' al panel y NO cierra el diálogo", async () => {
    const { onOpenChange } = renderDialog({ vehicle: VEHICLE });
    mockTransferVehicle.mockRejectedValue({
      status: 400,
      message: "There is already a pending transfer for this vehicle",
    });

    await submitValidForm();

    expect(
      await screen.findByText(/ya existe una solicitud pendiente/i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Ver solicitud" });
    expect(link).toHaveAttribute("href", "/transferencias#enviadas");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("403 ya-no-owner: mensaje de titular normalizado", async () => {
    renderDialog({ vehicle: VEHICLE });
    mockTransferVehicle.mockRejectedValue({
      status: 403,
      message: "You do not own this vehicle",
    });

    await submitValidForm();

    expect(
      await screen.findByText(
        "Ya no sos el titular de este vehículo. La transferencia no se pudo realizar.",
      ),
    ).toBeInTheDocument();
  });

  it("404: vehículo inexistente", async () => {
    renderDialog({ vehicle: VEHICLE });
    mockTransferVehicle.mockRejectedValue({ status: 404, message: "Vehicle" });

    await submitValidForm();

    expect(
      await screen.findByText("El vehículo ya no existe o fue eliminado."),
    ).toBeInTheDocument();
  });

  it("Ajuste 4 UX (§6.7): sin vehículos propios → estado guiado + link a /vehicles/new", async () => {
    const { onOpenChange } = renderDialog({ vehicles: [] });

    expect(
      screen.getByText("No tenés vehículos para transferir"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Registrar un vehículo",
    });
    expect(link).toHaveAttribute("href", "/vehicles/new");
    // Sin email ni submit: no hay nada que enviar.
    expect(
      screen.queryByLabelText("Email del nuevo titular"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enviar solicitud" }),
    ).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("éxito: cierra, invalida ['transfers'] y ['vehicle'], y llama onSuccess", async () => {
    const { invalidateSpy, onOpenChange, onSuccess } = renderDialog({
      vehicle: VEHICLE,
    });
    mockTransferVehicle.mockResolvedValue({ id: "t1", status: "pending" });

    await submitValidForm();

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["transfers"] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["vehicle"] }),
    );
  });

  it("deshabilitado mientras envía (isSubmitting)", async () => {
    const { onOpenChange } = renderDialog({ vehicle: VEHICLE });
    let resolveTransfer!: (value: unknown) => void;
    mockTransferVehicle.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransfer = resolve;
        }),
    );

    await submitValidForm();

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: /enviando/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    resolveTransfer({ id: "t1", status: "pending" });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});