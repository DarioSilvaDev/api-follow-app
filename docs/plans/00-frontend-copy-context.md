# 00 — Contexto de copy para `/reclamo/[token]` y sus mails

> **Alcance:** insumo para redactar copy es-AR (tono Autentia) de la página pública de reclamo y de los mails del módulo `vehicle-claims`.
> **Fuentes:** `web-follow-app` (frontend) y `api-follow-app` (backend). Todas las citas son `archivo:línea`.
> **Nota:** el diseño ya fija la ruta y los nombres: `web-follow-app/src/app/reclamo/[token]/page.tsx` (`docs/designs/vehicle-claim-technical-design.md:691`) y `link = ${FRONTEND_URL}/reclamo/<token>` (`:483`). El copy está declarado como bloqueante abierto (P-2) en `docs/designs/vehicle-claim-technical-design.md:678`.

## 1. Resumen ejecutivo

- **No existe ninguna implementación de reclamo todavía**: ni ruta `/reclamo` en el frontend (glob `src/app/reclamo/**` → 0 archivos) ni código de `vehicle-claim` en el backend (grep `reclamo|claimToken|claimLink` en `src/` → 0 matches). Todo el copy se escribe desde cero; los precedentes son `/transfer/qr/[token]` y `/invitations/[token]`.
- **Los dos precedentes públicos usan el mismo esqueleto**: `Card` centrada, ícono lucide, título corto, cuerpo en `text-sm text-muted-foreground`, CTA primario a ancho completo y estado de error terminal sin formulario (`src/app/transfer/qr/[token]/page.tsx:423-447`, `src/components/invitation/invitation-error.tsx:34-58`).
- **`/invitations/[token]` es el precedente más rico**: ya resuelve el journey "verifico link → me registro/logueo → confirmo", con stepper de 2 pasos, email read-only y pantalla de éxito (`src/components/invitation/invitation-wizard.tsx:21-124`, `src/components/invitation/invitation-success.tsx:25-85`). Es el molde natural de `/reclamo/[token]`.
- **El login NO tiene Google/OAuth** (grep `google|oauth` en `src` → solo el import de `next/font/google`). Es email + contraseña (`src/app/(auth)/login/page.tsx:100-128`).
- **`?next=` está allowlisteado SOLO para `/transfer/qr/<token>`** (`src/lib/auth-redirect.ts:20`). Para que el reclamo sobreviva al round-trip de registro/login hay que **extender ese patrón**: es un prerrequisito técnico del copy (los textos "Volvé a tu reclamo" no funcionan si el redirect se descarta).
- **El cliente API ya tiene el patrón exacto de endpoint público sin auth**: `api.get(...).json<T>().catch(toApiError)` (`src/lib/api.ts:1193-1238` para `invitationApi`; `:808-813` para `previewTransferQr`). Ojo: `vehicle-claims/public/*` **no** está en las listas de exclusión de contexto ni de refresh 401 (`src/lib/api.ts:146-154`, `:240-247`).
- **Mails: HTML inline en `mail.service.ts`, sin templates ni firma**, con marca "Autentia" en el asunto. Conviven **voseo** (mails nuevos, D-094/D-117) y **tuteo** (mails legacy de auth) — el copy nuevo debe ir en voseo.
- **El panel del taller no tiene hoy ningún lugar para "reclamos"**: las atenciones viven en `/atenciones` y su detalle en `/vehicles/[vehicleId]/servicios/[servicioId]`; el panel de QR de referencia es `src/components/transfer/qr-transfer-panel.tsx`.

---

## 2. Páginas públicas con token (copy literal)

### 2.1 `/transfer/qr/[token]` — `src/app/transfer/qr/[token]/page.tsx`

**Layout:** no tiene `layout.tsx` propio (glob `src/app/transfer/**/*` → solo `page.tsx` + test). Usa `CenteredCard` local: `flex min-h-[60vh] items-center justify-center px-4` + `Card w-full max-w-md` (`:423-447`). En el estado normal: `div.w-full.max-w-md` + `Card` (`:336-419`).

**Estructura del estado normal** (`:336-419`):
- Ícono del propósito + `CardTitle` (`text-xl font-semibold`).
- `CardDescription` = `purposeDescription(...)`.
- Ícono `Car` + nombre del vehículo (`text-lg font-semibold`) + `Patente: {licensePlate}` (`:351-357`).
- Selector (solo `take` autenticado) con label `"Concesionaria que recibe el vehículo"`, opción vacía `"Seleccioná una concesionaria…"` y helper `"Confirmás la recepción en representación de esta concesionaria."` (`:359-383`).
- Error inline en caja roja propia (no `Callout`): `className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"` con `role="alert"` (`:385-392`).
- Footer: `Button` full width + microcopy `text-xs text-muted-foreground` centrado (`:394-417`).

**Copy literal por propósito** (`:82-147`):

