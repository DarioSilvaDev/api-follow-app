/**
 * Profile page — AliasCard refreshes the session after alias update.
 *
 * Item 4 (fase de ajustes): tras PATCH /users/me/alias, SessionUser.alias
 * queda stale. refreshSession() recarga GET /auth/me (AuthProvider) para
 * sincronizar user.alias. Cubre actualizar y eliminar (mismo onSuccess).
 *
 * La sesión vive en AuthProvider (useAuth), NO en react-query: por eso el
 * test mockea `@/hooks/use-auth` y verifica que refreshSession() se llama.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockRefreshSession = vi.fn();
const mockGetMyAlias = vi.fn();
const mockUpdateMyAlias = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    refreshSession: mockRefreshSession,
  }),
}));

vi.mock("@/hooks/use-password-reset", () => ({
  useChangePassword: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ message: "ok" }),
    isError: false,
    error: null,
  }),
}));

vi.mock("@/lib/api", () => ({
  usersApi: {
    getMyAlias: (...args: unknown[]) => mockGetMyAlias(...args),
    updateMyAlias: (...args: unknown[]) => mockUpdateMyAlias(...args),
  },
}));

// Mock UI components to avoid deep dependency trees
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
vi.mock("@/components/ui/password-input", () => ({
  PasswordInput: ({
    id,
    label,
    error,
    register,
    ...props
  }: {
    id: string;
    label: string;
    error?: string;
    register: object;
  } & Record<string, unknown>) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="password" {...register} {...props} />
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

// ── Dynamic import of SUT ────────────────────────────────────────────────────

let ProfilePage: React.ComponentType;

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

const aliasQueryResult = (
  alias: string | null,
  nextChangeAllowedAt: string | null = null,
) => ({
  alias,
  lastAliasChangedAt: null,
  nextChangeAllowedAt,
});

/** Mismo formateo que AliasCard (es-AR, día/mes/año). */
function formatCooldown(value: string): string {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockRefreshSession.mockResolvedValue(undefined);

  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(dashboard)/profile/page");
  ProfilePage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AliasCard — refresca la sesión tras actualizar el alias", () => {
  it("llama refreshSession() tras guardar un alias nuevo", async () => {
    mockGetMyAlias.mockResolvedValue(
      aliasQueryResult("juan"),
    );
    mockUpdateMyAlias.mockResolvedValue(
      aliasQueryResult("nuevo-alias"),
    );

    const user = userEvent.setup();
    renderProfile();

    // Espera a que el query ["my-alias"] resuelva (habilita el botón Guardar).
    await screen.findByText("Alias actual");

    await user.type(screen.getByLabelText(/nuevo alias/i), "nuevo-alias");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(mockUpdateMyAlias).toHaveBeenCalledWith("nuevo-alias");
    });
    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled();
    });
    await screen.findByText("Tu alias es @nuevo-alias.");
  });

  it("llama refreshSession() tras eliminar el alias (alias → null)", async () => {
    mockGetMyAlias.mockResolvedValue(
      aliasQueryResult("juan"),
    );
    mockUpdateMyAlias.mockResolvedValue(
      aliasQueryResult(null),
    );

    const user = userEvent.setup();
    renderProfile();

    const deleteButton = await screen.findByRole("button", {
      name: /eliminar alias/i,
    });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockUpdateMyAlias).toHaveBeenCalledWith(null);
    });
    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled();
    });
    await screen.findByText("Eliminaste tu alias.");
  });
});

describe("AliasCard — cooldown del alias", () => {
  const future = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  it("cooldown activo con alias: input, Guardar y Eliminar deshabilitados + copy de fecha", async () => {
    const nextChangeAllowedAt = future();
    mockGetMyAlias.mockResolvedValue(
      aliasQueryResult("juan", nextChangeAllowedAt),
    );

    const user = userEvent.setup();
    renderProfile();

    await screen.findByText("Alias actual");

    expect(screen.getByLabelText(/nuevo alias/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /eliminar alias/i }),
    ).toBeDisabled();

    expect(
      screen.getByText(
        `Podés volver a cambiarlo el ${formatCooldown(nextChangeAllowedAt)}.`,
      ),
    ).toBeInTheDocument();

    // Ni el submit ni el delete disparan la API mientras dure el cooldown.
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    await user.click(screen.getByRole("button", { name: /eliminar alias/i }));
    expect(mockUpdateMyAlias).not.toHaveBeenCalled();
  });

  it("cooldown tras eliminar (alias null): input/Guardar deshabilitados + copy 'alias nuevo'", async () => {
    const nextChangeAllowedAt = future();
    mockGetMyAlias.mockResolvedValue(
      aliasQueryResult(null, nextChangeAllowedAt),
    );

    renderProfile();

    await screen.findByText("No tenés alias configurado.");

    expect(screen.getByLabelText(/nuevo alias/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeDisabled();
    // Sin alias no hay acción de eliminar.
    expect(
      screen.queryByRole("button", { name: /eliminar alias/i }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(
        `Podés configurar un alias nuevo el ${formatCooldown(nextChangeAllowedAt)}.`,
      ),
    ).toBeInTheDocument();
  });

  it("sin cooldown (nextChangeAllowedAt null): input, Guardar y Eliminar habilitados", async () => {
    mockGetMyAlias.mockResolvedValue(aliasQueryResult("juan", null));

    renderProfile();

    await screen.findByText("Alias actual");

    expect(screen.getByLabelText(/nuevo alias/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /eliminar alias/i }),
    ).toBeEnabled();
    expect(screen.queryByText(/Podés volver a cambiarlo/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Podés configurar un alias nuevo/),
    ).not.toBeInTheDocument();
  });

  it("nextChangeAllowedAt pasado (cooldown vencido): habilitados", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    mockGetMyAlias.mockResolvedValue(aliasQueryResult("juan", past));

    renderProfile();

    await screen.findByText("Alias actual");

    expect(screen.getByLabelText(/nuevo alias/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /guardar/i })).toBeEnabled();
  });
});