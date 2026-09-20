import { z } from "zod";

/**
 * Schemas zod del wizard público de invitación de concesionaria.
 *
 * WIZARD-REGISTER (paso 1, requiresRegister=true): recopila el registro
 * COMPLETO (incluye teléfono, que /auth/register NO acepta). El email viene
 * pre-cargado y read-only desde la invitación; los datos se envían dentro del
 * POST claim (NO se llama /auth/register — decisión backend congelada).
 *
 * WIZARD-LOGIN (paso 1, requiresRegister=false): email readonly + contraseña.
 *
 * WIZARD-DEALERSHIP (paso 2): el nombre viene pre-cargado; email de contacto,
 * teléfono, website y descripción son los datos públicos de la concesionaria.
 */

export const invitationRegisterSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres."),
    lastName: z
      .string()
      .trim()
      .min(2, "El apellido debe tener al menos 2 caracteres."),
    email: z.string().trim().email("Ingresá un email válido."),
    phone: z
      .string()
      .trim()
      .min(6, "Ingresá un teléfono de contacto.")
      .max(30, "El teléfono no puede superar los 30 caracteres."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const invitationLoginSchema = z.object({
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export const invitationDealershipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de la concesionaria.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  email: z
    .string()
    .trim()
    .email("Ingresá un email de contacto válido."),
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono no puede superar los 30 caracteres.")
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Ingresá una URL válida (ej. https://miagencia.com).")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(500, "La descripción no puede superar los 500 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type InvitationRegisterValues = z.infer<typeof invitationRegisterSchema>;
export type InvitationLoginValues = z.infer<typeof invitationLoginSchema>;
export type InvitationDealershipValues = z.infer<
  typeof invitationDealershipSchema
>;