| purpose | Título | Descripción | Botón | Footer | Éxito |
|---|---|---|---|---|---|
| `transfer` | `"Transferencia de vehículo"` | `"{@alias o Nombre} te quiere transferir un vehículo presencialmente. Confirmá para aceptarlo."` | `"Aceptar y recibir vehículo"` | `"Al aceptar, el vehículo pasará a estar bajo tu titularidad."` | `"¡Transferencia completada!"` + `"La transferencia se completó con éxito. Ya sos el titular del vehículo."` |
| `take` | `"Recibo del vehículo en consignación"` | `"{user} quiere entregar este vehículo a tu concesionaria. Elegíla y confirmá la recepción en su representación."` | `"Confirmar recepción"` | `"Al confirmar, {concesionaria} asume la responsabilidad del vehículo hasta la venta o devolución."` | `"¡Recepción confirmada!"` + `"El vehículo quedó en consignación en {concesionaria}."` |
| `sale` | `"Compra de vehículo"` | `"La concesionaria {name} te transfiere este vehículo. Confirmá para aceptarlo."` / `"{user} te transfiere el vehículo. Confirmá para aceptarlo."` | `"Aceptar y recibir vehículo"` | (default) | (default) |
| `return` | `"Devolución de vehículo"` | `"La concesionaria {name} te devuelve este vehículo. Confirmá para recuperar la titularidad."` / `"{user} te devuelve este vehículo. Confirmá para recuperar la titularidad."` | `"Aceptar devolución"` | `"Al aceptar, recuperás la titularidad del vehículo."` | `"Recuperaste la titularidad del vehículo."` |

**Estados terminales / de carga (copy literal):**

- Loading (`:290-298`): `"Cargando QR…"` / `"Estamos validando el QR de transferencia."` (ícono `Loader2`).
- Token ausente (`:258-273`): `"QR inválido"` / `"El enlace no contiene un QR válido. Escaneá el QR de transferencia nuevamente."` / CTA `"Ir a transferencias"` (`variant="outline"`).
- Error de preview (`:300-315`): `"No se pudo abrir el QR"` + body dinámico de `resolveQrPreviewErrorMessage` + CTA `"Ir a transferencias"`.
- Mensajes de error del preview (`src/lib/transfer-errors.ts:146-160`):
  - 404 → `"El QR es inválido o ya expiró."`
  - 410 → `"Este QR fue revocado y ya no está vigente."`
  - 409 → `"Este QR ya fue utilizado."`
  - 401/403 → `"Iniciá sesión para aceptar la transferencia."`
  - default → `"No se pudo completar la acción. Intentá nuevamente."` (`:74-75`)
- Falta de concesionaria (`:321-334`): `"Necesitás una concesionaria"` / `"Este QR es una toma de consignación. Para recibirlo, primero tenés que crear o unirte a una concesionaria."` / CTA `"Ver concesionarias"`.
- Error de acción (`:205`, `:239`, `:385-392`): ej. `"Seleccioná la concesionaria que va a recibir el vehículo."`; el resto viene de `resolveQrAcceptErrorMessage` (`src/lib/transfer-errors.ts:162-184`).
- Botón en vuelo (`:405-409`): `Loader2` + `"Aceptando…"`.

**Manejo de auth / `?next=`** (`:188-195`): el preview es público; al confirmar sin sesión hace
`const next = `/transfer/qr/${encodeURIComponent(token)}`; router.replace(`/login?next=${encodeURIComponent(next)}`)`.

**Éxito** (`:275-288`): `CheckCircle2` verde + `"¡Transferencia completada!"` / `"¡Recepción confirmada!"` + CTA `"Ver mis vehículos"` → `/vehicles`.

### 2.2 `/invitations/[token]` — `src/app/invitations/[token]/page.tsx`

**Layout:** sin `layout.tsx` de ruta; usa el componente `InvitationLayout` (`src/components/invitation/invitation-layout.tsx:9-26`):
- `div.flex.min-h-screen.flex-col.items-center.justify-center.bg-muted/30.px-4.py-10`
- Marca linkeada a `/`: `"Autentia"` (`text-xl font-bold tracking-tight`) + `"Historia auténtica de tu vehículo"` (`text-xs text-muted-foreground`)
- Contenedor `w-full max-w-2xl` (más ancho que el `max-w-md` del QR, porque hay formularios de 2 pasos — comentario en `:4-8`).

**Fases** (`:69-79`): `validating / invalid / expired / used / cancelled / error / register / login / step-2 / success`.

**Copy literal por estado:**

- Validando (`:376-390`): `Loader2` + `"Validando invitación…"` / `"Estamos verificando tu enlace de invitación."`
- Terminales (`src/lib/invitation-errors.ts:80-99`):

| kind | Título | Cuerpo |
|---|---|---|
| `invalid` | `"Invitación inválida"` | `"El enlace de invitación es inválido. Verificá que hayas copiado el enlace completo del email que te envió el administrador."` |
| `expired` | `"La invitación venció"` | `"La invitación venció y ya no puede utilizarse. Contactá al administrador de la plataforma para solicitar una nueva."` |
| `used` | `"Invitación ya utilizada"` | `"Esta invitación ya fue utilizada. Si no pudiste completar el trámite, contactá al administrador para que te ayude."` |
| `cancelled` | `"Invitación cancelada"` | `"La invitación fue cancelada por el administrador. Contactá a administración para solicitar una nueva invitación."` |
| `generic` | `"No pudimos validar el enlace"` | `"Ocurrió un error al validar el enlace. Intentá nuevamente y, si el problema persiste, contactá al administrador."` |

- Pantalla terminal (`src/components/invitation/invitation-error.tsx:34-58`): ícono `AlertCircle` en círculo `bg-destructive/10`, `CardTitle text-xl font-semibold`, cuerpo centrado, y CTAs:
  - `generic`: `"Reintentar"` (`variant="outline"`, ícono `RotateCcw`) + `"Volver al inicio"` (`variant="ghost"`).
  - terminales: solo `"Volver al inicio"` (`variant="outline"`), link a `/`.
  - Comentario de producto: **no hay formulario de reenvío**, el reenvío solo existe desde el panel admin (`:16-23`).
