import { z } from "zod";

/**
 * Schemas zod del wizard público de invitación (concesionaria Y taller, D-106).
 *
 * WIZARD-REGISTER (paso 1, requiresRegister=true): recopila el registro
 * COMPLETO (incluye teléfono, que /auth/register NO acepta). El email viene
 * pre-cargado y read-only desde la invitación; los datos se envían dentro del
 * POST claim (NO se llama /auth/register — decisión backend congelada).
 *
 * WIZARD-LOGIN (paso 1, requiresRegister=false): email readonly + contraseña.
 *
 * WIZARD-ENTITY (paso 2): el nombre viene pre-cargado (concesionaria editable
 * en pantalla; taller SOLO lectura — el backend no acepta name en el claim);
 * email de contacto, teléfono, website y descripción son los datos públicos.
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

/**
 * Registro del wizard de USUARIO de plataforma (kind=user, D-106).
 *
 * El claim (POST /users/wizard/claim) exige firstName/lastName/password (el
 * backend responde 400 VALIDATION_ERROR si faltan); el email NUNCA viaja en el
 * body (lo fija la invitación) y phone es opcional en el DTO. A diferencia de
 * InvitationRegisterValues, NO se recopila teléfono: solo los campos que pide
 * el claim.
 */
export const userWizardRegisterSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres."),
    lastName: z
      .string()
      .trim()
      .min(2, "El apellido debe tener al menos 2 caracteres."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type UserWizardRegisterValues = z.infer<typeof userWizardRegisterSchema>;

/**
 * Paso 2 del wizard para TALLER (D-106). El nombre NO es editable ni se envía
 * (el backend lo fija en el alta admin — WizardWorkshopDataDto sin name).
 * Completar los contactos públicos es la única parte del paso 2.
 */
export const invitationWorkshopSchema = z.object({
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
    .url("Ingresá una URL válida (ej. https://mitaller.com).")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(500, "La descripción no puede superar los 500 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type InvitationWorkshopValues = z.infer<typeof invitationWorkshopSchema>;

/**
 * Valores del paso 2 compartidos por el wizard (multipropósito por kind).
 * `name` solo está presente en el flujo concesionaria; el claim del taller
 * NO lo envía (el backend lo fija). El componente de paso 2 tipa el form con
 * esta interfaz y el resolver se encastra a la schema del kind.
 */
export interface InvitationEntityValues {
  name?: string;
  email: string;
  phone?: string;
  website?: string;
  description?: string;
}