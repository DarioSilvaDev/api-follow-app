/**
 * Tests del mapeo de errores del wizard de invitación
 * (feature "Onboarding administrado de concesionaria").
 *
 * Cubre el contrato backend congelado:
 * - GET preview / POST claim → INVITATION_INVALID (404), INVITATION_EXPIRED
 *   (400), INVITATION_USED (409), INVITATION_CANCELLED (409).
 * - Claim → PERMISSION_DENIED (403), AUTH_REQUIRED (401), VALIDATION_ERROR
 *   (400), CONFLICT (409).
 * - El 409 CONFLICT del claim distingue por mensaje (no hay code dedicado,
 *   D-S3): soft-deleted → "cuenta desactivada"; duplicado (P2002) → "ya
 *   existe una cuenta".
 * - El frontend NUNCA expone el mensaje crudo del backend.
 */
import { describe, it, expect } from "vitest";
import {
  invitationErrorIsSoftDeletedAccount,
  invitationErrorKind,
  invitationErrorMessage,
  resolveInvitationClaimErrorMessage,
  resolveWizardLoginErrorMessage,
} from "@/lib/invitation-errors";

describe("invitationErrorIsSoftDeletedAccount", () => {
  it("detecta el 409 soft-deleted por el mensaje del backend (D-S3)", () => {
    expect(
      invitationErrorIsSoftDeletedAccount({
        status: 409,
        code: "CONFLICT",
        message: "Este email está asociado a una cuenta desactivada. Contactá a soporte.",
      }),
    ).toBe(true);
  });

  it("el 409 duplicado (P2002) NO se clasifica como soft-deleted", () => {
    expect(
      invitationErrorIsSoftDeletedAccount({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe una cuenta con este email",
      }),
    ).toBe(false);
    // Sin mensaje → tampoco.
    expect(invitationErrorIsSoftDeletedAccount({ status: 409 })).toBe(false);
  });

  it("solo aplica dentro de un 409 (nunca a otros status)", () => {
    expect(
      invitationErrorIsSoftDeletedAccount({
        status: 400,
        message: "cuenta desactivada",
      }),
    ).toBe(false);
    expect(
      invitationErrorIsSoftDeletedAccount({
        status: 500,
        message: "cuenta desactivada",
      }),
    ).toBe(false);
    expect(invitationErrorIsSoftDeletedAccount(new Error("cuenta desactivada"))).toBe(
      false,
    );
  });
});

describe("invitationErrorKind", () => {
  it("clasifica por code del contrato (prioridad al code)", () => {
    expect(invitationErrorKind({ code: "INVITATION_INVALID" })).toBe("invalid");
    expect(invitationErrorKind({ code: "INVITATION_EXPIRED" })).toBe("expired");
    expect(invitationErrorKind({ code: "INVITATION_USED" })).toBe("used");
    expect(invitationErrorKind({ code: "INVITATION_CANCELLED" })).toBe(
      "cancelled",
    );
  });

  it("cae a status HTTP como defensa cuando no hay code", () => {
    expect(invitationErrorKind({ status: 404 })).toBe("invalid");
    expect(invitationErrorKind({ status: 400 })).toBe("expired");
    expect(invitationErrorKind({ status: 409 })).toBe("used");
  });

  it("clasifica como generic 5xx / red / desconocido", () => {
    expect(invitationErrorKind({ status: 500 })).toBe("generic");
    expect(invitationErrorKind({ status: 503 })).toBe("generic");
    expect(invitationErrorKind(new Error("Network error"))).toBe("generic");
    expect(invitationErrorKind(undefined)).toBe("generic");
  });

  it("un INVITATION_* con status contradictorio gana por code", () => {
    expect(
      invitationErrorKind({ status: 500, code: "INVITATION_EXPIRED" }),
    ).toBe("expired");
  });
});

