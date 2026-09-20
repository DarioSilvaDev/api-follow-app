/**
 * Tests del mapeo de errores del workspace admin — sección talleres (D-106).
 *
 * Cubre el contrato backend congelado (espejo de concesionarias):
 * - POST /admin/workshops → 409 CONFLICT por nombre/CUIT duplicado (code
 *   único CONFLICT; el frontend clasifica el mensaje interno para copy
 *   específico — Basado en resolvers existentes de concesionarias).
 * - POST /admin/workshops/:id/invitations → 404 no existe; 409 INVITATION_USED;
 *   409 CONFLICT invitación vigente.
 * - PATCH /admin/workshops/:id/status → 404 no existe; 403 sin permisos.
 *
 * El frontend NUNCA expone el mensaje crudo del backend.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAdminWorkshopDetailError,
  resolveAdminWorkshopsListError,
  resolveCreateAdminWorkshopError,
  resolveResendWorkshopInvitationError,
  resolveUpdateWorkshopStatusError,
} from "@/lib/admin-errors";

describe("resolveCreateAdminWorkshopError", () => {
  it("409 CONFLICT por CUIT → copy específico", () => {
    expect(
      resolveCreateAdminWorkshopError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe un taller con este CUIT",
      }),
    ).toBe("Ya existe un taller con ese CUIT.");
    // TaxId normalizado (digitos) nunca debe romper la clasificación.
    expect(
      resolveCreateAdminWorkshopError({
        status: 409,
        code: "CONFLICT",
        message: "tax_id ya existe",
      }),
    ).toBe("Ya existe un taller con ese CUIT.");
  });

  it("409 CONFLICT por nombre → copy específico", () => {
    expect(
      resolveCreateAdminWorkshopError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe un taller con este nombre",
      }),
    ).toBe("Ya existe un taller con ese nombre.");
  });

  it("409 sin mensaje discernible → genérico de duplicado", () => {
    expect(
      resolveCreateAdminWorkshopError({ status: 409, code: "CONFLICT" }),
    ).toBe("Ya existe un taller registrado con esos datos.");
  });

  it("403 → permisos; 400 → validación; 5xx → genérico; sin status → fallback", () => {
    expect(
      resolveCreateAdminWorkshopError({ status: 403, message: "forbidden" }),
    ).toBe("No tenés permisos para crear talleres.");
    expect(
      resolveCreateAdminWorkshopError({ status: 400, message: "bad request" }),
    ).toBe("Revisá los datos ingresados e intentá nuevamente.");
    expect(
      resolveCreateAdminWorkshopError({ status: 500, message: "boom" }),
    ).toBe("Error interno del servidor. Intentá más tarde.");
    expect(resolveCreateAdminWorkshopError(new Error("net"))).toBe(
      "No se pudo crear el taller. Intentá nuevamente.",
    );
  });
});

describe("resolveResendWorkshopInvitationError", () => {
  it("404 → taller no existe", () => {
    expect(
      resolveResendWorkshopInvitationError({ status: 404 }),
    ).toContain("ya no existe");
  });

  it("409 INVITATION_USED / CANCELLED → invitación no vigente", () => {
    expect(
      resolveResendWorkshopInvitationError({
        status: 409,
        code: "INVITATION_USED",
      }),
    ).toContain("ya no está vigente");
    expect(
      resolveResendWorkshopInvitationError({
        status: 409,
        code: "INVITATION_CANCELLED",
      }),
    ).toContain("ya no está vigente");
  });

  it("409 genérico → invitación actual sigue vigente", () => {
    expect(
      resolveResendWorkshopInvitationError({ status: 409, code: "CONFLICT" }),
    ).toContain("sigue vigente");
  });

  it("403 → permisos; 5xx → genérico", () => {
    expect(
      resolveResendWorkshopInvitationError({ status: 403 }),
    ).toContain("permisos");
    expect(
      resolveResendWorkshopInvitationError({ status: 500 }),
    ).toContain("Error interno");
  });
});

describe("resolveUpdateWorkshopStatusError", () => {
  it("404 → taller no existe", () => {
    expect(resolveUpdateWorkshopStatusError({ status: 404 })).toContain(
      "ya no existe",
    );
  });

  it("403 → permisos", () => {
    expect(resolveUpdateWorkshopStatusError({ status: 403 })).toContain(
      "No tenés permisos",
    );
  });

  it("5xx → genérico; sin status → fallback", () => {
    expect(resolveUpdateWorkshopStatusError({ status: 500 })).toContain(
      "Error interno",
    );
    expect(resolveUpdateWorkshopStatusError(new Error("x"))).toContain(
      "No se pudo actualizar",
    );
  });
});

describe("mensajes de listado / detalle", () => {
  it("siempre copy estable y sin texto crudo", () => {
    expect(resolveAdminWorkshopsListError()).toContain("talleres");
    expect(resolveAdminWorkshopDetailError()).toContain("taller");
  });
});