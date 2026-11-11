# Copy de P-2 — Página pública de reclamo, panel del taller y mails

> **Estado:** ✅ **aprobado por el fundador el 2026-11-01** (P-2 cerrado). Es la fuente de verdad del copy para C-4, F-1 y F-2.
> **Fecha:** 2026-11-01
> **Base:** `docs/plans/00-frontend-copy-context.md` (precedentes y tono observado), `docs/designs/vehicle-claim-technical-design.md` §5 y §7 (contratos y notificaciones), `docs/specs/workshop-checkin-flow.md` §6.3.
> **Alcance:** todo el texto visible de `/reclamo/[token]`, del panel de reclamo en el detalle de la atención y de los mails del módulo. **No** define endpoints ni modelos.

---

## 0. Reglas de redacción (obligatorias)

1. **Voseo rioplatense.** `Reclamá`, `Verificá`, `Elegí`, `Contactá`, `Pedile`, `Probá`. Nunca `tú`, `usted`, `ingresa`, `verifica`.
2. **Sentence case.** Sólo la primera palabra y los nombres propios en mayúscula.
3. **Sin emojis, sin firma, sin footer** en mails.
4. **Elipsis tipográfica `…`** en estados de carga (`Verificando…`, `Generando…`). En botones de auth se mantiene `...` por consistencia con lo existente.
5. **Un solo CTA primario** por pantalla, a ancho completo. Las secundarias van en `outline` o `ghost`.
6. **Nunca el mensaje crudo del backend.** Todo error se mapea a copy de UI.
7. **Nunca revelar datos del vehículo antes de verificar.** Ni patente, ni marca, ni taller, ni kilometraje, ni nombre del titular. El título y el subtítulo son **estáticos**.
8. **Anti-enumeración:** un único mensaje para cualquier fallo de verificación (patente inexistente, patente ajena, VIN mal, rango mal, factor faltante).
9. **Asuntos de mail:** terminan en `" - Autentia"`. La patente puede figurar en el asunto de los mails transaccionales de reclamo (§3.2–§3.4), que se envían sólo después de un intento o de un reclamo. Nunca se usa en pantallas públicas previas a la verificación.
10. **El mail nunca lleva el link de reclamo.** El link viaja por WhatsApp manual o QR en mostrador (F-11 abierta: si se aprueba, excepción sólo para el dueño con cuenta).

---

## 1. Página pública `/reclamo/[token]`

### 1.1 Shell

| Elemento | Copy |
|---|---|
| Marca | `Autentia` |
| Tagline | `Historia auténtica de tu vehículo` |
| Ancho | `max-w-2xl` (hay formulario de varios pasos, como `/invitations/[token]`) |
| `aria-label` del contenedor de progreso | `Progreso del reclamo del vehículo` |

**Stepper (3 pasos, sólo visible desde el paso 2):**

| Paso | Label | Descripción |
|---|---|---|
| 1 | `Tu vehículo` | `Verificá los datos` |
| 2 | `Tu cuenta` | `Creá tu cuenta` / `Iniciá sesión` |
| 3 | `Tu historial` | `Reclamá el historial` |

---

### 1.2 Estado de carga

**Ícono:** `Loader2` girando.

| Elemento | Copy |
|---|---|
| Título | `Abriendo tu reclamo…` |
| Cuerpo | `Estamos verificando el link que te envió el taller.` |

`aria-live="polite"`.

---

### 1.3 Paso 1 — Patente

**Ícono:** `Car`.

| Elemento | Copy |
|---|---|
| Título | `Reclamá tu vehículo` |
| Subtítulo | `Verificá que el vehículo es tuyo y accedé a su historial de atenciones en Autentia.` |
| Label del campo | `Patente` |
| Placeholder | `Ej. AB123CD` |
| Helper | `La encontrás en la cédula verde o en la patente del vehículo.` |
| CTA | `Continuar` |
| CTA en vuelo | `Verificando…` |
| Microcopy bajo el botón | `Si no reconocés este vehículo, no continúes.` |

**Validación del campo (cliente y servidor):**

| Caso | Copy |
|---|---|
| Vacío | `Ingresá la patente del vehículo.` |
| Formato inválido | `La patente no tiene un formato válido. Revisala e intentá de nuevo.` |

