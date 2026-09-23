/**
 * Tests del mapeo de errores del workspace admin — usuarios de plataforma
 * (D-106 users).
 *
 * Cubre el contrato backend verificado:
 * - POST /admin/users → 409 CONFLICT con variantes distinguidas por mensaje
 *   interno (mis concords copy específico): cuenta desactivada (D-S3),
 *   suspendida, rol ya asignado, invitación pendiente; 403/400/404/5xx.
 * - PATCH /admin/users/:id/status → 404/403/5xx.
 * - POST /admin/roles/assign | DELETE /admin/roles/revoke → 409 CONFLICT /
 *   404 / 403 / 5xx.
 *
 * El frontend NUNCA expone el mensaje crudo del backend.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAdminUserDetailError,
  resolveAdminUsersListError,
  resolveAssignUserRoleError,
  resolveInvitePlatformUserError,
  resolveListAdminRolesError,
  resolveRevokeUserRoleError,
  resolveUpdateUserStatusError,
} from "@/lib/admin-errors";

describe("resolveInvitePlatformUserError", () => {
  it("409 cuenta desactivada (D-S3) → copy específico", () => {
    expect(
      resolveInvitePlatformUserError({
        status: 409,
        code: "CONFLICT",
        message: "Este email está asociado a una cuenta desactivada. Contactá a soporte.",
      }),
    ).toBe(
      "Este email está asociado a una cuenta desactivada. Contactá a soporte.",
    );
  });

  it("409 cuenta suspendida → copy específico", () => {
    expect(
      resolveInvitePlatformUserError({
        status: 409,
        code: "CONFLICT",
        message: "La cuenta está suspendida",
      }),
    ).toBe("La cuenta está suspendida.");
  });

  it("409 rol ya asignado → copy específico", () => {
    expect(
      resolveInvitePlatformUserError({
        status: 409,
        code: "CONFLICT",
        message: "El usuario ya tiene el rol Administrador",
      }),
    ).toBe("El usuario ya tiene este rol asignado.");
  });

  it("409 invitación pendiente → copy específico", () => {
    expect(
      resolveInvitePlatformUserError({
        status: 409,
        code: "CONFLICT",
        message: "Ya existe una invitación pendiente para este email",
      }),
    ).toBe("Ya existe una invitación pendiente para este email.");
  });

  it("409 sin mensaje discernible → genérico", () => {
    expect(
      resolveInvitePlatformUserError({ status: 409, code: "CONFLICT" }),
    ).toBe("No se pudo invitar al usuario. Intentá nuevamente.");
  });

  it("403 → permisos; 400 → validación; 404 → rol; 5xx → genérico", () => {
    expect(
      resolveInvitePlatformUserError({ status: 403 }),
    ).toBe("No tenés permisos para invitar usuarios de plataforma.");
    expect(
      resolveInvitePlatformUserError({ status: 400 }),
    ).toBe("Revisá los datos ingresados e intentá nuevamente.");
    expect(
      resolveInvitePlatformUserError({ status: 404 }),
    ).toBe("El rol seleccionado no existe.");
    expect(
      resolveInvitePlatformUserError({ status: 500 }),
    ).toBe("Error interno del servidor. Intentá más tarde.");
  });
});

describe("resolveUpdateUserStatusError", () => {
  it("404 → usuario inexistente; 403 → permisos; 5xx → genérico", () => {
    expect(resolveUpdateUserStatusError({ status: 404 })).toContain(
      "ya no existe",
    );
    expect(resolveUpdateUserStatusError({ status: 403 })).toContain("permisos");
    expect(resolveUpdateUserStatusError({ status: 500 })).toContain("Error interno");
  });
});

describe("resolveAssignUserRoleError", () => {
  it("409 CONFLICT → rol ya asignado", () => {
    expect(
      resolveAssignUserRoleError({ status: 409, code: "CONFLICT" }),
    ).toBe("El usuario ya tiene este rol asignado.");
  });

  it("403 → permisos; 404 → usuario/rol inexistente; 5xx → genérico", () => {
    expect(resolveAssignUserRoleError({ status: 403 })).toContain("permisos");
    expect(resolveAssignUserRoleError({ status: 404 })).toContain("ya no existen");
    expect(resolveAssignUserRoleError({ status: 500 })).toContain("Error interno");
  });
});

describe("resolveRevokeUserRoleError", () => {
  it("404 → rol ya no asignado; 403 → permisos; 5xx → genérico", () => {
    expect(resolveRevokeUserRoleError({ status: 404 })).toContain(
      "ya no tiene este rol",
    );
    expect(resolveRevokeUserRoleError({ status: 403 })).toContain("permisos");
    expect(resolveRevokeUserRoleError({ status: 500 })).toContain("Error interno");
  });
});

describe("resolvers simples de listado/detalle", () => {
  it("mensajes estables de listado, detalle y roles", () => {
    expect(resolveAdminUsersListError()).toContain("usuarios");
    expect(resolveAdminUserDetailError()).toContain("usuario");
    expect(resolveListAdminRolesError()).toContain("roles");
  });
});