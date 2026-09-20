/**
 * Feature "Onboarding administrado de concesionaria" — Tests del wizard
 * público de invitación (src/app/invitations/[token]/page.tsx).
 *
 * Cubre la máquina de estados (decisiones PM cerradas):
 * - Token inválido/vencido/usado/cancelado → pantalla de error SIN formulario
 *   y NUNCA muestra el mensaje crudo del backend.
 * - requiresRegister=true → paso 1 registro (datos se guardan localmente) →
 *   paso 2 dealership → POST claim con TODO (incluye credenciales).
 * - requiresRegister=false → paso 1 login (/auth/login + refreshSession) →
 *   paso 2 → claim SIN credenciales (solo token/email + dealership).
 * - Éxito → CTA según membresía de la session (dealership claim).
 * - Errores del claim: terminales → pantalla de error; CONFLICT → inline.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InvitationWizardPage from "@/app/invitations/[token]/page";

const mockPreview = vi.fn();
const mockClaim = vi.fn();
const mockLogin = vi.fn();
const mockRefreshSession = vi.fn();
const mockParams = vi.fn<() => Record<string, string>>(
  () => ({ token: "TOKEN123" }),
);

vi.mock("@/lib/api", () => ({
  authApi: {
    login: (...args: unknown[]) => mockLogin(...args),
  },
  invitationApi: {
    getClaimPreview: (...args: unknown[]) => mockPreview(...args),
    claim: (...args: unknown[]) => mockClaim(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => mockParams(),
}));

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

// next/link sin router context en happy-dom → anchor plano (patrón
// transfer-dialog.test.tsx).
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

function makePreview(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    status: "pending",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    dealership: { id: "d1", name: "FM Automotores" },
    email: "dueno@fm.com",
    account: { exists: false, status: null },
    requiresRegister: true,
    ...overrides,
  };
}

function makeClaimResult(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", email: "dueno@fm.com", firstName: "Juan", lastName: "Pérez" },
    dealership: { id: "d1", name: "FM Automotores", status: "active" },
    member: { id: "m1", role: { code: "owner" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRefreshSession.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    status: "authenticated",
    user: null,
    refreshSession: mockRefreshSession,
  });
});

describe("InvitationWizardPage", () => {
  it("token inválido (404): pantalla de error SIN formulario y sin claim", async () => {
    mockPreview.mockRejectedValue({ status: 404, message: "no encontrado" });

    render(<InvitationWizardPage />);

    expect(await screen.findByText("Invitación inválida")).toBeInTheDocument();
    expect(mockClaim).not.toHaveBeenCalled();
    // Sin formulario de reenvío (decisión PM D-B: solo panel admin reenvía).
    expect(screen.queryByRole("button", { name: /continuar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reintentar/i })).toBeNull();
  });

  it("token vencido (400 code): pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({ status: 400, code: "INVITATION_EXPIRED" });

    render(<InvitationWizardPage />);

    expect(
      await screen.findByText("La invitación venció"),
    ).toBeInTheDocument();
    expect(screen.getByText(/venció y ya no puede utilizarse/i)).toBeInTheDocument();
  });

  it("token usado (409 code): pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({ status: 409, code: "INVITATION_USED" });

    render(<InvitationWizardPage />);

    expect(
      await screen.findByText("Invitación ya utilizada"),
    ).toBeInTheDocument();
  });

  it("flujo registro (requiresRegister=true): claim recibe cuenta + dealership y muestra éxito", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockResolvedValue(makeClaimResult());

    render(<InvitationWizardPage />);

    // Paso 1: registro (email read-only pre-cargado).
    expect(
      await screen.findByText("Creá tu cuenta"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("dueno@fm.com");

    await user.type(screen.getByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    // Paso 2: datos públicos de la concesionaria.
    expect(
      await screen.findByText("Completá los datos de tu concesionaria"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre/i)).toHaveValue("FM Automotores");

    const contactEmail = screen.getByLabelText(/email de contacto/i);
    await user.clear(contactEmail);
    await user.type(contactEmail, "contacto@fm.com");
    await user.click(
      screen.getByRole("button", { name: /activar concesionaria/i }),
    );

    await waitFor(() =>
      expect(mockClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "TOKEN123",
          email: "dueno@fm.com",
          firstName: "Juan",
          lastName: "Pérez",
          phone: "11 5555 1234",
          password: "password123",
          dealership: expect.objectContaining({
            email: "contacto@fm.com",
          }),
        }),
      ),
    );

    expect(
      await screen.findByText("¡Concesionaria activada!"),
    ).toBeInTheDocument();
  });

  it("flujo login (requiresRegister=false): /auth/login + claim SIN credenciales", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview({ requiresRegister: false }));
    mockLogin.mockResolvedValue({ user: { id: "u1" } });
    mockClaim.mockResolvedValue(makeClaimResult());

    render(<InvitationWizardPage />);

    expect(
      await screen.findByText("Iniciá sesión"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Creá tu cuenta"),
    ).toBeNull();

    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("dueno@fm.com", "password123"),
    );
    expect(mockRefreshSession).toHaveBeenCalled();

    // Paso 2 → claim sin datos de cuenta (el login ya autentica por cookie).
    expect(
      await screen.findByText("Completá los datos de tu concesionaria"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /activar concesionaria/i }),
    );

    await waitFor(() => expect(mockClaim).toHaveBeenCalled());
    const claimInput = mockClaim.mock.calls[0][0] as Record<string, unknown>;
    expect(claimInput.token).toBe("TOKEN123");
    expect(claimInput.email).toBe("dueno@fm.com");
    expect(claimInput.password).toBeUndefined();
    expect(claimInput.firstName).toBeUndefined();

    expect(
      await screen.findByText("¡Concesionaria activada!"),
    ).toBeInTheDocument();
  });

  it("éxito con membresía de sesión: CTA 'Ir a mi concesionaria'", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockResolvedValue(makeClaimResult());
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: {
        id: "u1",
        dealershipMemberships: [{ dealershipId: "d1" }],
      },
      refreshSession: mockRefreshSession,
    });

    render(<InvitationWizardPage />);

    await user.type(await screen.findByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await user.click(
      await screen.findByRole("button", { name: /activar concesionaria/i }),
    );

    expect(
      await screen.findByText("¡Concesionaria activada!"),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /ir a mi concesionaria/i });
    expect(cta).toHaveAttribute("href", "/dealerships/d1");
  });

  it("claim CONFLICT (409): error inline en el paso 2", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockRejectedValue({
      status: 409,
      code: "CONFLICT",
      message: "email already registered",
    });

    render(<InvitationWizardPage />);

    // Saltar el registro: submit directo del paso 2 no es posible sin pasar
    // por el paso 1, así que se completa el registro mínimo.
    await user.type(await screen.findByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    await user.click(
      await screen.findByRole("button", { name: /activar concesionaria/i }),
    );

    const alert = await screen.findByRole("alert");
    // Error mapeado del claim (409 CONFLICT) — nunca texto crudo del backend.
    expect(alert).toHaveTextContent(/ya existe una cuenta/i);
    // Se mantiene en el paso 2 (sin pantalla de éxito ni error terminal).
    expect(
      screen.getByText("Completá los datos de tu concesionaria"),
    ).toBeInTheDocument();
  });

  it("claim con invitación ya usada: transiciona a pantalla terminal (no inline)", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockRejectedValue({ status: 409, code: "INVITATION_USED" });

    render(<InvitationWizardPage />);

    await user.type(await screen.findByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await user.click(
      await screen.findByRole("button", { name: /activar concesionaria/i }),
    );

    expect(
      await screen.findByText("Invitación ya utilizada"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /activar concesionaria/i }),
    ).toBeNull();
  });

  it("token faltante: pantalla de error sin llamar a la API", () => {
    mockParams.mockReturnValue({});

    render(<InvitationWizardPage />);

    expect(screen.getByText("Invitación inválida")).toBeInTheDocument();
    expect(mockPreview).not.toHaveBeenCalled();
  });
});