**Error de red genérico:** `No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.`

---

### 1.4 Paso 2a — Verificación por VIN

Se muestra **sólo** si el vehículo tiene VIN registrado. El frontend no sabe de antemano cuál de los dos factores toca: la respuesta del `challenge` lo determina.

| Elemento | Copy |
|---|---|
| Título | `Verificá el vehículo` |
| Subtítulo | `Necesitamos un dato que sólo figure en tus documentos.` |
| Label | `Últimos 4 del VIN` |
| Placeholder | `Ej. 1234` |
| Helper | `El VIN está en la cédula verde y en el parabrisas. Ingresá los últimos 4 caracteres.` |
| CTA | `Verificar` |
| CTA en vuelo | `Verificando…` |
| Link secundario | `Volver` |

**Validación:**

| Caso | Copy |
|---|---|
| Vacío | `Ingresá los últimos 4 caracteres del VIN.` |
| No son 4 | `El VIN tiene que tener 4 caracteres.` |

---

### 1.5 Paso 2b — Multiple choice de kilometraje

Se muestra **sólo** si el vehículo **no** tiene VIN y hay odómetro de la última atención.

| Elemento | Copy |
|---|---|
| Título | `¿Cuántos kilómetros tenía el vehículo?` |
| Subtítulo | `Elegí el rango que más se acerque al kilometraje que figuraba cuando lo llevaste al taller.` |
| `aria-label` del grupo | `Rangos de kilometraje` |
| Opción "no sé" | `No lo sé` |
| Helper bajo el grupo | `Si no estás seguro, elegí "No lo sé". Un especialista va a revisar tu reclamo.` |
| CTA | `Verificar` |
| CTA en vuelo | `Verificando…` |
| Link secundario | `Volver` |

**Validación:**

| Caso | Copy |
|---|---|
| Sin selección | `Elegí un rango o la opción "No lo sé".` |

**Nota de UI (no copy):** no existe componente de radio en el frontend. Se resuelve con botones seleccionables (`Button` con `variant` alternada + `aria-pressed`), no con un `<select>`, para que las opciones se lean enteras.

---

### 1.6 Error de verificación (único)

**Caja:** `Callout variant="destructive"`, `role="alert"`.

| Elemento | Copy |
|---|---|
| Mensaje | `No pudimos verificar los datos del vehículo. Revisá la patente y los datos ingresados.` |
| Acción | `Volver a intentar` |

Este texto es **idéntico** para todos los fallos. No se agrega ningún detalle.

---

### 1.7 Estado bloqueado por intentos

Se muestra cuando el backend responde el mensaje de lock.

| Elemento | Copy |
|---|---|
| Ícono | `Lock` |
| Título | `Demasiados intentos` |
| Cuerpo | `Por seguridad, bloqueamos la verificación por 30 minutos. Podés volver a intentar más tarde o contactar al taller.` |
| CTA | `Volver al inicio` |

**Prohibido:** decir cuántos intentos quedan, cuántos fallaron o si la patente existe.

---

### 1.8 Paso 3 — Cuenta

Se llega acá **después** de verificar. El backend devuelve un ticket de 20 minutos; el frontend lo guarda en memoria (no en `localStorage`).

| Situación | Título | Subtítulo | CTA |
|---|---|---|---|
| Sin cuenta | `Creá tu cuenta` | `Verificamos que el vehículo es tuyo. Creá tu cuenta para reclamar el historial.` | `Crear cuenta y reclamar` |
| Con cuenta | `Iniciá sesión` | `Ya verificamos el vehículo. Ingresá para reclamar el historial.` | `Ingresar y reclamar` |

**Aviso antes de redirigir:**

> `Te llevamos a crear tu cuenta. Cuando termines, volvés acá automáticamente.`

**Microcopy bajo el CTA:** `Tus datos se usan sólo para vincular el historial a tu nombre.`

**Requisito técnico asociado:** el redirect usa `?next=/reclamo/<token>`. Hoy `src/lib/auth-redirect.ts` **no** lo permite; sin ese cambio este copy es falso.

---

### 1.9 Éxito

**Ícono:** `CheckCircle2` en verde.