- Registro de usuario plataforma (`:413-431`): `"Creá tu cuenta"` / `"Activá tu cuenta de plataforma con los datos de tu invitación."`
- Wizard 2 pasos (`src/components/invitation/invitation-wizard.tsx:33-44`, `:106-119`):
  - Stepper: paso 1 label `"Tu cuenta"`, descripción `"Creá tu cuenta"` o `"Iniciá sesión"`; paso 2 label `"Tu concesionaria"` / `"Tu taller"`, descripción `"Completá los datos"`.
  - `aria-label` del `ol`: `"Progreso del alta de {concesionaria|taller}"`.
  - Título paso 1: `"Creá tu cuenta"` / `"Iniciá sesión"`; descripción: `"Registrá tu cuenta para continuar con el alta de tu {entity}."` / `"Ya tenés una cuenta. Ingresá para continuar con el alta."`
  - Título paso 2: `"Completá los datos de tu {entity}"`; descripción: `"El nombre ya está cargado. Completá el resto del perfil público."`
- Paso registro (`src/components/invitation/invitation-step-register.tsx`): labels con asterisco rojo (`Nombre *`, `Apellido *`, `Email *`, `Teléfono *`, `Contraseña`, `Confirmar contraseña`), placeholders `"Ej. Juan"`, `"Ej. Pérez"`, `"Ej. 11 5555 1234"`, `"Mínimo 8 caracteres"`, `"Repetí tu contraseña"`; helper del email: `"Este email es el de tu invitación y no puede cambiarse acá."` (`:111-113`); CTA `"Continuar"` (`:161-164`).
- Paso login (`src/components/invitation/invitation-step-login.tsx:55-57`, `:75-78`): mismo helper de email read-only; botón `"Ingresando..."` / `"Continuar"`.
- Paso entidad (`src/components/invitation/invitation-step-entity.tsx`): `"Email de contacto *"`, `"Teléfono (opcional)"`, `"Website (opcional)"`, `"Descripción (opcional)"`; placeholders `"contacto@taller.com"`, `"https://mitaller.com"`, `"Contanos sobre tu taller..."` / `"Contanos sobre tu concesionaria..."`; aviso `"Estos datos quedan visibles para tus clientes."` (`:184-186`); botones `"Volver"`, `"Activando..."` / `"Activar taller"` / `"Activar concesionaria"` (`:194-210`). Nombre read-only del taller: `"Tal como lo registró el administrador. No puede modificarse aquí."` (`:85-87`).
- Éxito (`src/components/invitation/invitation-success.tsx:45-81`): `"¡Cuenta activada!"` / `"¡Taller activado!"` / `"¡Concesionaria activada!"`; cuerpo usuario: `"Tu cuenta quedó activa con el rol de plataforma asignado por el administrador. Ya podés iniciar sesión."`; cuerpo entidad: `"Ya sos el propietario de {entityName}. El {taller|concesionaria} quedó {activo|activa} y visible para tus clientes."`; CTAs `"Ir a iniciar sesión"`, `"Ir a mi concesionaria"`, `"Ir al inicio"`.

---

## 3. Páginas de auth y `?next=`

### 3.1 Login — `src/app/(auth)/login/page.tsx`

- Layout de grupo: `div.flex.min-h-screen.items-center.justify-center.bg-muted/30.px-4` (`src/app/(auth)/layout.tsx:6-10`). Card `w-full max-w-md`.
- Título: `"Iniciar sesión"` (`:93`). Subtítulo: `"Ingresa tus credenciales para acceder a tu cuenta."` (`:94-96`) — **tuteo**, a diferencia del resto.
- Campos: `Email` (`placeholder="tu@email.com"`, ícono `Mail`, `autoComplete="email"`) y `PasswordInput label="Contraseña" placeholder="Tu contraseña"` (`:100-128`).
- Validación (zod, `:26-29`): `"Ingresa un email válido"`, `"La contraseña es requerida"`.
- Errores de API (`:76-87`): `401` → `"Email o contraseña incorrectos."`; `429` → `"Demasiados intentos. Intenta más tarde."`; `>=500` → `"Error interno del servidor. Intenta más tarde."`; fallback `error.message || "Error al iniciar sesión."`. Caso especial `:69-71`: `"El login fue aceptado, pero no se pudo recuperar la sesión. Revisá la autenticación y las cookies."`
- CTA: `"Iniciando sesión..."` / `"Iniciar sesión"` (`:137-146`).
- Links: `"¿Olvidaste tu contraseña?"` (`:147-153`); `"¿No tenés una cuenta? Registrate"` (`:154-166`).
- **`?next=`**: se lee con `searchParams.get("next")` y se valida con `isSafeNextPath` (`:42-43`); al éxito `router.replace(resolveSafeNext(rawNext))` (`:75`). El link a registro propaga el next: `/register?next=${encodeURIComponent(safeNext)}` (`:157-161`).
- **Sin login con Google ni ningún OAuth** (grep `google|oauth` en `src` → solo `next/font/google` en `src/app/layout.tsx:2`).

### 3.2 Registro — `src/app/(auth)/register/page.tsx`

