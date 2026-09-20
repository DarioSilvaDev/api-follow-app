"use client";

/**
 * Indicador de Active Context del workspace admin (Platform Workspace).
 *
 * Decisión PM: el super admin tiene UNA sola cuenta; la separación
 * personal/laboral se logra por contexto → la UI debe dejar MUY claro cuándo
 * se está operando en Plataforma.
 *
 * Es un indicador de CONTEXTO DE TRABAJO (no una badge de identidad): NO
 * muestra roles ni nombre de usuario. Se renderiza SOLO dentro de /admin/*
 * (el layout admin lo incluye en su contenido).
 *
 * Estilo discreto: fondo primary/10 + borde izquierdo primary (spec UX
 * aprobada por ux-ui-hcdv).
 */
import { ShieldCheck } from "lucide-react";

export function AdminContextIndicator() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-primary/15 border-l-2 border-l-primary bg-primary/10 px-4 py-3"
    >
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex flex-col">
        <p className="text-sm font-semibold text-foreground">Plataforma</p>
        <p className="text-xs text-muted-foreground">
          Estás administrando la plataforma.
        </p>
      </div>
    </div>
  );
}