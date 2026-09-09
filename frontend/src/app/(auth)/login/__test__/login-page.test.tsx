/**
 * Tests for the Login page behavior.
 *
 * Critical behaviors:
 * a. Successful login → calls refreshSession (/auth/me), redirects to ?next=
 *    → D-001: no localStorage/sessionStorage token writes
 * b. 401 → shows "Email o contraseña incorrectos"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockPush = vi.fn();
const mockGetNextParam = vi.fn((): string | null => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "next") return mockGetNextParam();
      return null;
    },
  }),
}));

const mockLogin = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock("@/lib/api", () => ({
  authApi: {
    login: (...args: unknown[]) => mockLogin(...args),
  },
  HTTPError: class HTTPError extends Error {},
  isHTTPError: () => false,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    refreshSession: mockRefreshSession,
  }),
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

// We import LoginPage after mocks are set up
let LoginPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();

  // Dynamic import ensures mocks are resolved first
  const mod = await import("@/app/(auth)/login/page");
  LoginPage = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Login page", () => {
  it("successful login calls refreshSession and redirects to /dashboard", async () => {
    const user = userEvent.setup();

    mockLogin.mockResolvedValue({ user: {} });
    mockRefreshSession.mockResolvedValue(undefined);

    render(<LoginPage />);

    // Fill in the form
    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");

    // Submit
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@example.com", "password123");
    });

    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("respects ?next= param and redirects there after login", async () => {
    const user = userEvent.setup();
    mockGetNextParam.mockReturnValue("/vehicles/v1");
    mockLogin.mockResolvedValue({ user: {} });
    mockRefreshSession.mockResolvedValue(undefined);

    render(<LoginPage />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/vehicles/v1");
    });
  });

  it("does NOT write tokens to localStorage or sessionStorage (D-001)", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ user: {} });
    mockRefreshSession.mockResolvedValue(undefined);

    render(<LoginPage />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });

    // D-001: No tokens in storage
    const lsKeys = Object.keys(localStorage);
    const ssKeys = Object.keys(sessionStorage);

    const hasTokenInLS = lsKeys.some(
      (k) =>
        k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("auth") ||
        k.toLowerCase().includes("session"),
    );
    const hasTokenInSS = ssKeys.some(
      (k) =>
        k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("auth") ||
        k.toLowerCase().includes("session"),
    );

    expect(hasTokenInLS).toBe(false);
    expect(hasTokenInSS).toBe(false);
  });

  it("shows 'Email o contraseña incorrectos' on 401", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValue({ status: 401, message: "Unauthorized" });

    render(<LoginPage />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "wrong@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Email o contraseña incorrectos."),
      ).toBeInTheDocument();
    });

    // Should NOT redirect
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows rate-limit message on 429", async () => {
    const user = userEvent.setup();

    mockLogin.mockRejectedValue({ status: 429, message: "Too many" });

    render(<LoginPage />);

    await user.type(
      screen.getByRole("textbox", { name: /email/i }),
      "test@example.com",
    );
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Demasiados intentos. Intenta más tarde."),
      ).toBeInTheDocument();
    });
  });
});