| Elemento | Copy |
|---|---|
| Título | `¡Vehículo reclamado!` |
| Cuerpo | `El historial de {patente} ya está a tu nombre. Podés consultarlo cuando quieras desde Mis vehículos.` |
| CTA primario | `Ver el historial` → `/vehicles/{vehicleId}/servicios` |
| CTA secundario | `Ir al inicio` |

> `{patente}` se recién conoce **después** del commit. Es el primer momento en que la UI puede mostrar datos del vehículo.

---

### 1.10 Revisión manual

| Elemento | Copy |
|---|---|
| Ícono | `Clock` |
| Título | `Tu reclamo está en revisión` |
| Cuerpo | `Recibimos tu reclamo y un especialista va a revisarlo. Te avisamos por email cuando esté listo.` |
| Microcopy | `Si necesitás ayuda, contactá al taller donde hiciste la última atención.` |
| CTA | `Volver al inicio` |

**Prohibido:** prometer un plazo exacto.

---

### 1.11 Estados terminales

Todos usan el mismo componente (`ClaimError`): ícono `AlertCircle` en círculo `bg-destructive/10`, título `text-xl font-semibold`, cuerpo centrado y CTAs.

| Estado del backend | Título | Cuerpo | CTAs |
|---|---|---|---|
| `expired` | `El link venció` | `Este link ya no está vigente. Pedile al taller que te genere uno nuevo.` | `Volver al inicio` (outline) |
| `revoked` | `El link fue revocado` | `El taller o Autentia revocó este link. Contactá al taller para solicitar uno nuevo.` | `Volver al inicio` (outline) |
| `claimed` | `Este vehículo ya fue reclamado` | `El historial de este vehículo ya está a nombre de otra persona. Si creés que es un error, contactá al taller.` | `Volver al inicio` (outline) |
| `claim_blocked` | `No pudimos completar el reclamo` | `El vehículo ya tiene un titular registrado. Si creés que es un error, contactá al taller.` | `Volver al inicio` (outline) |
| Token inexistente (404) | `El link no es válido` | `Revisá que hayas abierto el link completo que te envió el taller.` | `Volver al inicio` (outline) |
| Error genérico | `No pudimos abrir el link` | `Ocurrió un error al validar el link. Probá de nuevo en unos minutos.` | `Reintentar` (outline, ícono `RotateCcw`) + `Volver al inicio` (ghost) |
| Ticket vencido (20 min) | `Volvé a verificar` | `Pasaron más de 20 minutos desde que verificaste el vehículo. Verificá de nuevo para continuar.` | `Verificar de nuevo` (default) |

**Nota:** `claim_blocked` y `claimed` no revelan nombre, email ni fecha del titular.

---

## 2. Panel del taller

**Ubicación:** detalle de la atención, `web-follow-app/src/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/page.tsx`, como card después de `Evidencia`.

**Título de la card:** `Reclamo del vehículo`
**Descripción:** `Generá un link para que el dueño reclame el historial de este vehículo.`

### 2.1 Sin invite

| Elemento | Copy |
|---|---|
| Cuerpo | `Este vehículo todavía no tiene un link de reclamo.` |
| Helper | `El dueño va a poder ver el historial completo después de verificar que el vehículo es suyo.` |
| CTA | `Generar link de reclamo` |
| CTA en vuelo | `Generando…` |

### 2.2 Invite recién generado (link visible una sola vez)

| Elemento | Copy |
|---|---|
| `Callout` de advertencia | `Guardá o compartí el link ahora. Por seguridad, no se vuelve a mostrar.` |
| Campo link | (link truncado, botón `Copiar enlace` / `¡Copiado!`) |
| CTA WhatsApp | `Enviar por WhatsApp` |
| CTA QR | `Descargar QR` |
| Microcopy | `Si perdés el link, podés revocarlo y generar uno nuevo.` |

**Texto prellenado de WhatsApp:**

> `Hola, tu vehículo {patente} ya tiene historial en Autentia. Podés reclamarlo acá: {link}`

**Nota:** el `wa.me` se arma **sólo** desde `phoneE164`. Si no hay teléfono, el botón no se muestra y queda el QR.

