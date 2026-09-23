"use client";

/**
 * Wizard público de invitación — /invitations/[token]
 * (features "Onboarding administrado de concesionaria" y "Onboarding admin
 * de taller" D-106, decisiones PM cerradas).
 *
 * El MISMO endpoint público sirve a ambas entidades: el backend envía al
 * dueño el link con el token tras el alta administrada (admin panel →
 * dealership/workshop pending_claim + invitación por email). Desde D-106 los
 * mails incluyen `?kind=dealership|workshop` (mail.service.ts) → el wizard
 * usa el kind del query param DIRECTAMENTE y elige el preview de la entidad.
 *
 * FALLBACK (URLs viejas / mails anteriores sin kind): PROBE clásico —
 *
 *   GET /dealerships/wizard/invitations/:token (PÚBLICO)
 *   ├─ 200 → kind "dealership"
 *   └─ INVITATION_INVALID (404) → GET /workshops/wizard/invitations/:token
 *        ├─ 200 → kind "workshop"
 *        └─ error → terminal (invalid/expired/used/cancelled/error)
 *
 * El probe se mantiene SOLO como compatibilidad: con `kind` en la URL no se
 * hace ningún request extra (elimina el riesgo conocido de 1 request 404 por
 * visita válida de taller).
 *
 * Flujo (contrato backend congelado):
 * 1. Validar el token 1 sola vez (useRef guard, patrón /transfer/qr/[token]).
 * 2. Paso 1 registro: recopila firstName/lastName/phone/password (NO llama a
 *    /auth/register). Paso 1 login: /auth/login + refreshSession.
 * 3. Paso 2: completa los datos públicos; al submit se ejecuta el POST claim
 *    correspondiente (dealership o workshop, según kind) con TODO el payload.
 * 4. Éxito (201) → pantalla de éxito con CTA según membresía de sesión.
 *
 * Estados: validating / invalid / expired / used / cancelled / error /
 * register / login / step-2 / success.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InvitationError } from "@/components/invitation/invitation-error";
import { InvitationLayout } from "@/components/invitation/invitation-layout";
import { InvitationStepEntity } from "@/components/invitation/invitation-step-entity";
import { InvitationStepLogin } from "@/components/invitation/invitation-step-login";
import { InvitationStepRegister } from "@/components/invitation/invitation-step-register";
import { InvitationStepUserRegister } from "@/components/invitation/invitation-step-user-register";
import { InvitationSuccess } from "@/components/invitation/invitation-success";
import { InvitationWizard } from "@/components/invitation/invitation-wizard";
import { useAuth } from "@/hooks/use-auth";
import { authApi, invitationApi } from "@/lib/api";
import {
  invitationErrorKind,
  resolveInvitationClaimErrorMessage,
  resolveUserWizardClaimErrorMessage,
  resolveWizardLoginErrorMessage,
} from "@/lib/invitation-errors";
import type { InvitationKind } from "@/types/invitation";
import type {
  InvitationEntityValues,
  InvitationRegisterValues,
  UserWizardRegisterValues,
} from "@/lib/invitation-schema";

type WizardPhase =
  | "validating"
  | "invalid"
  | "expired"
  | "used"
  | "cancelled"
  | "error"
  | "register"
  | "login"
  | "step-2"
  | "success";

/** Preview normalizado (dealership y workshop comparten forma). */
interface EntityPreview {
  email: string;
  requiresRegister: boolean;
  entityId: string;
  entityName: string;
}

const TERMINAL_BY_KIND: Record<string, WizardPhase> = {
  invalid: "invalid",
  expired: "expired",
  used: "used",
  cancelled: "cancelled",
};

/** searchParams por defecto (tests / render sin query) — promise resuelta. */
const EMPTY_SEARCH_PARAMS: Promise<
  Record<string, string | string[] | undefined>
> = Promise.resolve({});

