/**
 * Tests del helper de estado efectivo admin (Fase 2/3 handoff PM).
 *
 * Cubre la precedencia (decisión PM P2):
 * - disabled gana SIEMPRE (isActive=false) incluso con invitación vencida.
 * - expired_pending = status pending_claim + invitation.pending + expiresAt
 *   vencida (decisión client-side D3).
 * - pending_claim vigente (invitación pendiente sin vencer, o sin invitación).
 * - active; users: solo status de cuenta (P6, sin expiración).
 */
import { describe, expect, it } from "vitest";
import {
  formatAdminDate,
  getAdminDealershipStatusState,
  getAdminUserStatusState,
  getAdminWorkshopStatusState,
} from "@/lib/admin-status";
import type { AdminEntityStatusShape } from "@/lib/admin-status";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function base(overrides: Partial<AdminEntityStatusShape> = {}): AdminEntityStatusShape {
  return {
    isActive: true,
    status: "pending_claim",
    invitation: null,
    ...overrides,
  };
}

describe("getAdminDealershipStatusState", () => {
  it("isActive=false gana SIEMPRE: incluso con invitación vencida → disabled", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          isActive: false,
          invitation: {
            status: "pending",
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        }),
        NOW,
      ),
    ).toBe("disabled");
  });

  it("pending_claim con invitación vencida → expired_pending", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          invitation: {
            status: "pending",
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        }),
        NOW,
      ),
    ).toBe("expired_pending");
  });

  it("pending_claim con invitación vigente → pending_claim (NO expirada)", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          invitation: {
            status: "pending",
            expiresAt: "2026-10-01T00:00:00.000Z",
          },
        }),
        NOW,
      ),
    ).toBe("pending_claim");
  });

  it("pending_claim sin invitación → pending_claim (nunca expirada)", () => {
    expect(getAdminDealershipStatusState(base(), NOW)).toBe("pending_claim");
  });

  it("invitación usada/cancelada NO cuenta como expirada (D3)", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          invitation: { status: "used", expiresAt: "2026-09-01T00:00:00.000Z" },
        }),
        NOW,
      ),
    ).toBe("pending_claim");
    expect(
      getAdminDealershipStatusState(
        base({
          invitation: {
            status: "cancelled",
            expiresAt: "2026-09-01T00:00:00.000Z",
          },
        }),
        NOW,
      ),
    ).toBe("pending_claim");
  });

  it("expiresAt inválido no expira (defensivo ante formatos inconsistentes)", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          invitation: { status: "pending", expiresAt: "no-es-una-fecha" },
        }),
        NOW,
      ),
    ).toBe("pending_claim");
  });

  it("status active → active (aunque la invitación esté vencida en el item)", () => {
    expect(
      getAdminDealershipStatusState(
        base({
          status: "active",
          invitation: { status: "pending", expiresAt: "2026-09-01T00:00:00.000Z" },
        }),
        NOW,
      ),
    ).toBe("active");
  });

  it("default now = Date.now() (sin fecha explícita)", () => {
    expect(getAdminDealershipStatusState(base())).toBe("pending_claim");
  });
});

describe("getAdminWorkshopStatusState", () => {
  it("es espejo de concesionarias (disabled gana; expiración en pendientes)", () => {
    expect(
      getAdminWorkshopStatusState(
        base({
          isActive: false,
          invitation: { status: "pending", expiresAt: "2026-09-01T00:00:00.000Z" },
        }),
        NOW,
      ),
    ).toBe("disabled");
    expect(
      getAdminWorkshopStatusState(
        base({
          invitation: { status: "pending", expiresAt: "2026-09-01T00:00:00.000Z" },
        }),
        NOW,
      ),
    ).toBe("expired_pending");
    expect(getAdminWorkshopStatusState(base({ status: "active" }), NOW)).toBe(
      "active",
    );
  });
});

describe("getAdminUserStatusState", () => {
  it("mapea directo el status de cuenta (P6: sin expiración)", () => {
    expect(getAdminUserStatusState(base({ status: "active" }))).toBe("active");
    expect(getAdminUserStatusState(base({ status: "suspended" }))).toBe(
      "suspended",
    );
    expect(getAdminUserStatusState(base({ status: "pending" }))).toBe("pending");
  });

  it("status desconocido → pending (fallback defensivo)", () => {
    expect(getAdminUserStatusState(base({ status: "misterio" }))).toBe("pending");
  });

  it("isActive=false no aplica a usuarios (el status de cuenta manda)", () => {
    expect(
      getAdminUserStatusState(base({ isActive: false, status: "active" })),
    ).toBe("active");
  });
});

describe("formatAdminDate", () => {
  it("formatea dd mmm yyyy en es-AR", () => {
    // Nota: el formatter es-AR de ICU (Node/happy-dom) intercala "de":
    // "22 de sept de 2026". Es el mismo comportamiento del formatDate previo
    // de los listados admin — se mantiene el helper consistente.
    expect(formatAdminDate("2026-09-22T12:00:00.000Z")).toBe(
      "22 de sept de 2026",
    );
  });

  it("inputs inválidos/missing → '—'", () => {
    expect(formatAdminDate(null)).toBe("—");
    expect(formatAdminDate(undefined)).toBe("—");
    expect(formatAdminDate("no-es-una-fecha")).toBe("—");
  });
});