### 2.3 Invite vigente (re-display)

| Elemento | Copy |
|---|---|
| Badge | `Vigente` |
| Detalle | `Vence el {fecha}.` |
| Acciones | `Descargar QR` · `Revocar link` |
| Microcopy | `Por seguridad, el link no se vuelve a mostrar. Compartí el QR o revocá el link para generar uno nuevo.` |

### 2.4 Invite vencido

| Elemento | Copy |
|---|---|
| Badge | `Vencido` |
| Cuerpo | `El link venció y el dueño ya no puede usarlo.` |
| CTA | `Generar link nuevo` |

### 2.5 Invite revocado

| Elemento | Copy |
|---|---|
| Badge | `Revocado` |
| Cuerpo | `Este link ya no funciona.` |
| CTA | `Generar link nuevo` |

### 2.6 Vehículo con titular

| Elemento | Copy |
|---|---|
| `Callout` informativo | `Este vehículo ya tiene titular; no se envió invitación.` |
| Helper | `Si el titular cambió, primero tenés que resolver la titularidad desde el vehículo.` |

### 2.7 Reclamo completado

| Elemento | Copy |
|---|---|
| Badge | `Reclamado` |
| Cuerpo | `{Nombre} reclamó el vehículo {patente}.` |
| Microcopy | `No necesitás hacer nada. Si el reclamo no corresponde, podés revocarlo.` |
| CTA | `Revocar reclamo` |
| CTA en vuelo | `Revocando…` |

### 2.8 Revisión manual

| Elemento | Copy |
|---|---|
| Badge | `A revisar` |
| Cuerpo | `{Nombre} reclamó el vehículo, pero no pudimos verificarlo automáticamente.` |
| Detalle | `Cuenta: {email}` |
| CTA primario | `Aprobar reclamo` |
| CTA secundario | `Rechazar` |
| Microcopy | `Aprobá sólo si reconocés al dueño. Si no, rechazá el reclamo.` |

### 2.9 Reclamo bloqueado

| Elemento | Copy |
|---|---|
| Badge | `Bloqueado` |
| Cuerpo | `Alguien intentó reclamar el vehículo {patente}, pero ya tiene titular.` |
| Microcopy | `No necesitás hacer nada.` |

### 2.10 Link auto-revocado

| Elemento | Copy |
|---|---|
| Badge | `Revocado automáticamente` |
| Cuerpo | `El link se revocó después de 3 bloqueos de verificación.` |
| Helper | `Si el dueño todavía necesita reclamar, generá un link nuevo y entregalo en persona.` |
| CTA | `Generar link nuevo` |

### 2.11 Diálogo de confirmación de revocación

| Elemento | Copy |
|---|---|
| Título | `¿Revocar el link de reclamo?` |
| Cuerpo | `El link va a dejar de funcionar. Si el dueño todavía no reclamó, vas a tener que generar uno nuevo.` |
| CTA primario (destructivo) | `Revocar link` |
| CTA secundario | `Cancelar` |

### 2.12 Confirmación de aprobación

| Elemento | Copy |
|---|---|
| Título | `¿Aprobar el reclamo?` |
| Cuerpo | `El vehículo va a quedar a nombre de {nombre}. Esta acción se puede revertir revocando el reclamo.` |
| CTA primario | `Aprobar reclamo` |
| CTA secundario | `Cancelar` |

### 2.13 Confirmación de rechazo

| Elemento | Copy |
|---|---|
| Título | `¿Rechazar el reclamo?` |
| Cuerpo | `El link va a dejar de funcionar y el vehículo va a quedar sin reclamar.` |
| CTA primario (destructivo) | `Rechazar reclamo` |
| CTA secundario | `Cancelar` |

### 2.14 Errores del panel

| Caso | Copy |
|---|---|
| Sin permiso | `No tenés permiso para gestionar reclamos en este taller.` |
| Atención de otro taller | `No pudimos encontrar este reclamo.` |
| Error de red | `No pudimos completar la acción. Intentá de nuevo.` |
| QR no disponible | `No pudimos cargar el QR. Generá un link nuevo o intentá de nuevo en unos minutos.` |
| Aprobar sin cuenta vinculada | `Todavía no hay una cuenta vinculada a este reclamo.` |
| Revocar un reclamo en revisión | `Este reclamo está en revisión manual. Para rechazarlo, usá Rechazar.` |