- Título `"Crear cuenta"`, subtítulo `"Completa los datos para registrarte en Autentia."` (`:122-127`) — tuteo.
- Campos (`:131-203`): `Nombre` (`placeholder="Tu nombre"`), `Apellido` (`"Tu apellido"`), `Email` (`"tu@email.com"`), `Contraseña` (`"Mínimo 8 caracteres"`), `Confirmar contraseña` (`"Repite tu contraseña"`). **No pide teléfono** (el wizard de invitación sí lo agrega en su paso 1 porque el claim lo exige: `invitation-step-register.tsx:116-134`).
- Validación (`:25-42`): `"El nombre debe tener al menos 2 caracteres"`, `"El apellido debe tener al menos 2 caracteres"`, `"Ingresa un email válido"`, `"La contraseña debe tener al menos 8 caracteres"`, `"Las contraseñas no coinciden"`.
- Errores de API (`:77-92`): `400` → `error.message || "Datos inválidos. Revisa el formulario."`; `409` → `error.message || "Ya existe una cuenta con este email."`; `429` → `"Demasiados intentos. Intenta más tarde."`; `>=500` → `"Error interno del servidor. Intenta más tarde."`; fallback `"Error al crear la cuenta."`
- CTA: `"Creando cuenta..."` / `"Crear cuenta"` (`:212-221`).
- Éxito (`:95-117`): `"Cuenta creada"` + `"Revisa tu email para verificar la cuenta. El enlace de verificación expira en 24 horas."` + CTA `"Ir al inicio de sesión"`. **No redirige solo** y **no autologuea**.
- Footer: `"Ya tenés una cuenta? Iniciá sesión"` (`:222-228`) — voseo, y falta el `¿` de apertura.
- **`?next=`**: se lee y valida (`:51-54`); el `loginHref` lo propaga (`:55-57`). El next **solo sobrevive** a través de los links a login; el alta exitosa no navega con next.

### 3.3 Allowlist de `next` — `src/lib/auth-redirect.ts`

- Patrón actual: `/^\/transfer\/qr\/[A-Za-z0-9._~-]+$/` (`:20`).
- `isSafeNextPath` rechaza absolutos y `//host` (`:26-31`); `resolveSafeNext` cae a `/dashboard` (`:38-43`).
- **Hallazgo para el copy:** hoy `/reclamo/<token>` **no** pasa el allowlist, así que el copy del tipo "después de registrarte volvés a tu reclamo" no se cumpliría sin tocar este archivo (comentario del archivo: "The only deep link that legitimately needs to survive a login round-trip today is the public QR acceptance route", `:5-8`).

---

## 4. Convenciones de UI y manejo de errores

### 4.1 Librería y stack

- **shadcn/ui sobre `@base-ui/react` + Tailwind 4 + `class-variance-authority`** (`web-follow-app/AGENTS.md:117`, `:123-124`; `package.json:14`, `:17`, `:45`). Los componentes viven en `src/components/ui/` (no hay imports de `@radix-ui`).
- Formularios: `react-hook-form` + `zod` (`@hookform/resolvers`), patrón `useForm({ resolver: zodResolver(schema) })` (`src/app/(auth)/login/page.tsx:45-51`).
- **No hay toasts**: la convención explícita es feedback inline con `role="status"` / `role="alert"` (`src/components/ui/callout.tsx:5-17`).

### 4.2 Componentes útiles para el formulario (existen, con uso comprobado)

| Componente | Archivo | Uso de referencia |
|---|---|---|
| `Input` | `src/components/ui/input.tsx` | `src/components/invitation/invitation-step-register.tsx:60-67` |
| `Label` | `src/components/ui/label.tsx` | `src/components/invitation/invitation-step-register.tsx:57-59` |
| `Select` (nativo, con `<option>`) | `src/components/ui/select.tsx` | `src/app/transfer/qr/[token]/page.tsx:364-378` |
| `Callout` (4 variantes: success/warning/info/destructive) | `src/components/ui/callout.tsx:18-36` | `src/components/invitation/invitation-step-login.tsx:69-73` |
| `Card` + `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` | `src/components/ui/card.tsx` | `src/app/transfer/qr/[token]/page.tsx:44-51` |
| `Button` (`default` / `outline` / `ghost`; `size="sm"`) | `src/components/ui/button.tsx` | `src/components/invitation/invitation-error.tsx:46-56` |
| `PasswordInput` | `src/components/ui/password-input.tsx` | `src/app/(auth)/register/page.tsx:187-203` |
| `Textarea` | `src/components/ui/textarea.tsx` | `src/components/invitation/invitation-step-entity.tsx:163-182` |
| `EmptyState` | `src/components/ui/empty-state.tsx:12-40` | `src/app/(dashboard)/atenciones/page.tsx:187-196` |
| `Badge` | `src/components/ui/badge.tsx` | `src/app/(dashboard)/atenciones/page.tsx:217-232` |

**Gap relevante:** **no existe** componente de radio ni `RadioGroup`; grep `type="radio"|RadioGroup` en `src` → 0 matches. El multiple choice de kilometraje (F-3) no tiene precedente visual: habría que crearlo (o resolverlo con `Button` seleccionables) — decisión de UI, no de copy.

### 4.3 Cómo se muestran errores (ejemplos literales)

- **Error de campo** (login): 
```tsx
{errors.email && (
  <p className="text-sm text-destructive" role="alert">
    {errors.email.message}
  </p>
)}
```
(`src/app/(auth)/login/page.tsx:114-118`; en el wizard el mismo patrón con `text-xs`: `src/components/invitation/invitation-step-register.tsx:68-72`).

- **Error de API en formulario** (wizard): `Callout variant="destructive" role="alert"` (`src/components/invitation/invitation-step-register.tsx:155-159`).
- **Error de API en login/register**: `<p className="text-sm text-destructive" role="alert">{serverError}</p>` (`src/app/(auth)/login/page.tsx:130-134`, `src/app/(auth)/register/page.tsx:205-209`).
- **Excepción**: el QR usa una caja roja ad-hoc, no `Callout` (`src/app/transfer/qr/[token]/page.tsx:385-392`) — inconsistencia a no replicar.
- **Regla de producto**: nunca mostrar el mensaje crudo del backend; siempre mapear a copy de UI (`web-follow-app/AGENTS.md:102-103`; `src/lib/invitation-errors.ts:20-23`; `src/lib/transfer-errors.ts:10-13`).

