/**
 * Fase 3 / D-079..D-088 — Tests del panel de generación de QR.
 *
 * Cubre:
 * - Generación con source presencial/concesionaria (D-085, D-086).
 * - Render del QR + countdown server-side (expiresAt) + acciones.
 * - 409 (D-079): error mapeado sin exponer texto crudo del backend.
 * - Revocar: llama DELETE y vuelve al estado inicial.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QrTransferPanel } from "@/components/transfer/qr-transfer-panel";

const mockGenerate = vi.fn();
const mockRevoke = vi.fn();

vi.mock("@/lib/api", () => ({
  vehicleApi: {
    generateTransferQr: (...args: unknown[]) => mockGenerate(...args),
    revokeTransferQr: (...args: unknown[]) => mockRevoke(...args),
  },
}));

// qrcode.react renderiza canvas/svg; suficiente con exponer el valor como texto.
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({
    value,
    title,
  }: {
    value: string;
    title?: string;
  }) => (
    <div data-testid="qr-code" title={title}>
      {value}
    </div>
  ),
}));

const VEHICLE = { id: "v1", licensePlate: "ABC123" };

function makeGenerated(overrides: Record<string, unknown> = {}) {
  return {
    id: "qr1",
    token: "abc123abc123abc123abc123abc12312",
    url: "http://localhost:3000/transfer/qr/abc123abc123abc123abc123abc12312",
    source: "presencial",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    secondsRemaining: 3600,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("QrTransferPanel", () => {
  it("genera un QR presencial y muestra render + countdown + revocar", async () => {
    const user = userEvent.setup();
    mockGenerate.mockResolvedValue(makeGenerated());

    render(<QrTransferPanel vehicle={VEHICLE} />);

    expect(screen.getByLabelText(/origen de la transferencia/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generar qr/i }));

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith("v1", { source: "presencial" }),
    );

    const qr = await screen.findByTestId("qr-code");
    expect(qr).toHaveTextContent(
      "http://localhost:3000/transfer/qr/abc123abc123abc123abc123abc12312",
    );
    expect(screen.getByText(/59:5\d|60:00/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /revocar qr/i }),
    ).toBeInTheDocument();
  });

  it("permite elegir concesionaria y la envía como source", async () => {
    const user = userEvent.setup();
    mockGenerate.mockResolvedValue(
      makeGenerated({ source: "concesionaria", secondsRemaining: 172800 }),
    );

    render(<QrTransferPanel vehicle={VEHICLE} />);

    await user.selectOptions(
      screen.getByLabelText(/origen de la transferencia/i),
      "concesionaria",
    );
    await user.click(screen.getByRole("button", { name: /generar qr/i }));

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith("v1", {
        source: "concesionaria",
      }),
    );
  });

  it("409 (D-079): muestra mensaje mapeado sin exponer el texto del backend", async () => {
    const user = userEvent.setup();
    mockGenerate.mockRejectedValue({
      status: 409,
      message: "Ya existe un QR pendiente para este vehículo. Vencimiento: ...",
    });

    render(<QrTransferPanel vehicle={VEHICLE} />);
    await user.click(screen.getByRole("button", { name: /generar qr/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Ya existe un QR de transferencia pendiente para este vehículo.",
    );
    expect(alert).not.toHaveTextContent(/Vencimiento:/);
  });

  it("403: mensaje de titular normalizado", async () => {
    const user = userEvent.setup();
    mockGenerate.mockRejectedValue({ status: 403 });

    render(<QrTransferPanel vehicle={VEHICLE} />);
    await user.click(screen.getByRole("button", { name: /generar qr/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo el titular del vehículo puede generar el QR.",
    );
  });

  it("revoca el QR y vuelve al formulario de generación", async () => {
    const user = userEvent.setup();
    mockGenerate.mockResolvedValue(makeGenerated());
    mockRevoke.mockResolvedValue({ revoked: true, id: "qr1" });

    render(<QrTransferPanel vehicle={VEHICLE} />);
    await user.click(screen.getByRole("button", { name: /generar qr/i }));
    await screen.findByTestId("qr-code");

    await user.click(screen.getByRole("button", { name: /revocar qr/i }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("v1"));
    expect(
      await screen.findByRole("button", { name: /generar qr/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("qr-code")).not.toBeInTheDocument();
  });
});