---

## 3. Mails

**Implementación:** HTML inline en `src/common/mail/mail.service.ts`, mismo patrón que `sendWorkshopInvitationEmail` (`:812-835`): `<h2>`, párrafos, botón inline cuando hay CTA. Sin firma ni footer. Sin emojis.

**Templates en `MAIL_TEMPLATES`:** `vehicle_claim_workshop_notification`, `vehicle_claim_blocked_owner`, `vehicle_claim_result`.

> `vehicle_claim_invitation` (§3.1) **no está registrado**: queda documentado para una eventual aprobación de F-11, pero hoy no se envía ni existe en `MAIL_TEMPLATES`.

### 3.1 `vehicle_claim_invitation` — al dueño con cuenta

> **Estado:** ⛔ **no se envía en el piloto.** Depende de F-11 (abierta). Se deja el copy listo para cuando se apruebe.

| Campo | Copy |
|---|---|
| Asunto | `Reclamá el historial de tu {marca} {modelo} - Autentia` |
| Título | `Reclamá el historial de tu vehículo` |
| Saludo | `Hola {nombre},` |
| Cuerpo | `El taller {taller} cargó una nueva atención para tu {marca} {modelo} (patente {patente}).` |
| Cuerpo 2 | `Reclamá el historial para ver todas las atenciones del vehículo en un solo lugar.` |
| CTA | `Reclamar el historial` → `{FRONTEND_URL}/reclamo/{token}` |
| Cierre | `Este link vence en 7 días.` |
| Justificación | `Recibís este email porque el taller registró una atención de un vehículo asociado a tu cuenta.` |

**Fallback de marca/modelo:** `{marca} {modelo}` → si no hay catálogo, usar `brandName`/`modelName`; si tampoco, sólo `patente`. En el asunto, si no hay marca/modelo: `Reclamá el historial de tu vehículo - Autentia`.

### 3.2 `vehicle_claim_workshop_notification` — al taller

Cinco variantes. Todas van a `Workshop.email`; si no existe, **no se envía** (skip con log).

#### a) Reclamo completado

| Campo | Copy |
|---|---|
| Asunto | `{Nombre} reclamó el vehículo {patente} - Autentia` |
| Título | `Reclamo completado` |
| Cuerpo | `{Nombre} ({email}) reclamó el vehículo {patente} y el historial ya quedó a su nombre.` |
| Cuerpo 2 | `No necesitás hacer nada. Si el reclamo no corresponde, podés revocarlo desde el panel.` |
| CTA | `Ver el reclamo` → panel del vehículo |

> **Alcance — variante `already_owner`** (el reclamante ya era el titular activo del vehículo; el commit no crea un vínculo nuevo): el aviso al taller **se envía igual** y **omite la frase de revocación** porque no hay vínculo nuevo que revocar. Sólo cambia el Cuerpo 2; asunto, título, cuerpo y CTA son los mismos que en la variante `claimed`. Aplica también al fallback sin reclamante (ver su fila `Cuerpo 2 (already_owner)` más abajo).
>
> | Campo | Copy |
> |---|---|
> | Asunto | `{Nombre} reclamó el vehículo {patente} - Autentia` |
> | Título | `Reclamo completado` |
> | Cuerpo | `{Nombre} ({email}) reclamó el vehículo {patente} y el historial ya quedó a su nombre.` |
> | Cuerpo 2 | `No necesitás hacer nada.` |
> | CTA | `Ver el reclamo` → panel del vehículo |