### 4.4 Patrón de "estado terminal"

- Un componente dedicado (`InvitationError`) con ícono `AlertCircle`, título, cuerpo, y **solo dos acciones posibles**: `"Reintentar"` (solo errores genéricos) y `"Volver al inicio"` (`src/components/invitation/invitation-error.tsx:34-58`).
- El copy terminal **siempre dice qué hacer después** ("Contactá al administrador…") y **nunca** ofrece reenviar el link (`:16-23`).
- Precedente QR: mismo esqueleto pero con CTA contextual `"Ir a transferencias"` en lugar de "Volver al inicio" (`src/app/transfer/qr/[token]/page.tsx:300-315`).

---

## 5. Cliente API y tipos

### 5.1 Cliente — `src/lib/api.ts`

- Cliente base `ky.create` con `prefix: NEXT_PUBLIC_API_URL`, `timeout: 10_000`, `credentials: "include"`, `retry` de 401 con refresh (`:188-287`).
- **Endpoint público sin auth** = mismo cliente, sin headers extra, con `encodeURIComponent` en el token y `catch(toApiError)`:
```ts
// src/lib/api.ts:1195-1199
getClaimPreview: (token: string) =>
  api
    .get(`dealerships/wizard/invitations/${encodeURIComponent(token)}`)
    .json<InvitationClaimPreview>()
    .catch(toApiError),
```
  Igual en `previewTransferQr` (`:808-813`).
- **Normalización de errores**: `normalizeErrorBody` + `toApiError` convierten `HTTPError` en `{ status, message?, code? }` (`:303-347`). Ese shape es el que consumen los resolvers (`src/lib/invitation-errors.ts:32-46`).
- **Exclusión de contexto activo**: `isContextFreePath` cubre `auth/*`, `dealerships/wizard/*`, `workshops/wizard/*`, `users/wizard/*`, `admin/*` (`:146-154`).
- **Skip del refresh 401**: lista de endpoints públicos + GET de previews de wizard (`:222-247`).
- **Hallazgo técnico que afecta el copy**: `vehicle-claims/public/*` **no** figura en ninguna de las dos listas. Si el GET de pre-verificación devolviera 401 (o si hay contexto stale), el cliente intentaría refresh y el usuario vería un error distinto al copy terminal. Hay que agregarlo (mismo tratamiento que `wizard/invitations`).
- `authApi` (`:361-418`): `login`, `logout`, `me`, `register`, `verifyEmail`, `forgotPassword`, `resetPassword`, `changePassword`.

### 5.2 Tipos — `src/types/`

- Un archivo por dominio: `auth.ts`, `vehicle.ts`, `workshop.ts`, `dealership.ts`, `care-episode.ts`, `invitation.ts`, `admin.ts`.
- Convención: `interface` sin prefijo `I`, PascalCase, y sufijos por rol: `XxxPreview`, `XxxInput`, `XxxPayload`, `XxxResult`, `XxxListResponse` (`src/types/invitation.ts:27`, `:49`, `:65`, `:82`, `:93`).
- Uniones string para enums de API: `export type InvitationKind = "dealership" | "workshop" | "user";` (`src/types/invitation.ts:24`); `TransferQrPurpose` (`src/types/vehicle.ts:266`).
- Listados con envelope `{ data, meta }`: `VehicleListResponse` (`src/types/vehicle.ts:428`), `CareEpisodeListResponse`.
- El archivo de tipos documenta el contrato del backend en el header (endpoint, códigos de error, notas de contrato): `src/types/invitation.ts:1-21`. **Ese es el formato esperado para `src/types/vehicle-claim.ts`.**
- Diseño ya propone el archivo: `web-follow-app/src/types/vehicle-claim.ts` (`docs/designs/vehicle-claim-technical-design.md:691`).

---

## 6. Panel del taller: ubicación

- **Listado de atenciones (workshop-scoped):** `src/app/(dashboard)/atenciones/page.tsx`. Header `h1 "Atenciones"` + CTA `"Registrar atención"` (`:275-299`); estado sin contexto (`:132-149`); vacío `"Todavía no hay atenciones registradas"` / `"Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá."` (`:184-198`); cada fila linkea al detalle `/vehicles/{vehicleId}/servicios/{id}` (`:206-208`).
- **Detalle de la atención:** `src/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/page.tsx`. Cards: encabezado con título + badges (`:229-248`), metadatos (`:249-307`), `CardTitle "Evidencia"` + `CardDescription "Fotos antes, durante y después del servicio."` (`:310-324`). **Es el lugar natural del panel de reclamo** (post-cierre: generar link, QR, `wa.me`, revocar, aviso "ya tiene titular"), porque el invite nace del cierre (`docs/designs/vehicle-claim-technical-design.md:691`).
- **Navegación:** `src/components/layout/nav-config.ts:68-93` — "Atenciones" **no** es ítem de nav; se llega por quick actions del dashboard (`src/components/dashboard/dashboard-actions.tsx:41-56`: `"Nueva atención"`, `"Atenciones"`, `"Verificaciones"`).
- **Precedente de panel QR (copy y estructura):** `src/components/transfer/qr-transfer-panel.tsx`:
  - Sin vehículo: `Callout` `"Seleccioná primero un vehículo para generar el QR."` (`:213-219`).
  - QR generado: imagen + URL truncada + `"Copiar enlace"` / `"¡Copiado!"` + `"Descargar QR"` (`:230-275`); badge de propósito + countdown o `"Expirado"` (`:277-292`); vencido: `"Este QR ya no es válido. Generá uno nuevo para transferir el vehículo."` (`:294-299`); acciones `"Revocar QR"` / `"Generar nuevo QR"` (`:301-317`).
  - Sin QR: selector + helper + `"Generando…"` / `"Generar QR"` (`:319-382`).
  - Se monta desde `TransferDialog` (`src/components/transfer/transfer-dialog.tsx:355`, `:368`) y desde la exhibición de concesionaria (`src/components/dealership/dealership-exhibition-section.tsx:206`).
