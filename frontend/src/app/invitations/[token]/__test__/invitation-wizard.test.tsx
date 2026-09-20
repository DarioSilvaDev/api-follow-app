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
 * - `?kind` en la URL (mails D-106): el preview se resuelve contra la entidad
 *   indicada DIRECTAMENTE (sin probe). Sin `kind` → probe de compatibilidad
 *   (dealership 404 INVITATION_INVALID → taller).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InvitationWizardPage from "@/app/invitations/[token]/page";

const mockPreview = vi.fn();
const mockClaim = vi.fn();
const mockWorkshopPreview = vi.fn();
const mockWorkshopClaim = vi.fn();
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
    getWorkshopClaimPreview: (...args: unknown[]) =>
      mockWorkshopPreview(...args),
    claimWorkshop: (...args: unknown[]) => mockWorkshopClaim(...args),
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

function makeWorkshopPreview(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    status: "pending",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    workshop: { id: "w1", name: "Taller Mecánico Centro" },
    email: "dueno@taller.com",
    account: { exists: false, status: null },
    requiresRegister: true,
    ...overrides,
  };
}

function makeWorkshopClaimResult(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", email: "dueno@taller.com", firstName: "Juan", lastName: "Pérez" },
    workshop: { id: "w1", name: "Taller Mecánico Centro", status: "active" },
    member: { id: "m1", role: { code: "owner" } },
    ...overrides,
  };
}

/**
 * Render del wizard con `searchParams` (page prop promise, patrón Next 16).
 *
 * IMPORTANTE: `use(searchParams)` SIEMPRE suspende en el primer render
 * (React 19 resuelve la promise en una microtask aunque ya esté fulfilled).
 * El rnder debe ocurrir DENTRO de `act(async () => ...)` y esperarse, para
 * que React flushee la suspensión y haga commit → el helper ES async y cada
 * test debe `await renderWizard(...)`.
 */