> **Fallback sin reclamante identificable** (cuenta borrada; `claimant = null`): el aviso al taller **se envía igual** (mitigación anti-squatting #1), pero el copy **no afirma la titularidad**:
>
> | Campo | Copy |
> |---|---|
> | Asunto | `Alguien reclamó el vehículo {patente} - Autentia` |
> | Título | `Reclamo completado` |
> | Cuerpo | `Alguien reclamó el vehículo {patente}.` |
> | Cuerpo 2 | `No necesitás hacer nada. Si el reclamo no corresponde, podés revocarlo desde el panel.` |
> | Cuerpo 2 (`already_owner`) | `No necesitás hacer nada.` |
> | CTA | `Ver el reclamo` → panel del vehículo |

#### b) Intento fallido

| Campo | Copy |
|---|---|
| Asunto | `Intento fallido de reclamo en {patente} - Autentia` |
| Título | `Intento fallido de reclamo` |
| Cuerpo | `Intento {n} de verificación fallido para el vehículo {patente}.` (con contador) / `Registramos un intento fallido de reclamo para el vehículo {patente}.` (sin contador) |
| Cuerpo 2 | `Si no reconocés este movimiento, revisá con quién compartiste el link.` |
| CTA | `Ver el reclamo` |

> **Nota:** un solo párrafo de intento. No se repite el mensaje genérico cuando ya se muestra `Intento {n}`.

#### c) Reclamo bloqueado

| Campo | Copy |
|---|---|
| Asunto | `Reclamo bloqueado: {patente} ya tiene titular - Autentia` |
| Título | `Reclamo bloqueado` |
| Cuerpo | `Alguien intentó reclamar el vehículo {patente}, pero ya tiene un titular registrado.` |
| Cuerpo 2 | `No se creó ningún vínculo nuevo.` |

#### d) Reclamo a revisar

| Campo | Copy |
|---|---|
| Asunto | `Reclamo a revisar: {patente} - Autentia` |
| Título | `Reclamo a revisar` |
| Cuerpo | `{Nombre} ({email}) reclamó el vehículo {patente}, pero no pudimos verificarlo automáticamente.` |
| Cuerpo 2 | `Revisá el reclamo en el panel y aprobalo o rechazalo.` |
| CTA | `Revisar el reclamo` |

> **Fallback sin nombre** (el reclamante todavía no vinculó su cuenta al invite): `Alguien reclamó el vehículo {patente}, pero no pudimos verificarlo automáticamente.`

#### e) Link auto-revocado

| Campo | Copy |
|---|---|
| Asunto | `El link de reclamo de {patente} fue revocado - Autentia` |
| Título | `Link de reclamo revocado` |
| Cuerpo | `El link de reclamo del vehículo {patente} se revocó automáticamente después de 3 bloqueos de verificación.` |
| Cuerpo 2 | `Si el dueño todavía necesita reclamar, generá un link nuevo y entregalo en persona.` |
| CTA | `Generar link nuevo` |

### 3.3 `vehicle_claim_blocked_owner` — al titular activo

| Campo | Copy |
|---|---|
| Asunto | `Alguien intentó reclamar tu vehículo {patente} - Autentia` |
| Título | `Alguien intentó reclamar tu vehículo` |
| Saludo | `Hola {nombre},` |
| Cuerpo | `Registramos un intento de reclamo para el vehículo {patente}, que figura a tu nombre en Autentia.` |
| Cuerpo 2 | `El reclamo no se completó y el vehículo sigue siendo tuyo.` |
| Cuerpo 3 | `Si no reconocés este movimiento, contactá a soporte.` |
| CTA | `Ver mi vehículo` → `/vehicles` |

> **Prohibido:** mencionar el taller, el nombre del reclamante o el canal por el que se filtró el link.

### 3.4 `vehicle_claim_result` — al reclamante

#### a) Reclamo exitoso

| Campo | Copy |
|---|---|
| Asunto | `Reclamaste el vehículo {patente} - Autentia` |
| Título | `El vehículo ya está a tu nombre` |
| Saludo | `Hola {nombre},` |
| Cuerpo | `Reclamaste el historial del vehículo {patente}. Ya podés consultar todas sus atenciones desde Autentia.` |
| CTA | `Ver el historial` → `/vehicles` |

#### b) Reclamo revocado por el taller

| Campo | Copy |
|---|---|
| Asunto | `El reclamo de {patente} fue revocado - Autentia` |
| Título | `El reclamo fue revocado` |
| Saludo | `Hola {nombre},` |
| Cuerpo | `El taller revocó el reclamo del vehículo {patente}. El historial ya no figura a tu nombre.` |
| Cuerpo 2 | `Si creés que es un error, contactá al taller donde hiciste la última atención.` |

#### c) Reclamo rechazado en revisión manual

> Reutiliza el mismo template `vehicle_claim_result` (variante `review_rejected`). No dice "ya no figura a tu nombre" porque el rechazo ocurre antes de crear cualquier ownership.

| Campo | Copy |
|---|---|
| Asunto | `El reclamo de {patente} fue rechazado - Autentia` |
| Título | `El reclamo fue rechazado` |
| Saludo | `Hola {nombre},` |
| Cuerpo | `El taller revisó el reclamo del vehículo {patente} y lo rechazó. El historial no quedó a tu nombre.` |
| Cuerpo 2 | `Si creés que es un error, contactá al taller donde hiciste la última atención.` |
| CTA | — |

---

## 4. Mapa de códigos → copy

| HTTP / código | Estado de UI | Copy |
|---|---|---|
| `200` bootstrap `pending` / `verification_required` | Formulario | Paso 1 / Paso 2 |
| `200` bootstrap `verified` | Ticket vigente | Paso 3 (cuenta) |
| `200` bootstrap `manual_review` | Revisión | §1.10 |
| `200` bootstrap `claimed` | Terminal | §1.11 `claimed` |
| `200` bootstrap `claim_blocked` | Terminal | §1.11 `claim_blocked` |
| `200` bootstrap `expired` | Terminal | §1.11 `expired` |
| `200` bootstrap `revoked` | Terminal | §1.11 `revoked` |
| `400` verify | Error inline | §1.6 (mensaje único) |
| `401` `AUTH_REQUIRED` | Redirect | §1.8 |
| `401` `TICKET_EXPIRED` | Terminal recuperable | §1.11 ticket vencido |
| `404` | Terminal | §1.11 link inválido |
| `409` lock | Terminal temporal | §1.7 |
| `410` | Terminal | §1.11 `expired` |
| `429` | Terminal temporal | `Hiciste demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.` |
| `5xx` | Error genérico | §1.11 error genérico |

---

## 5. Accesibilidad y microcopy

| Elemento | Regla |
|---|---|
| Errores | `role="alert"` + `aria-live="assertive"` |
| Carga | `role="status"` + `aria-live="polite"` |
| Botón en vuelo | `aria-busy="true"` y texto con `…` |
| Grupo de rangos | `role="radiogroup"` con `aria-label="Rangos de kilometraje"` |
| Opción seleccionada | `aria-checked="true"` |
| Campo patente | `autoComplete="off"`, `inputMode="text"`, `maxLength={10}` |
| Campo VIN | `inputMode="numeric"`, `maxLength={4}` |
| Foco al error | mover el foco al primer campo con error |
| Link de la marca | `aria-label="Ir al inicio de Autentia"` |

---

## 6. Checklist de aprobación de P-2

- [ ] Voseo consistente en los 3 bloques (página, panel, mails).
- [ ] Ningún texto revela datos del vehículo antes de la verificación.
- [ ] El error de verificación es único y no distingue causas.
- [ ] Los estados terminales dicen qué hacer después.
- [ ] Ningún mail contiene el link de reclamo (salvo F-11 aprobado).
- [ ] Los asuntos terminan en `" - Autentia"`.
- [ ] No hay emojis, firma ni footer.
- [ ] Los textos de "volvés a tu reclamo" son coherentes con la extensión de `?next=`.
- [ ] El panel no promete volver a mostrar el link.
- [ ] El copy de `claim_blocked` y `claimed` no revela identidad del titular.

---

## 7. Pendientes que este documento no puede cerrar solo

| Punto | Por qué |
|---|---|
| **F-11** | Si se aprueba el mail automático con link, se activa §3.1 y hay que revisar el requisito "el mail nunca lleva el link". |
| **F-9** | Si se decide un único estado "no disponible", colapsan `expired` / `revoked` / `claimed` en un solo texto y se pierde §1.11 tal como está. |
| **F-7** | Si `ownerPhone` corrige `VehicleOwnerContact`, el panel necesita copy de edición de teléfono (hoy no está). |
| Nombre del remitente | El repo no define `from` por template; se mantiene el global existente. |
| Plazo de revisión manual | No se promete ninguno hasta que operaciones lo defina. |
