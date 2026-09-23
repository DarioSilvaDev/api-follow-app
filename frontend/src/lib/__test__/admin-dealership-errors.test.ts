/**
 * Tests del mapeo de errores del workspace admin — sección concesionarias
 * (D-106) + contrato PATCH edición (handoff PM P1, decisión D-A/D-B).
 *
 * Cubre el contrato backend congelado:
 * - POST /admin/dealerships → 409 CONFLICT por nombre/CUIT duplicado (code
 *   único CONFLICT; el frontend clasifica el mensaje interno para copy
 *   específico).
 * - PATCH /admin/dealerships/:id → 409 + code `DEALERSHIP_CUIT_LOCKED` cuando
 *   el CUIT no puede modificarse (concesionaria reclamada + CUIT distinto +
 *   actor NO super_admin). El code gana ANTES del fallback por status 409:
 *   los duplicados normales (nombre/CUIT) y demás status (404/403/400/422/5xx)
 *   NO se rompen.
 * - POST /admin/dealerships/:id/invitations → 404 / 409 INVITATION_USED /
 *   409 CONFLICT invitación vigente.
 * - PATCH /admin/dealerships/:id/status → 404 / 403.
 *
 * Shape del error: `{ status, message?, code? }` plano (toApiError de
 * src/lib/api.ts). El frontend NUNCA expone el mensaje crudo del backend.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAdminDealershipDetailError,
  resolveAdminDealershipsListError,
  resolveCreateAdminDealershipError,
  resolveEditAdminDealershipError,
  resolveResendInvitationError,
  resolveUpdateDealershipStatusError,
} from "@/lib/admin-errors";

describe("resolveEditAdminDealershipError — code DEALERSHIP_CUIT_LOCKED", () => {
  it("409 + DEALERSHIP_CUIT_LOCKED → copy específico de CUIT reclamado", () => {
    expect(
      resolveEditAdminDealershipError({
        status: 409,
        code: "DEALERSHIP_CUIT_LOCKED",
        message: "El CUIT no puede modificarse porque la concesionaria ya fue reclamada",
      }),
    ).toBe(
      "El CUIT no puede modificarse porque la concesionaria ya fue reclamada.",
    );
  });

  it("el code gana aunque el message sea el genérico de duplicado (no depende del body)", () => {
    expect(
      resolveEditAdminDealershipError({
        status: 409,
        code: "DEALERSHIP_CUIT_LOCKED",
        message: "Conflict",
      }),
    ).toBe(
      "El CUIT no puede modificarse porque la concesionaria ya fue reclamada.",
    );
  });

  it("el code gana aunque no haya status (defensivo — nunca cae al fallback)", () => {
    expect(
      resolveEditAdminDealershipError({
        code: "DEALERSHIP_CUIT_LOCKED",
      }),
    ).toBe(
      "El CUIT no puede modificarse porque la concesionaria ya fue reclamada.",
    );
  });

  it("NUNCA expone el message crudo del backend", () => {
    const result = resolveEditAdminDealershipError({
      status: 409,
      code: "DEALERSHIP_CUIT_LOCKED",
      message: "raw internal message",
    });
    expect(result).not.toContain("raw internal");
  });
});

describe("resolveEditAdminDealershipError — duplicados normales y demás status", () => {
  it("409 CONFLICT por CUIT duplicado → copy de duplicado (NO el de CUIT reclamado)", () => {
    expect(
      resolveEditAdminDealershipError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe otra concesionaria con este CUIT",
      }),
    ).toBe("Ya existe otra concesionaria con ese CUIT.");
    // TaxId normalizado (digitos) nunca debe romper la clasificación.
    expect(
      resolveEditAdminDealershipError({
        status: 409,
        code: "CONFLICT",
        message: "tax_id ya existe",
      }),
    ).toBe("Ya existe otra concesionaria con ese CUIT.");
  });

  it("409 CONFLICT por nombre duplicado → copy específico", () => {
    expect(
      resolveEditAdminDealershipError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe otra concesionaria con este nombre",
      }),
    ).toBe("Ya existe otra concesionaria con ese nombre.");
  });

  it("409 sin mensaje discernible → genérico de duplicado", () => {
    expect(
      resolveEditAdminDealershipError({ status: 409, code: "CONFLICT" }),
    ).toBe("Ya existe una concesionaria registrada con esos datos.");
  });

  it("404 → no existe; 403 → permisos; 400/422 → validación; 5xx → genérico; sin status → fallback", () => {
    expect(
      resolveEditAdminDealershipError({ status: 404, message: "not found" }),
    ).toBe("La concesionaria ya no existe o fue eliminada.");
    expect(
      resolveEditAdminDealershipError({ status: 403, message: "forbidden" }),
    ).toBe("No tenés permisos para editar concesionarias.");
    expect(
      resolveEditAdminDealershipError({ status: 400, message: "bad request" }),
    ).toBe("Revisá los datos ingresados e intentá nuevamente.");
    expect(
      resolveEditAdminDealershipError({ status: 422, message: "unprocessable" }),
    ).toBe("Revisá los datos ingresados e intentá nuevamente.");
    expect(
      resolveEditAdminDealershipError({ status: 500, message: "boom" }),
    ).toBe("Error interno del servidor. Intentá más tarde.");
    expect(resolveEditAdminDealershipError(new Error("net"))).toBe(
      "No se pudo guardar la concesionaria. Intentá nuevamente.",
    );
  });
});

describe("resolveCreateAdminDealershipError", () => {
  it("409 CONFLICT por CUIT → copy específico (sin code nuevo; el alta no lo usa)", () => {
    expect(
      resolveCreateAdminDealershipError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe una concesionaria con este CUIT",
      }),
    ).toBe("Ya existe una concesionaria con ese CUIT.");
  });

  it("409 CONFLICT por nombre → copy específico", () => {
    expect(
      resolveCreateAdminDealershipError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe una concesionaria con este nombre",
      }),
    ).toBe("Ya existe una concesionaria con ese nombre.");
  });

  it("403 → permisos; 5xx → genérico; sin status → fallback", () => {
    expect(
      resolveCreateAdminDealershipError({ status: 403 }),
    ).toBe("No tenés permisos para crear concesionarias.");
    expect(
      resolveCreateAdminDealershipError({ status: 500 }),
    ).toBe("Error interno del servidor. Intentá más tarde.");
    expect(resolveCreateAdminDealershipError(new Error("x"))).toBe(
      "No se pudo crear la concesionaria. Intentá nuevamente.",
    );
  });
});

describe("resolveResendInvitationError", () => {
  it("404 → concesionaria no existe", () => {
    expect(resolveResendInvitationError({ status: 404 })).toContain(
      "ya no existe",
    );
  });

  it("409 INVITATION_USED / CANCELLED → invitación no vigente", () => {
    expect(
      resolveResendInvitationError({ status: 409, code: "INVITATION_USED" }),
    ).toContain("ya no está vigente");
    expect(
      resolveResendInvitationError({ status: 409, code: "INVITATION_CANCELLED" }),
    ).toContain("ya no está vigente");
  });

  it("409 genérico → invitación actual sigue vigente", () => {
    expect(
      resolveResendInvitationError({ status: 409, code: "CONFLICT" }),
    ).toContain("sigue vigente");
  });

  it("403 → permisos; 5xx → genérico", () => {
    expect(resolveResendInvitationError({ status: 403 })).toContain("permisos");
    expect(resolveResendInvitationError({ status: 500 })).toContain(
      "Error interno",
    );
  });
});

describe("resolveUpdateDealershipStatusError", () => {
  it("404 → concesionaria no existe", () => {
    expect(resolveUpdateDealershipStatusError({ status: 404 })).toContain(
      "ya no existe",
    );
  });

  it("403 → permisos", () => {
    expect(resolveUpdateDealershipStatusError({ status: 403 })).toContain(
      "No tenés permisos",
    );
  });

  it("5xx → genérico; sin status → fallback", () => {
    expect(resolveUpdateDealershipStatusError({ status: 500 })).toContain(
      "Error interno",
    );
    expect(resolveUpdateDealershipStatusError(new Error("x"))).toContain(
      "No se pudo actualizar",
    );
  });
});

describe("mensajes de listado / detalle", () => {
  it("siempre copy estable y sin texto crudo", () => {
    expect(resolveAdminDealershipsListError()).toContain("concesionarias");
    expect(resolveAdminDealershipDetailError()).toContain("concesionaria");
  });
});