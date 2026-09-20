"use client";

/**
 * Wizard público de invitación de concesionaria — /invitations/[token]
 * (feature "Onboarding administrado de concesionaria", decisiones PM cerradas).
 *
 * Ruta plana FUERA de (dashboard) y (auth): pública (no está en protectedRoutes
 * del proxy). El backend envía al dueño el link con el token tras el alta
 * administrada (admin panel → dealership pending_claim + invitación por email).
 *
 * Flujo (contrato backend congelado):
 * 1. Validar el token 1 sola vez (useRef guard, patrón /transfer/qr/[token]):
 *    GET /dealerships/wizard/invitations/:token
 *    - 200 → paso 1: registro completo (requiresRegister=true) o login
 *      (requiresRegister=false).
 *    - INVITATION_INVALID (404) / EXPIRED (400) / USED | CANCELLED (409) →
 *      pantalla de error SIN formulario.
 * 2. Paso 1 registro: recopila firstName/lastName/phone/password (NO llama a
 *    /auth/register). Paso 1 login: /auth/login + refreshSession.
 * 3. Paso 2: completa los datos públicos de la concesionaria; al submit se
 *    ejecuta POST /dealerships/wizard/claim con TODO (cuenta + dealership).
 * 4. Éxito (201) → pantalla de éxito con CTA según membresía de sesión.
 *
 * Estados: validating / invalid / expired / used / cancelled / error /
 * register / login / step-2 / success.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
import { InvitationStepDealership } from "@/components/invitation/invitation-step-dealership";
import { InvitationStepLogin } from "@/components/invitation/invitation-step-login";
import { InvitationStepRegister } from "@/components/invitation/invitation-step-register";
import { InvitationSuccess } from "@/components/invitation/invitation-success";
import { InvitationWizard } from "@/components/invitation/invitation-wizard";
import { useAuth } from "@/hooks/use-auth";
import { authApi, invitationApi } from "@/lib/api";
import {
  invitationErrorKind,
  resolveInvitationClaimErrorMessage,
  resolveWizardLoginErrorMessage,
} from "@/lib/invitation-errors";
import type {
  InvitationClaimPreview,
  InvitationClaimResult,
} from "@/types/invitation";
import type {
  InvitationDealershipValues,
  InvitationRegisterValues,
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

export default function InvitationWizardPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const { user, refreshSession } = useAuth();

  const [phase, setPhase] = useState<WizardPhase>("validating");
  const [preview, setPreview] = useState<InvitationClaimPreview | null>(null);
  const [registerData, setRegisterData] =
    useState<InvitationRegisterValues | null>(null);
  const [claimResult, setClaimResult] =
    useState<InvitationClaimResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  /** Valida el token (GET público). UseRef guard: se ejecuta 1 sola vez. */
  const loadPreview = useCallback(async () => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    setPhase("validating");
    setFormError(null);
    try {
      const data = await invitationApi.getClaimPreview(token);
      setPreview(data);
      setPhase(data.requiresRegister ? "register" : "login");
    } catch (error: unknown) {
      const kind = invitationErrorKind(error);
      if (kind === "invalid") setPhase("invalid");
      else if (kind === "expired") setPhase("expired");
      else if (kind === "used") setPhase("used");
      else if (kind === "cancelled") setPhase("cancelled");
      else setPhase("error");
    }
  }, [token]);

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
   * Paso 2 → POST claim. Para registro viajan TODOS los datos (cuenta +
   * dealership) en el body; para login solo token/email + dealership (la
   * cookie ya autentica). Después intenta refrescar la sesión para decidir el
   * CTA de la pantalla de éxito (membresía de la concesionaria).
   */
  const handleClaim = async (values: InvitationDealershipValues) => {
    if (!token || !preview) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await invitationApi.claim({
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
        dealership: {
          email: values.email.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          website: values.website?.trim() || undefined,
          description: values.description?.trim() || undefined,
        },
      });
      // Best-effort: si el claim seteó cookies (cuenta creada/activada), la
      // sesión queda autenticada y la pantalla de éxito puede mostrar
      // "Ir a mi concesionaria". Si falla, el CTA cae en "Ir al inicio".
      await refreshSession().catch(() => undefined);
      setClaimResult(result);
      setPhase("success");
    } catch (error: unknown) {
      const kind = invitationErrorKind(error);
      if (kind === "invalid") setPhase("invalid");
      else if (kind === "expired") setPhase("expired");
      else if (kind === "used") setPhase("used");
      else if (kind === "cancelled") setPhase("cancelled");
      else setFormError(resolveInvitationClaimErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const isRegisterFlow = phase === "register" || (phase === "step-2" && Boolean(registerData));
  const wizardMode: "register" | "login" = isRegisterFlow ? "register" : "login";
  const hasMembership =
    Boolean(claimResult) &&
    (user?.dealershipMemberships?.some(
      (m) => m.dealershipId === claimResult?.dealership.id,
    ) ??
      false);

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

      {phase === "register" && preview && (
        <InvitationWizard currentStep={1} mode="register">
          <InvitationStepRegister
            email={preview.email}
            submitError={formError}
            onSubmit={handleRegisterNext}
          />
        </InvitationWizard>
      )}

      {phase === "login" && preview && (
        <InvitationWizard currentStep={1} mode="login">
          <InvitationStepLogin
            email={preview.email}
            submitError={formError}
            onSubmit={handleLoginNext}
          />
        </InvitationWizard>
      )}

      {phase === "step-2" && preview && (
        <InvitationWizard currentStep={2} mode={wizardMode}>
          <InvitationStepDealership
            dealershipName={preview.dealership.name}
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

      {phase === "success" && claimResult && (
        <InvitationSuccess
          dealershipId={claimResult.dealership.id}
          dealershipName={claimResult.dealership.name}
          hasMembership={hasMembership}
        />
      )}
    </InvitationLayout>
  );
}