async function renderWizard(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <InvitationWizardPage searchParams={Promise.resolve(searchParams)} />,
    );
  });
  return utils!;
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
    // El probe de taller también falla (mismo token no existe allí).
    mockWorkshopPreview.mockRejectedValue({ status: 404, message: "no encontrado" });

    await renderWizard();

    expect(await screen.findByText("Invitación inválida")).toBeInTheDocument();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockWorkshopClaim).not.toHaveBeenCalled();
    // Sin formulario de reenvío (decisión PM D-B: solo panel admin reenvía).
    expect(screen.queryByRole("button", { name: /continuar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reintentar/i })).toBeNull();
  });

  it("token vencido (400 code): pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({ status: 400, code: "INVITATION_EXPIRED" });

    await renderWizard();

    expect(
      await screen.findByText("La invitación venció"),
    ).toBeInTheDocument();
    expect(screen.getByText(/venció y ya no puede utilizarse/i)).toBeInTheDocument();
  });

  it("token usado (409 code): pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({ status: 409, code: "INVITATION_USED" });

    await renderWizard();

    expect(
      await screen.findByText("Invitación ya utilizada"),
    ).toBeInTheDocument();
  });

  it("flujo registro (requiresRegister=true): claim recibe cuenta + dealership y muestra éxito", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockResolvedValue(makeClaimResult());

    await renderWizard();

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

    await renderWizard();

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

    await renderWizard();

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

    await renderWizard();

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

    await renderWizard();

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

  it("flujo TALLER por PROBE (URL sin ?kind): dealership 404 → preview taller → claimWorkshop", async () => {
    const user = userEvent.setup();
    mockPreview.mockRejectedValue({ status: 404, code: "INVITATION_INVALID" });
    mockWorkshopPreview.mockResolvedValue(makeWorkshopPreview());
    mockWorkshopClaim.mockResolvedValue(makeWorkshopClaimResult());

    await renderWizard();

    // El probe primero pide dealership (404) y luego taller (200).
    expect(
      await screen.findByText("Creá tu cuenta"),
    ).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith("TOKEN123");
    expect(mockWorkshopPreview).toHaveBeenCalledWith("TOKEN123");
    expect(screen.getByLabelText(/email/i)).toHaveValue("dueno@taller.com");

    await user.type(screen.getByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    // Paso 2: paso TALLER — el nombre se muestra solo lectura (no campo input).
    expect(
      await screen.findByText("Completá los datos de tu taller"),
    ).toBeInTheDocument();
    expect(screen.getByText("Taller Mecánico Centro")).toBeInTheDocument();

    const contactEmail = screen.getByLabelText(/email de contacto/i);
    await user.clear(contactEmail);
    await user.type(contactEmail, "contacto@taller.com");
    await user.click(
      screen.getByRole("button", { name: /activar taller/i }),
    );

    await waitFor(() =>
      expect(mockWorkshopClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "TOKEN123",
          email: "dueno@taller.com",
          firstName: "Juan",
          lastName: "Pérez",
          phone: "11 5555 1234",
          password: "password123",
          workshop: expect.objectContaining({
            email: "contacto@taller.com",
          }),
        }),
      ),
    );
    // El claim del taller NO envía name (el backend lo fija).
    const claimBody = mockWorkshopClaim.mock.calls[0][0] as Record<string, unknown>;
    expect(claimBody.workshop).not.toHaveProperty("name");

    expect(
      await screen.findByText("¡Taller activado!"),
    ).toBeInTheDocument();
    // CTA: aún no existe /workshops/{id} → "Ir al inicio" (decisión PM).
    const cta = screen.getByRole("link", { name: /ir al inicio/i });
    expect(cta).toHaveAttribute("href", "/dashboard");
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("?kind=workshop en la URL: preview directo de taller y NUNCA llama al preview de dealership (sin probe)", async () => {
    const user = userEvent.setup();
    mockWorkshopPreview.mockResolvedValue(makeWorkshopPreview());
    mockWorkshopClaim.mockResolvedValue(makeWorkshopClaimResult());

    await renderWizard({ kind: "workshop" });

    // El preview se resuelve contra el endpoint de taller DIRECTAMENTE.
    expect(
      await screen.findByText("Creá tu cuenta"),
    ).toBeInTheDocument();
    expect(mockWorkshopPreview).toHaveBeenCalledWith("TOKEN123");
    expect(mockPreview).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/email/i)).toHaveValue("dueno@taller.com");

    await user.type(screen.getByLabelText(/^nombre/i), "Juan");
    await user.type(screen.getByLabelText(/apellido/i), "Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "11 5555 1234");
    await user.type(screen.getByLabelText(/^contraseña$/i), "password123");
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      "password123",
    );
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(
      await screen.findByText("Completá los datos de tu taller"),
    ).toBeInTheDocument();
    expect(screen.getByText("Taller Mecánico Centro")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /activar taller/i }),
    );

    await waitFor(() =>
      expect(mockWorkshopClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "TOKEN123",
          email: "dueno@taller.com",
          workshop: expect.objectContaining({
            email: "dueno@taller.com",
          }),
        }),
      ),
    );
    expect(mockClaim).not.toHaveBeenCalled();
    expect(await screen.findByText("¡Taller activado!")).toBeInTheDocument();
  });

  it("?kind=dealership en la URL: preview directo de concesionaria y NUNCA llama al preview de taller", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockClaim.mockResolvedValue(makeClaimResult());

    await renderWizard({ kind: "dealership" });

    expect(
      await screen.findByText("Creá tu cuenta"),
    ).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith("TOKEN123");
    expect(mockWorkshopPreview).not.toHaveBeenCalled();
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

    expect(
      await screen.findByText("Completá los datos de tu concesionaria"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /activar concesionaria/i }),
    );

    expect(
      await screen.findByText("¡Concesionaria activada!"),
    ).toBeInTheDocument();
  });

  it("?kind=workshop con preview 404: error terminal SIN probe a dealership", async () => {
    mockWorkshopPreview.mockRejectedValue({
      status: 404,
      code: "INVITATION_INVALID",
    });

    await renderWizard({ kind: "workshop" });

    expect(
      await screen.findByText("Invitación inválida"),
    ).toBeInTheDocument();
    expect(mockWorkshopPreview).toHaveBeenCalledWith("TOKEN123");
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockWorkshopClaim).not.toHaveBeenCalled();
  });

  it("?kind=dealership con preview inválido (404): error terminal SIN probe a taller", async () => {
    mockPreview.mockRejectedValue({ status: 404, code: "INVITATION_INVALID" });

    await renderWizard({ kind: "dealership" });

    expect(
      await screen.findByText("Invitación inválida"),
    ).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith("TOKEN123");
    expect(mockWorkshopPreview).not.toHaveBeenCalled();
  });

  it("token faltante: pantalla de error sin llamar a la API", async () => {
    mockParams.mockReturnValue({});

    await renderWizard();

    expect(screen.getByText("Invitación inválida")).toBeInTheDocument();
    expect(mockPreview).not.toHaveBeenCalled();
  });
});