- **No existe** hoy: página `/reclamos` ni cola de revisión manual ni listado de invites (glob `src/app/reclamo/**` → 0; grep `reclamo` en el frontend no devuelve rutas). El diseño menciona "cola de revisión manual" y "aviso ya tiene titular" como parte de PR-6, sin ruta definida (`docs/designs/vehicle-claim-technical-design.md:691`, `:616`).
- **Copy ya decidido por producto para el panel** (fuente para el redactor):
  - `"Este vehículo ya tiene titular; no se envió invitación"` (`docs/designs/vehicle-claim-technical-design.md:198`, `:483`, `:616`).
  - `"Juan reclamó su Corolla ABC123"` como aviso pasivo, sin acción requerida (`:298`, `:571`).
  - `"Intento fallido de reclamo en {patente} (intento N)"` (`:570`).
  - `"Reclamo bloqueado: {patente} ya tiene titular"` (`:574`).
  - `"Reclamo a revisar: {patente} (sin dato verificable)"` (`:575`).
  - `"El link de {patente} fue auto-revocado tras 3 bloqueos; generá uno nuevo"` (`:577`).
  - Nota de contacto: "número tomado del contacto del vehículo; para corregirlo, actualizalo en el check-in" (`docs/plans/01-scope-acceptance.md:150`).

---

## 7. Mails: inventario + muestras literales

**Implementación:** todo el HTML está **inline** en `src/common/mail/mail.service.ts`. **No existe carpeta de templates** (glob `src/common/mail/**/*` → `mask-email.ts`, `mail.types.ts`, `mail.service.ts`, `mail.module.ts`, `mail-send-throttle.ts` + specs). Los IDs de plantilla viven en `MAIL_TEMPLATES` (`src/common/mail/mail.types.ts:19-38`).

### 7.1 Inventario de métodos `send*`

| Método | Línea | Template | Asunto literal |
|---|---|---|---|
| `sendVerificationEmail` | `:449` | `email_verification` | `"Verifica tu correo electrónico - Autentia"` |
| `sendPasswordResetEmail` | `:474` | `password_reset` | `"Restablece tu contraseña - Autentia"` |
| `sendPasswordResetCompletedEmail` | `:498` | `password_reset_completed` | `"Tu contraseña ha sido cambiada - Autentia"` |
| `sendWelcomeEmail` | `:517` | `welcome` | `"¡Cuenta activada! - Autentia"` |
| `sendTransferRequestEmail` | `:537` | `transfer_request` | `"Solicitud de transferencia de vehículo - Autentia"` |
| `sendTransferAcceptedEmail` | `:564` | `transfer_accepted` | `"Transferencia completada - Autentia"` |
| `sendTransferQrExpiredEmail` | `:588` | `transfer_qr_expired` | `"Tu QR de transferencia venció - Autentia"` |
| `sendDealershipInvitationEmail` | `:626` | `dealership_invitation` | `` `Completá el alta de ${dealershipName} - Autentia` `` |
| `sendDealershipClaimedEmail` | `:655` | `dealership_claimed` | `` `Tu concesionaria ${dealershipName} quedó activa - Autentia` `` |
| `sendDealershipGroupInvitationEmail` | `:684` | `dealership_group_invitation` | `` `Completá el alta de ${dealershipName} y su taller - Autentia` `` |
| `sendDealershipGroupClaimedEmail` | `:716` | `dealership_group_claimed` | `` `${dealershipName} y su taller quedaron activos - Autentia` `` |
| `sendWorkshopInvitationEmail` | `:751` | `workshop_invitation` | `` `Completá el alta de ${workshopName} - Autentia` `` |
| `sendWorkshopClaimedEmail` | `:780` | `workshop_claimed` | `` `Tu taller ${workshopName} quedó activo - Autentia` `` |
| `sendUserInvitationEmail` | `:809` | `user_invitation` | `` `Te invitamos a Autentia como ${roleName} - Autentia` `` |
| `sendUserRoleAssignedEmail` | `:838` | `user_role_assigned` | `` `Tu rol en Autentia es ${roleName} - Autentia` `` |

### 7.2 Muestras literales

**A) `sendTransferRequestEmail` (`:537-562`) — mail legacy, tuteo, link pelado, datos del vehículo en el cuerpo:**

```
subject: "Solicitud de transferencia de vehículo - Autentia"

<h2>Solicitud de Transferencia</h2>
<p>Hola ${toFirstName},</p>
<p><strong>${fromFirstName}</strong> te ha enviado una solicitud para transferirte el vehículo:</p>
<p><strong>${vehicleName}</strong> (Patente: ${licensePlate})</p>
<p>Ingresa a la aplicación para aceptar o rechazar esta solicitud.</p>
<p><a href="${appUrl}/vehiculos/transferencias">Ir a Transferencias</a></p>
```
(`:550-558`). **Ojo:** el link apunta a `/vehiculos/transferencias`, pero la ruta real del frontend es `/transferencias` (`src/components/layout/nav-config.ts:81`) — bug de copy/link a no replicar.