describe("invitationErrorMessage (pantallas de error)", () => {
  it("expone copy por estado sin texto crudo del backend", () => {
    const invalid = invitationErrorMessage("invalid");
    expect(invalid.title).toBe("Invitación inválida");
    expect(invalid.body).toContain("invitación es inválido");
    expect(invalid.body).not.toContain("INVITATION_INVALID");

    const expired = invitationErrorMessage("expired");
    expect(expired.title).toBe("La invitación venció");
    expect(expired.body).toContain("venció");

    const used = invitationErrorMessage("used");
    expect(used.title).toBe("Invitación ya utilizada");
    expect(used.body).toContain("ya fue utilizada");

    const cancelled = invitationErrorMessage("cancelled");
    expect(cancelled.title).toBe("Invitación cancelada");
    expect(cancelled.body).toContain("cancelada");
  });

  it("la pantalla generic incluye reintentar + contacto con admin", () => {
    const generic = invitationErrorMessage("generic");
    expect(generic.title).toBe("No pudimos validar el enlace");
    expect(generic.body).toContain("administrador");
  });
});

describe("resolveInvitationClaimErrorMessage", () => {
  it("los estados terminales de invitación devuelven su copy (el caller cambia de pantalla)", () => {
    expect(resolveInvitationClaimErrorMessage({ code: "INVITATION_EXPIRED" })).toContain(
      "venció",
    );
    expect(resolveInvitationClaimErrorMessage({ code: "INVITATION_USED" })).toContain(
      "ya fue utilizada",
    );
  });

  it("AUTH_REQUIRED → volver al paso anterior (nunca message crudo)", () => {
    const message = resolveInvitationClaimErrorMessage({
      status: 401,
      code: "AUTH_REQUIRED",
      message: "You must be logged in",
    });
    expect(message).toContain("Necesitás iniciar sesión");
    expect(message).not.toContain("logged in");
  });

  it("PERMISSION_DENIED → sin permisos", () => {
    const message = resolveInvitationClaimErrorMessage({
      status: 403,
      code: "PERMISSION_DENIED",
      message: "forbidden",
    });
    expect(message).toContain("No tenés permisos");
  });

  it("CONFLICT (409) → cuenta existente", () => {
    const message = resolveInvitationClaimErrorMessage({
      status: 409,
      code: "CONFLICT",
      message: "email already in use",
    });
    expect(message).toContain("Ya existe una cuenta");
    expect(message).not.toContain("already in use");
  });

  it("409 soft-deleted (cuenta desactivada) → copy específico con soporte, NUNCA el copy genérico del duplicado ni el mensaje crudo", () => {
    const message = resolveInvitationClaimErrorMessage({
      status: 409,
      code: "CONFLICT",
      message: "Este email está asociado a una cuenta desactivada. Contactá a soporte.",
    });
    expect(message).toContain("cuenta desactivada");
    expect(message).toContain("soporte");
    expect(message).not.toContain("Ya existe una cuenta");
    expect(message).not.toContain("Contactá a soporte");
    // La cuenta desactivada es inline (no terminal como INVITATION_*).
    expect(
      invitationErrorKind({
        status: 409,
        code: "CONFLICT",
        message: "cuenta desactivada",
      }),
    ).toBe("generic");
  });

  it("VALIDATION_ERROR (400) → revisar datos", () => {
    const message = resolveInvitationClaimErrorMessage({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "invalid phone",
    });
    expect(message).toContain("Revisá los datos");
  });

  it("5xx / desconocido → genérico", () => {
    expect(resolveInvitationClaimErrorMessage({ status: 500 })).toContain(
      "No se pudo completar el trámite",
    );
    expect(resolveInvitationClaimErrorMessage(new Error("boom"))).toContain(
      "No se pudo completar el trámite",
    );
  });
});

describe("resolveWizardLoginErrorMessage", () => {
  it("401 → credenciales incorrectas", () => {
    expect(resolveWizardLoginErrorMessage({ status: 401 })).toBe(
      "Email o contraseña incorrectos.",
    );
  });

  it("429 → throttle", () => {
    expect(resolveWizardLoginErrorMessage({ status: 429 })).toContain(
      "Demasiados intentos",
    );
  });

  it("otro → genérico", () => {
    expect(resolveWizardLoginErrorMessage({ status: 500 })).toContain(
      "No se pudo iniciar sesión",
    );
  });
});