export default function InvitationWizardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const { user, refreshSession } = useAuth();

  // Next.js 16: el page prop `searchParams` es una promise (request-time API);
  // en Client Components se resuelve con React `use()` (patrón documentado).
  const query = use(searchParams ?? EMPTY_SEARCH_PARAMS);
  const kindFromUrl: InvitationKind | null =
    query.kind === "dealership" || query.kind === "workshop" || query.kind === "user"
      ? query.kind
      : null;

  const [phase, setPhase] = useState<WizardPhase>("validating");
  const [kind, setKind] = useState<InvitationKind | null>(null);
  const [preview, setPreview] = useState<EntityPreview | null>(null);
  const [registerData, setRegisterData] =
    useState<InvitationRegisterValues | null>(null);
  const [claimResult, setClaimResult] = useState<{
    entityId: string;
    entityName: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  const applyTerminalError = useCallback((error: unknown) => {
    const kind = invitationErrorKind(error);
    const terminal = TERMINAL_BY_KIND[kind];
    setPhase(terminal ?? "error");
  }, []);

  /**
   * Valida el token (GET públicos). UseRef guard: se ejecuta 1 sola vez.
   *
   * Con `kind` en la URL (mails actuales) el preview se resuelve
   * DIRECTAMENTE contra el endpoint de la entidad (sin probe). Sin `kind`
   * (URLs viejas) se mantiene el probe: primero dealership; si 404
   * INVITATION_INVALID → taller.
   */
  const loadPreview = useCallback(async () => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    setPhase("validating");
    setFormError(null);
    try {
      if (kindFromUrl === "user") {
        const data = await invitationApi.getUserWizardPreview(token);
        setKind("user");
        setPreview({
          email: data.email,
          requiresRegister: data.requiresRegister,
          entityId: "",
          entityName: data.email,
        });
        // El claim de usuario SIEMPRE exige firstName/lastName/password (el
        // backend responde 400 VALIDATION_ERROR si faltan), por lo que NO hay
        // rama login para kind=user: requiereRegister=false (cuenta activa) se
        // resuelve en el claim con 409 activa y su mensaje mapeado.
        setPhase("register");
        return;
      }
      if (kindFromUrl === "workshop") {
        const data = await invitationApi.getWorkshopClaimPreview(token);
        setKind("workshop");
        setPreview({
          email: data.email,
          requiresRegister: data.requiresRegister,
          entityId: data.workshop.id,
          entityName: data.workshop.name,
        });
        setPhase(data.requiresRegister ? "register" : "login");
        return;
      }
      const data = await invitationApi.getClaimPreview(token);
      setKind("dealership");
      setPreview({
        email: data.email,
        requiresRegister: data.requiresRegister,
        entityId: data.dealership.id,
        entityName: data.dealership.name,
      });
      setPhase(data.requiresRegister ? "register" : "login");
    } catch (error: unknown) {
      // Con kind explícito en la URL NO hay probe: cualquier error (incluido
      // el 404 INVITATION_INVALID) es terminal para esa entidad.
      if (kindFromUrl) {
        applyTerminalError(error);
        return;
      }
      // Fallback probe (URL sin kind): solo un 404 INVITATION_INVALID habilita
      // el probe de taller: los tokens son UUIDs únicos por invitación y un
      // expirado/usado de concesionaria no puede ser un token válido de taller.
      if (invitationErrorKind(error) === "invalid") {
        try {
          const data = await invitationApi.getWorkshopClaimPreview(token);
          setKind("workshop");
          setPreview({
            email: data.email,
            requiresRegister: data.requiresRegister,
            entityId: data.workshop.id,
            entityName: data.workshop.name,
          });
          setPhase(data.requiresRegister ? "register" : "login");
        } catch (workshopError: unknown) {
          applyTerminalError(workshopError);
        }
        return;
      }
      applyTerminalError(error);
    }
  }, [token, kindFromUrl, applyTerminalError]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadPreview();
  }, [loadPreview]);

  const handleRetry = () => {
    started.current = false;
    void loadPreview();
  };

  /** Paso 1 registro → guarda los datos y avanza al paso 2. */
  const handleRegisterNext = (values: InvitationRegisterValues) => {
    setRegisterData(values);
    setFormError(null);
    setPhase("step-2");
  };

  /**
   * Wizard de USUARIO (kind=user): el registro ES el claim (flujo de 1 solo
   * paso, sin paso de entidad). El body del claim NO lleva email (lo fija la
   * invitación) y solo exige token + firstName/lastname/password.
   */
  const handleUserRegister = async (values: UserWizardRegisterValues) => {
    if (!token) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await invitationApi.claimUser({
        token,
        firstName: values.firstName,
        lastName: values.lastName,
        password: values.password,
      });
      // Best-effort: el claim NO abre sesión automática (contrato backend), el
      // CTA de éxito lleva a /login; refreshSession solo refresca el menú.
      await refreshSession().catch(() => undefined);
      setClaimResult({
        entityId: result.user.id,
        entityName: result.user.email,
      });
      setPhase("success");
    } catch (error: unknown) {
      const kind = invitationErrorKind(error);
      const terminal = TERMINAL_BY_KIND[kind];
      if (terminal) setPhase(terminal);
      else setFormError(resolveUserWizardClaimErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  /** Paso 1 login → /auth/login (cookies) + refreshSession, avanza al paso 2. */
  const handleLoginNext = async (values: { password: string }) => {
    if (!preview) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await authApi.login(preview.email, values.password);
      await refreshSession();
      setPhase("step-2");
    } catch (error: unknown) {
      setFormError(resolveWizardLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Paso 2 → POST claim según `kind`. Para registro viajan TODOS los datos
   * (cuenta + entidad) en el body; para login solo token/email + entidad (la
   * cookie ya autentica). Después intenta refrescar la sesión para decidir el
   * CTA de la pantalla de éxito.
   */
  const handleClaim = async (values: InvitationEntityValues) => {
    if (!token || !preview || !kind) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const data = {
        email: values.email.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        website: values.website?.trim() || undefined,
        description: values.description?.trim() || undefined,
      };
      const result =
        kind === "workshop"
          ? await invitationApi.claimWorkshop({
              token,
              email: preview.email,
              ...(registerData
                ? {
                    firstName: registerData.firstName,
                    lastName: registerData.lastName,
                    phone: registerData.phone,
                    password: registerData.password,
                  }
                : {}),
              workshop: data,
            })
          : await invitationApi.claim({
              token,
              email: preview.email,
              ...(registerData
                ? {
                    firstName: registerData.firstName,
                    lastName: registerData.lastName,
                    phone: registerData.phone,
                    password: registerData.password,
                  }
                : {}),
              dealership: data,
            });
      // Best-effort: si el claim seteó cookies (cuenta creada/activada), la
      // sesión queda autenticada y la pantalla de éxito puede mostrar
      // "Ir a mi concesionaria". Si falla, el CTA cae en "Ir al inicio".
      await refreshSession().catch(() => undefined);
      setClaimResult({
        entityId:
          kind === "workshop"
            ? (result as { workshop: { id: string } }).workshop.id
            : (result as { dealership: { id: string } }).dealership.id,
        entityName:
          kind === "workshop"
            ? (result as { workshop: { name: string } }).workshop.name
            : (result as { dealership: { name: string } }).dealership.name,
      });
      setPhase("success");
    } catch (error: unknown) {
      const kind = invitationErrorKind(error);
      const terminal = TERMINAL_BY_KIND[kind];
      if (terminal) setPhase(terminal);
      else setFormError(resolveInvitationClaimErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const isRegisterFlow =
    phase === "register" || (phase === "step-2" && Boolean(registerData));
  const wizardMode: "register" | "login" = isRegisterFlow ? "register" : "login";

  const hasMembership = Boolean(
    claimResult &&
      kind &&
      (kind === "workshop"
        ? user?.workshopMemberships?.some(
            (m) => m.workshopId === claimResult.entityId,
          )
        : user?.dealershipMemberships?.some(
            (m) => m.dealershipId === claimResult.entityId,
          ) ?? false),
  );

  return (
    <InvitationLayout>
      {phase === "validating" && (
        <Card className="w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
            <CardTitle className="text-lg font-semibold">
              Validando invitación…
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Estamos verificando tu enlace de invitación.
          </CardContent>
        </Card>
      )}

      {(phase === "invalid" ||
        phase === "expired" ||
        phase === "used" ||
        phase === "cancelled" ||
        phase === "error") && (
        <InvitationError
          kind={phase === "error" ? "generic" : phase}
          onRetry={phase === "error" ? handleRetry : undefined}
        />
      )}

      {phase === "register" && preview && kind && kind !== "user" && (
        <InvitationWizard currentStep={1} mode="register" kind={kind}>
          <InvitationStepRegister
            email={preview.email}
            submitError={formError}
            onSubmit={handleRegisterNext}
          />
        </InvitationWizard>
      )}

      {phase === "register" && preview && kind === "user" && (
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-lg font-semibold">
              Creá tu cuenta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Activá tu cuenta de plataforma con los datos de tu invitación.
            </p>
            <InvitationStepUserRegister
              email={preview.email}
              submitError={submitting ? null : formError}
              onSubmit={handleUserRegister}
            />
          </CardContent>
        </Card>
      )}

      {phase === "login" && preview && kind && (
        <InvitationWizard currentStep={1} mode="login" kind={kind}>
          <InvitationStepLogin
            email={preview.email}
            submitError={formError}
            onSubmit={handleLoginNext}
          />
        </InvitationWizard>
      )}

      {phase === "step-2" && preview && kind && (
        <InvitationWizard currentStep={2} mode={wizardMode} kind={kind}>
          <InvitationStepEntity
            kind={kind}
            entityName={preview.entityName}
            defaultEmail={preview.email}
            submitError={submitting ? null : formError}
            onBack={
              registerData
                ? () => {
                    setFormError(null);
                    setPhase("register");
                  }
                : () => {
                    setFormError(null);
                    setPhase("login");
                  }
            }
            onSubmit={handleClaim}
          />
        </InvitationWizard>
      )}

      {phase === "success" && claimResult && kind && (
        <InvitationSuccess
          kind={kind}
          entityId={claimResult.entityId}
          entityName={claimResult.entityName}
          hasMembership={hasMembership}
        />
      )}
    </InvitationLayout>
  );
}