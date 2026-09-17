/**
 * Fase 3 / D-081..D-083 — Tests de la página de aceptación del QR.
 *
 * Cubre:
 * - Preview: vehículo + emisor (alias/nombre, SIN email) + acción aceptar.
 * - Confirmación explícita (D-082) → accept one-shot.
 * - Errores mapeados: 404 expirado / 409 consumido / 410 revocado / 400 self
 *   (nunca texto crudo del backend).
 * - Sin sesión → redirect a /login?next= (D-080, RF-7).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TransferQrAcceptPage from "@/app/transfer/qr/[token]/page";

const mockPreview = vi.fn();
const mockAccept = vi.fn();
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockParams = vi.fn<() => Record<string, string>>(
  () => ({ token: "TOKEN123" }),
);

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    previewTransferQr: (...args: unknown[]) => mockPreview(...args),
    acceptTransferQr: (...args: unknown[]) => mockAccept(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => mockParams(),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

function makePreview(overrides: Record<string, unknown> = {}) {
  return {
    vehicle: {
      id: "v1",
      name: "Toyota Corolla",
      licensePlate: "ABC123",
    },
    fromUser: {
      id: "u1",
      firstName: "María",
      lastName: "Gómez",
      alias: null,
    },
    source: "presencial",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    secondsRemaining: 3600,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ status: "authenticated" });
});

describe("TransferQrAcceptPage", () => {
  it("muestra el preview con vehículo y emisor, sin email", async () => {
    mockPreview.mockResolvedValue(makePreview());

    render(<TransferQrAcceptPage />);

    expect(
      await screen.findByText("Transferencia de vehículo"),
    ).toBeInTheDocument();
    expect(screen.getByText("Toyota Corolla")).toBeInTheDocument();
    expect(screen.getByText("Patente: ABC123")).toBeInTheDocument();
    // Emisor sin PII: nombre completo (no hay alias) — y NUNCA el email.
    expect(screen.getByText(/María Gómez/)).toBeInTheDocument();
    expect(
      screen.queryByText(/@|email|gomez/gi),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /aceptar y recibir vehículo/i }),
    ).toBeInTheDocument();
  });

  it("usa el alias del emisor cuando existe (sin email), D-078", async () => {
    mockPreview.mockResolvedValue(
      makePreview({
        fromUser: {
          id: "u1",
          firstName: "María",
          lastName: "Gómez",
          alias: "maru_g",
        },
      }),
    );

    render(<TransferQrAcceptPage />);

    expect(await screen.findByText(/@maru_g/)).toBeInTheDocument();
    expect(screen.queryByText(/María Gómez/)).not.toBeInTheDocument();
    expect(screen.queryByText(/maru_g@/)).not.toBeInTheDocument();
  });

  it("acepta con confirmación one-shot y muestra la pantalla final", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockAccept.mockResolvedValue({ transferId: "t1", status: "completed" });

    render(<TransferQrAcceptPage />);

    await user.click(
      await screen.findByRole("button", { name: /aceptar y recibir vehículo/i }),
    );

    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith("TOKEN123"));
    expect(
      await screen.findByText("¡Transferencia completada!"),
    ).toBeInTheDocument();
  });

  it("404 QR inválido/expirado: pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({
      status: 404,
      message: "QR inválido o expirado",
    });

    render(<TransferQrAcceptPage />);

    expect(
      await screen.findByText("No se pudo abrir el QR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("El QR es inválido o ya expiró."),
    ).toBeInTheDocument();
  });

  it("410 revocado: pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({ status: 410, message: "QR revocado" });

    render(<TransferQrAcceptPage />);

    expect(
      await screen.findByText("No se pudo abrir el QR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Este QR fue revocado y ya no está vigente."),
    ).toBeInTheDocument();
  });

  it("409 consumido: pantalla de error mapeada", async () => {
    mockPreview.mockRejectedValue({
      status: 409,
      message: "QR ya utilizado",
    });

    render(<TransferQrAcceptPage />);

    expect(
      await screen.findByText("No se pudo abrir el QR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Este QR ya fue utilizado."),
    ).toBeInTheDocument();
  });

  it("400 self al aceptar: error inline mapeado", async () => {
    const user = userEvent.setup();
    mockPreview.mockResolvedValue(makePreview());
    mockAccept.mockRejectedValue({
      status: 400,
      message: "No podés aceptar tu propio QR",
    });

    render(<TransferQrAcceptPage />);

    await user.click(
      await screen.findByRole("button", { name: /aceptar y recibir vehículo/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No podés aceptar tu propio QR de transferencia.",
    );
  });

  it("sin sesión: redirige a login preservando el deep link como next", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" });

    render(<TransferQrAcceptPage />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/login?next=%2Ftransfer%2Fqr%2FTOKEN123",
      ),
    );
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("token faltante: error genérico sin llamar a la API", () => {
    mockParams.mockReturnValue({});
    mockUseAuth.mockReturnValue({ status: "authenticated" });

    render(<TransferQrAcceptPage />);

    expect(screen.getByText("QR inválido")).toBeInTheDocument();
    expect(mockPreview).not.toHaveBeenCalled();
  });
});