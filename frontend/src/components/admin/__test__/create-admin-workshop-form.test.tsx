/**
 * Workspace admin — Tests de CreateAdminWorkshopForm (alta administrada D-106).
 *
 * Cubre (espejo del test de concesionarias):
 * - Validación zod (nombre/email obligatorios) sin llamar a la API.
 * - Submit válido → POST /admin/workshops + banner + invalidate + redirect
 *   al listado.
 * - 409 CONFLICT mapeado por contenido interno: CUIT vs nombre (nunca muestra
 *   message crudo del backend).
 * - 403 → permisos; 5xx → genérico.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { CreateAdminWorkshopForm } from "@/components/admin/create-admin-workshop-form";

const mockCreate = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    createWorkshop: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateAdminWorkshopForm />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateAdminWorkshopForm", () => {
  it("valida campos obligatorios y NO llama a la API", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    expect(
      await screen.findByText("Ingresá el nombre del taller."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ingresá un email válido para el dueño."),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit válido: crea, muestra banner e invalida/redirige", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({
      id: "w1",
      name: "Taller Mecánico Centro",
      taxId: null,
      email: null,
      status: "pending_claim",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      invitation: {
        id: "inv1",
        email: "dueno@taller.com",
        expiresAt: "2026-01-08T00:00:00.000Z",
        status: "pending",
      },
    });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "Taller Mecánico Centro");
    await user.type(screen.getByLabelText(/cuit/i), "30-12345678-9");
    await user.type(screen.getByLabelText(/email del dueño/i), "dueno@taller.com");
    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: "Taller Mecánico Centro",
        taxId: "30-12345678-9",
        ownerEmail: "dueno@taller.com",
      }),
    );

    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent(/se envió una invitación al dueño/i);

    // Redirección al listado (feedback breve post-success).
    await waitFor(
      () => expect(mockPush).toHaveBeenCalledWith("/admin/workshops"),
      { timeout: 3000 },
    );
  });

  it("409 CONFLICT por CUIT → copy específico, nunca message crudo", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue({
      status: 409,
      code: "CONFLICT",
      message: "Ya existe un taller con este CUIT",
    });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "Otro Taller");
    await user.type(screen.getByLabelText(/email del dueño/i), "otro@taller.com");
    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ya existe un taller con ese CUIT.");
    expect(alert).not.toHaveTextContent(/message/i);
  });

  it("409 CONFLICT por nombre → copy específico", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue({
      status: 409,
      code: "CONFLICT",
      message: "Ya existe un taller con este nombre",
    });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "Taller Mecánico Centro");
    await user.type(screen.getByLabelText(/email del dueño/i), "dueno@taller.com");
    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ya existe un taller con ese nombre.");
  });

  it("403 → mensaje de permisos", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue({ status: 403, message: "forbidden" });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "Taller Mecánico Centro");
    await user.type(screen.getByLabelText(/email del dueño/i), "dueno@taller.com");
    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tenés permisos para crear talleres.",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("5xx → genérico, sin texto crudo", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue({ status: 500, message: "internal error" });
    renderForm();

    await user.type(screen.getByLabelText(/^nombre/i), "Taller Mecánico Centro");
    await user.type(screen.getByLabelText(/email del dueño/i), "dueno@taller.com");
    await user.click(
      screen.getByRole("button", { name: /crear y enviar invitación/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error interno del servidor. Intentá más tarde.",
    );
  });
});