**B) `sendTransferQrExpiredEmail` (`:588-612`) — mail migrado a voseo (D-094), link pelado, "Autentia" en el cuerpo:**

```
subject: "Tu QR de transferencia venció - Autentia"

<h2>Tu QR de transferencia venció</h2>
<p>Hola ${toFirstName},</p>
<p>Tu QR de transferencia para el vehículo <strong>${vehicleName}</strong> (patente ${licensePlate}) venció.</p>
<p>Si todavía querés transferir el vehículo, generá uno nuevo desde el vehículo.</p>
<p><a href="${appUrl}/vehicles">Ir a Mis Vehículos</a></p>
```
(`:601-608`; comentario de decisión en `:600`).

**C) `sendWorkshopInvitationEmail` (`:751-774`) — mail nuevo (D-117), voseo, CTA con botón inline, expiración explícita, justificación del envío:**

```
subject: `Completá el alta de ${workshopName} - Autentia`

<h2>Completá el alta de ${workshopName}</h2>
<p>Te invitamos a completar el alta del taller <strong>${workshopName}</strong> en Autentia.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
<p>Este enlace expira en 7 días.</p>
<p>Recibís este email porque un administrador registró <strong>${workshopName}</strong> en Autentia.</p>
```
(`:763-770`). Link: `${FRONTEND_URL}/invitations/${token}?kind=workshop` (`:758`).

### 7.3 Observaciones estructurales sobre los mails

- **HTML inline**, sin layout compartido, sin `<html>`/`<body>`, sin CSS embebido salvo el botón (`:642`, `:702`, `:732`, `:767`, `:825`).
- **Sin firma ni footer** ("Equipo de Autentia", dirección, unsubscribe): no existe en ninguno de los 15 métodos.
- **CTA:** legacy = link pelado (`:466`, `:489`, `:557`, `:607`); nuevo (invitaciones) = botón `background:#2563eb` con texto imperativo ("Completar el alta", "Ir a mi concesionaria", "Ir a mi taller") (`:642`, `:702`, `:732`, `:767`, `:825`).
- **Datos del vehículo en el asunto:** **no aparecen nunca**. El asunto lleva entidad (`dealershipName`, `workshopName`), rol o el hecho ("Transferencia completada"). El vehículo (nombre + patente) aparece solo en el cuerpo (`:555`, `:580`, `:605`).
- **Sufijo de marca:** todos los asuntos terminan en `" - Autentia"`; el cuerpo usa "Autentia" en mails nuevos y "la aplicación"/"la plataforma" en legacy (`:556`, `:581`).
- **Saludo:** `"Hola ${firstName},"` en los mails personales (`:529`, `:553`, `:604`); las invitaciones **no** saludan (arrancan con `<h2>`).
- **Voseo vs tuteo:** legacy auth en tuteo (`"Verifica"`, `"Restablece"`, `"Has solicitado"`, `"puedes ignorar"` — `:462-491`); QR vencido e invitaciones en voseo (`"venció… generá"`, `"Completá"`, `"Recibís"`, `"Ya podés"` — `:601-607`, `:638-644`). El propio código lo declara: `// D-094: copy voseo consistente con el frontend` (`:600`).
- **Marca en subject de invitación:** `"Completá el alta de X"` (imperativo + objeto), no "Invitación a X".

---

## 8. Guía de tono observada

**Regla dura del repo:** "Microcopy en **voseo rioplatense** ('Escaneá', 'Confirmá', 'Podés', 'Recuperás')" (`web-follow-app/AGENTS.md:101`). Los textos en tuteo que quedan (login, register, mails de auth) son deuda legacy, no modelo.

