/**
 * Tests del wizard de USUARIO de plataforma (D-106 users, kind=user).
 *
 * Cubre:
 * - resolveUserWizardClaimErrorMessage: mapeo del claim
 *   (POST /users/wizard/claim; PÚBLICO, sin email en el body). Estados
 *   terminales INVITATION_* que transicionan el caller; 409 CONFLICT por
 *   cuenta soft-deleted (D-S3), cuenta activa, cuenta suspendida; 400
 *   VALIDATION_ERROR; 5xx/red → genérico. El frontend NUNCA expone el
 *   mensaje crudo del backend.
 * - userWizardRegisterSchema: el claim exige firstName/lastName/password; el
 *   email NUNCA se recopila (lo fija la invitación) y no hay teléfono.
 */
import { describe, it, expect } from "vitest";
import { resolveUserWizardClaimErrorMessage } from "@/lib/invitation-errors";
import { userWizardRegisterSchema } from "@/lib/invitation-schema";

describe("resolveUserWizardClaimErrorMessage", () => {
  it("estados terminales de la invitación → copy canónico por kind", () => {
    expect(
      resolveUserWizardClaimErrorMessage({
        status: 404,
        code: "INVITATION_INVALID",
      }),
    ).toContain("inválido");
    expect(
      resolveUserWizardClaimErrorMessage({ status: 410, code: "INVITATION_EXPIRED" }),
    ).toContain("venció");
    expect(
      resolveUserWizardClaimErrorMessage({ status: 409, code: "INVITATION_USED" }),
    ).toContain("ya fue utilizada");
    expect(
      resolveUserWizardClaimErrorMessage({
        status: 410,
        code: "INVITATION_CANCELLED",
      }),
    ).toContain("cancelada");
  });

  it("409 cuenta soft-deleted (D-S3) → copy de cuenta desactivada", () => {
    expect(
      resolveUserWizardClaimErrorMessage({
        status: 409,
        code: "CONFLICT",
        message: "Este email está asociado a una cuenta desactivada. Contactá a soporte.",
      }),
    ).toBe(
      "Este email está asociado a una cuenta desactivada. Si creés que es un error, escribinos a soporte.",
    );
  });

  it("409 cuenta activa → copy de cuenta existente", () => {
    expect(
      resolveUserWizardClaimErrorMessage({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe una cuenta activa con este email",
      }),
    ).toContain("Ya existe una cuenta activa");
  });

  it("409 cuenta suspendida → copy de suspensión", () => {
    expect(
      resolveUserWizardClaimErrorMessage({
        status: 409,
        code: "CONFLICT",
        message: "La cuenta está suspendida",
      }),
    ).toContain("suspendida");
  });

  it("400 / VALIDATION_ERROR → pedir campos de registro", () => {
    expect(
      resolveUserWizardClaimErrorMessage({ status: 400, code: "VALIDATION_ERROR" }),
    ).toContain("nombre, apellido y contraseña");
    // El claim usa CodedHttpException → SIEMPRE viaja con code; un 400 sin
    // code cae en el fallback histórico de invitationErrorKind (INVITATION_EXPIRED).
    expect(
      resolveUserWizardClaimErrorMessage({ status: 400, code: "VALIDATION_ERROR", message: "firstName is required" }),
    ).toContain("nombre, apellido y contraseña");
  });

  it("401 → sesión requerida; 403 → sin permisos", () => {
    expect(resolveUserWizardClaimErrorMessage({ status: 401 })).toContain(
      "iniciar sesión",
    );
    expect(resolveUserWizardClaimErrorMessage({ status: 403 })).toContain(
      "permisos",
    );
  });

  it("5xx / desconocido → genérico", () => {
    expect(resolveUserWizardClaimErrorMessage({ status: 500 })).toContain(
      "Intentá nuevamente",
    );
    expect(resolveUserWizardClaimErrorMessage(new Error("net"))).toContain(
      "Intentá nuevamente",
    );
  });
});

describe("userWizardRegisterSchema", () => {
  const valid = {
    firstName: "Ana",
    lastName: "Gómez",
    password: "supersecreto",
    confirmPassword: "supersecreto",
  };

  it("acepta el objeto mínimo del claim (sin email ni teléfono)", () => {
    const result = userWizardRegisterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rechaza sin nombre/apellido/contraseña (backend 400).", () => {
    expect(
      userWizardRegisterSchema.safeParse({
        firstName: "",
        lastName: "",
        password: "123",
        confirmPassword: "123",
      }).success,
    ).toBe(false);
  });

  it("rechaza contraseñas que no coinciden", () => {
    const result = userWizardRegisterSchema.safeParse({
      ...valid,
      confirmPassword: "otra",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("confirmPassword");
    }
  });

  it("exige contraseña de al menos 8 caracteres", () => {
    expect(
      userWizardRegisterSchema.safeParse({
        ...valid,
        password: "corta",
        confirmPassword: "corta",
      }).success,
    ).toBe(false);
  });
});