# Frontend — Implementación UI: Notas internas (`internalNotes`)

Implementación lista para copiar/pegar en el repo frontend (Next.js + shadcn + Tailwind + react-hook-form + zod), alineada con la spec UX/UI y con el backend (CareEpisode.internalNotes, workshop-only, D-168/D-175).

## 1) Componente reutilizable — `InternalNotesPrivacyBadge`

Archivo: `src/components/care-episode/internal-notes-privacy-badge.tsx`

```tsx
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InternalNotesPrivacyBadgeProps {
  label?: string;
  className?: string;
}

export function InternalNotesPrivacyBadge({
  label = "Solo tu taller",
  className,
}: InternalNotesPrivacyBadgeProps) {
  return (
    <span
      role="status"
      aria-label="Nota privada del taller"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800",
        "dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
        className,
      )}
    >
      <Lock className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
```

## 2) Snippet de formulario — alta de atención (check-in)

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { InternalNotesPrivacyBadge } from "@/components/care-episode/internal-notes-privacy-badge";

const MAX_INTERNAL_NOTES = 1000;

const checkInSchema = z.object({
  internalNotes: z
    .string()
    .trim()
    .max(MAX_INTERNAL_NOTES, "Las notas internas no pueden superar los 1000 caracteres")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

type CheckInValues = z.infer<typeof checkInSchema>;

export function CheckInFormInternalNotesExample() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: { internalNotes: "" },
  });

  const internalNotesValue = form.watch("internalNotes") ?? "";
  const remaining = MAX_INTERNAL_NOTES - internalNotesValue.length;

  async function onSubmit(values: CheckInValues) {
    setIsSubmitting(true);
    try {
      await fetch("/api/care-episodes/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
    } catch {
      // toast de error + retry
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="internalNotes"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Notas internas del taller</FormLabel>
                <InternalNotesPrivacyBadge />
              </div>

              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Notas internas del taller. Ej.: Tel. alternativo: 11 2233 4455, entrega a las 18 hs."
                  maxLength={MAX_INTERNAL_NOTES}
                  rows={4}
                  disabled={isSubmitting}
                  aria-describedby="internal-notes-helper"
                />
              </FormControl>

              <FormDescription id="internal-notes-helper">
                Solo las ve tu taller. No se comparte con otros talleres ni con el
                propietario del vehículo.
              </FormDescription>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <FormMessage />
                <span className={remaining < 50 ? "text-destructive" : ""}>
                  {internalNotesValue.length}/{MAX_INTERNAL_NOTES}
                </span>
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar atención"}
        </Button>
      </form>
    </Form>
  );
}
```

## 3) Snippet de detalle — bloque colapsable

Archivo: `src/components/care-episode/internal-notes-block.tsx`

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { InternalNotesPrivacyBadge } from "@/components/care-episode/internal-notes-privacy-badge";

export interface CareEpisodeInternalNotesBlockProps {
  notes: string | null;
  defaultOpen?: boolean;
  showEmpty?: boolean;
  className?: string;
}

export function CareEpisodeInternalNotesBlock({
  notes,
  defaultOpen = false,
  showEmpty = false,
  className,
}: CareEpisodeInternalNotesBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!notes && !showEmpty) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-md border", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          Notas internas
          <InternalNotesPrivacyBadge />
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
        {notes && notes.trim().length > 0 ? notes : "Sin notas internas."}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

Uso en el detalle:

```tsx
<CareEpisodeInternalNotesBlock notes={detail.internalNotes} />
```

## 4) Validación Zod

Archivo: `src/lib/validations.ts` (o `src/lib/validations/care-episode.ts`)

```ts
import { z } from "zod";

export const INTERNAL_NOTES_MAX_LENGTH = 1000;

export const internalNotesField = z
  .string()
  .trim()
  .max(
    INTERNAL_NOTES_MAX_LENGTH,
    "Las notas internas no pueden superar los 1000 caracteres",
  )
  .optional()
  .transform((value) =>
    value && value.length > 0 ? value : undefined,
  );

export const checkInSchema = z.object({
  // licensePlate, branchId, mileageIn, customerComplaint, customerNotes, ...
  internalNotes: internalNotesField,
});
```

## 5) Checklist de archivos a tocar

**Nuevos**
- `src/components/care-episode/internal-notes-privacy-badge.tsx`
- `src/components/care-episode/internal-notes-block.tsx`

**Modificar**
- `src/lib/validations.ts` (o `src/lib/validations/care-episode.ts`) — agregar `internalNotesField` / `INTERNAL_NOTES_MAX_LENGTH`
- Formulario de alta de atención (check-in) — integrar el `FormField` de `internalNotes`
- Vista de detalle de atención — renderizar `<CareEpisodeInternalNotesBlock notes={detail.internalNotes} />`
- `src/types/care-episode.ts` (si existe) — asegurar `internalNotes: string | null`

**Verificar**
- El tipo de detalle use `internalNotes: string | null` (backend ya lo proyecta por actor).
- No enviar `internalNotes` en el alta "owner" (el backend lo strippea con `whitelist`).
- No loguear el contenido de `internalNotes` en claro ni incluirlo en eventos.

**Notas de alineación**
- El backend oculta `internalNotes` a talleres ajenos y al propietario (D-168 / D-175); el frontend debe tratar `null` como "no visible / sin notas".
- La convención de texto sugerida es `Tel. alternativo: <número>`; el placeholder ya la incluye.
- El badge usa color ámbar + candado para reforzar la frontera de privacidad (RF-10).
```