- **Persona y tratamiento:** voseo, segunda persona singular, sin "usted". Imperativos voseo: `Confirmá`, `Generá`, `Completá`, `Revisá`, `Escaneá`, `Contactá`, `Ingresá`, `Elegíla`, `Volvé`, `Intentá`. Se acepta el posesivo "tu/tus" (`tu vehículo`, `tus clientes`).
- **Longitud de títulos:** 2-6 palabras. `CardTitle` de estado normal `text-xl font-semibold`; estados terminales 3-4 palabras (`"QR inválido"`, `"La invitación venció"`, `"Invitación ya utilizada"`). Éxito con signos: `"¡Transferencia completada!"`, `"¡Taller activado!"`.
- **Mayúsculas:** sentence case en todo (`"Recibo del vehículo en consignación"`, `"No se pudo abrir el QR"`). Excepción heredada: `"Solicitud de Transferencia"` en mail legacy (`mail.service.ts:552`) — no imitar.
- **Emojis:** **no** en UI ni en mails. Sí íconos lucide (`AlertCircle`, `CheckCircle2`, `Loader2`, `QrCode`, `Car`, `ShieldCheck`) como señal visual, siempre decorativos.
- **Puntuación:** elipsis tipográfica `…` en estados de carga (`"Cargando QR…"`, `"Validando invitación…"`, `"Generando…"`, `"Aceptando…"`); en botones de auth se usa `...` de tres puntos (`"Iniciando sesión..."`, `"Creando cuenta..."`) — inconsistencia existente. Signos de apertura `¿`/`¡` presentes salvo el bug `"Ya tenés una cuenta? Iniciá sesión"` (`register/page.tsx:227`).
- **Nombre del producto:** "Autentia" (nunca "HCDV" ni "Historia Clínica Digital Vehicular" en UI pública). Tagline fija: `"Historia auténtica de tu vehículo"` (`src/app/layout.tsx:18`, `src/components/invitation/invitation-layout.tsx:19-21`). En mails, "Autentia" en el asunto con sufijo ` - Autentia`.
- **Cómo se pide una acción:** un solo CTA primario a ancho completo; el verbo primero y concreto (`"Aceptar y recibir vehículo"`, `"Ver mis vehículos"`, `"Completar el alta"`, `"Registrar atención"`). Secundarias en `variant="outline"`/`ghost` (`"Volver al inicio"`, `"Reintentar"`, `"Ir a transferencias"`).
- **Errores:** (1) nunca el mensaje crudo del backend; (2) decir qué pasó + qué hacer; (3) si es terminal, ofrecer contacto humano o una salida (`"Contactá al administrador de la plataforma para solicitar una nueva."`); (4) anti-enumeración: un solo mensaje para causas distintas (`docs/designs/vehicle-claim-technical-design.md:159`).
- **Cómo se nombra el vehículo:** `nombre` + `(Patente: ABC123)` en cuerpo de mail; en UI `Patente: {licensePlate}` en línea aparte (`transfer/qr/[token]/page.tsx:354-356`). En panel: `{patente} {marca} {modelo}` con fallback de 3 niveles `version → brandName/modelName → patente` (`docs/designs/vehicle-claim-technical-design.md:42`, `:416`).
- **Confirmaciones:** no hay toasts; el resultado exitoso se muestra con `Callout variant="success"` o pantalla de éxito con `CheckCircle2`. En acciones destructivas/irreversibles se usa confirmación explícita (`"Al aceptar, el vehículo pasará a estar bajo tu titularidad."` como microcopy bajo el botón, `transfer/qr/[token]/page.tsx:132`).
- **Términos del dominio en UI:** `Atención` (nunca "CareEpisode"), `Taller`, `Concesionaria`, `Titular`, `Historial` (`web-follow-app/AGENTS.md:88-93`).

---

## 9. Rutas de archivo propuestas (basadas en precedentes reales)

| Qué | Ruta propuesta | Precedente real |
|---|---|---|
| Página pública | `src/app/reclamo/[token]/page.tsx` | `src/app/transfer/qr/[token]/page.tsx`, `src/app/invitations/[token]/page.tsx` (ambas fuera de `(dashboard)`, `"use client"`, `useParams`) |
| Shell/branding | `src/components/vehicle-claim/claim-layout.tsx` | `src/components/invitation/invitation-layout.tsx:9-26` |
| Wizard de verificación (paso patente → factor → cuenta → commit) | `src/components/vehicle-claim/claim-wizard.tsx` (+ `claim-step-plate.tsx`, `claim-step-factor.tsx`, `claim-step-success.tsx`) | `src/components/invitation/invitation-wizard.tsx`, `invitation-step-*.tsx` |
| Estado terminal (vencido / revocado / reclamado / bloqueado / revisión) | `src/components/vehicle-claim/claim-error.tsx` | `src/components/invitation/invitation-error.tsx:34-58` |
| Copy de estados + mapeo de errores | `src/lib/vehicle-claim-errors.ts` | `src/lib/invitation-errors.ts:80-99` (títulos/cuerpos) y `:136-172` (resolvers) |
| Esquemas zod del formulario | `src/lib/vehicle-claim-schema.ts` | `src/lib/invitation-schema.ts` (usado en `invitation-step-register.tsx:19-22`) |
| Tipos | `src/types/vehicle-claim.ts` | `src/types/invitation.ts`; ya previsto en `docs/designs/vehicle-claim-technical-design.md:691` |
| Cliente API | `vehicleClaimApi` dentro de `src/lib/api.ts` | `invitationApi` (`src/lib/api.ts:1193-1238`), `previewTransferQr` (`:808-813`) |
| Panel del taller (generar/QR/wa.me/revocar/aviso) | `src/components/vehicle-claim/claim-invite-panel.tsx`, montado en `src/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/page.tsx` (después de `"Evidencia"`, `:310-324`) | `src/components/transfer/qr-transfer-panel.tsx` montado en `transfer-dialog.tsx:355` |
| Listado/cola de reclamos (si se implementa) | `src/app/(dashboard)/reclamos/page.tsx` — **no existe hoy, ruta no definida en el diseño** | `src/app/(dashboard)/atenciones/page.tsx` (header + `EmptyState` + paginación) |
| Extensión de `?next=` | `src/lib/auth-redirect.ts` (agregar `/reclamo/<token>` al patrón) | `src/lib/auth-redirect.ts:20` |
| Exclusión de contexto/refresh para el endpoint público | `src/lib/api.ts:146-154` y `:240-247` | tratamiento de `*/wizard/invitations` |
| Mails | `src/common/mail/mail.service.ts` (métodos `sendVehicleClaim*`) + IDs nuevos en `MAIL_TEMPLATES` | `src/common/mail/mail.service.ts:751-774`, `src/common/mail/mail.types.ts:19-38` |

**Pendiente explícito de producto (no inventar):** los 4 mails del módulo, sus asuntos exactos y el copy del panel siguen marcados como bloqueantes de contenido (P-2) en `docs/designs/vehicle-claim-technical-design.md:678`, y la decisión de distinguir estados terminales (`expired` / `revoked` / `claimed`) está recomendada pero abierta en `docs/plans/01-scope-acceptance.md:159-164`.
