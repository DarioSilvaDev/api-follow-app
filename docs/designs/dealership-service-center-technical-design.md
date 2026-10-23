# Diseño Técnico: Concesionaria con Service Center propio (alta conjunta) — Dealership + Workshop

> **Autor:** Tech Lead — HCDV
> **Fecha:** 2026-10-07
> **Basado en:** `docs/specs/dealership-service-center-flow.md` (LISTO PARA DISEÑO TÉCNICO, decisiones D1..D8 cerradas por founder)
> **Estado:** PARA REVISIÓN DEL TECH LEAD / PM. No implementar hasta aprobación.
> **Decisiones aplicables:** D-102, D-103, D-106, D-109, D-113 + D1..D8 (spec). Reglas RG-1..RG-8, criterios AC-1..AC-10.

---

## 0. Resumen ejecutivo

La feature se implementa sobre el flujo D-106 existente sin nuevas tecnologías:

1. **Schema:** FK nullable `unique` en `Workshop.dealershipId` con `onDelete: SetNull`. Resuelve el pendiente de `seed.ts:1864`.
2. **Alta admin:** `CreateDealershipHandler` (extendido) crea ambas entidades + roles + **una** invitación en una sola transacción cuando `hasOwnWorkshop=true`.
3. **Token compartido:** **una sola fila** `DealershipInvitation`. El taller viaja junto a la concesionaria vía el link `Workshop.dealershipId`; NO se crea fila `WorkshopInvitation`.
4. **Claim conjunto:** `WizardClaimHandler` (dealerships) extendido; todo en la misma `$transaction` (RG-5) con doble protección `updateMany` contra doble-claim.
5. **Mails:** 2 variantes nuevas de template (invitación + confirmación combinadas) decididas por los listeners existentes; listeners espejo de workshop ganan un guard `dealershipId == null` para nunca duplicar correos.
6. **AC-7:** `hasOwnWorkshop` derivado en `GetDealershipHandler` + DTO de detalle (RG-6/D7: nunca se persiste).
7. **AC-10:** matriz `employee` (+`appointment.update/cancel`) en constantes Y seed (espejo), label "Recepcionista" es UI. **Requiere revisión Security.**
8. **AC-9:** seed vincula los 3 service centers por `taxId` (idempotente) sin tocar los 20 talleres independientes.

**Contratos API preservados:** rutas, métodos, permisos y DTOs raíz existentes no cambian; solo se agregan campos opcionales y campos de respuesta.

---

## 1. Decisiones de arquitectura

Cada decisión se expresa en el formato del proyecto.

---

### D-TL-1 — Mecanismo del vínculo 1:1: FK nullable + unique en `Workshop.dealershipId`

**Problema:** RG-1 exige 1:1 en ambos sentidos (una concesionaria ≤1 taller; un taller vinculado ≤1 concesionaria), con link `null` para talleres independientes. El spec deja el mecanismo a criterio del Tech Lead (§14).

**Decisión:** Agregar a `Workshop`:

```prisma
dealershipId String? @unique @map("dealership_id") @db.Uuid
dealership   Dealership? @relation(fields: [dealershipId], references: [id], onDelete: SetNull)
```

y en `Dealership`: `workshop Workshop?`.

**Razón:**
- `unique` sobre el campo garantiza "a lo sumo un taller por concesionaria" a nivel BD (no solo en código).
- Al ser un único campo escalar, "a lo sumo una concesionaria por taller" está garantizado por construcción (no hay colección).
- `onDelete: SetNull` materializa D2/RG-2 exactamente: borrar la concesionaria solo desvincula al taller (queda independiente); no se propaga a miembros, roles, permisos ni `CareEpisode`s.

**Alternativas:**
- Tabla de vínculo `dealership_workshop` con dos FKs únicas: rechazada. Añade una tabla y una relación sin aportar nada (el link es declarativo, no tiene atributos propios) y complica la lectura derivada de `hasOwnWorkshop`.
- Booleano `has_own_workshop` en `Dealership`: rechazado (D7/RG-6: derivado, nunca persistido).

**Trade-offs:** La cardinalidad "un taller ≤1 concesionaria" queda implícita (scalar) en vez de explícita; aceptable por simplicidad. Un taller vinculado puede quedar huérfano si la concesionaria se borra (comportamiento aceptado por el spec §15).

**Impacto:** migración aditiva no destructiva (ver §2); sin impacto en `CareEpisode`, `WorkshopBranch`, permisos ni queries existentes.

---

### D-TL-2 — La creación conjunta vive en `CreateDealershipHandler` (módulo `administration`), extendido

**Problema:** el spec pregunta si la creación conjunta debe vivir en `administration` (tocando ambos dominios) o en un servicio compartido.

**Decisión:** Extender `src/modules/administration/commands/create-dealership/create-dealership.handler.ts`. El flag `hasOwnWorkshop` entra por el DTO existente (`CreateDealershipDto`) y dentro de la MISMA `$transaction` se crea dealership + (opcional) workshop + roles + única invitación.

**Razón:**
- El módulo `administration` **ya es el orquestador del onboarding admin** de ambos dominios: `CreateDealershipHandler` y `CreateWorkshopHandler` son espejos que crean entidad + roles + invitación directamente con Prisma, e importan las constantes de cada módulo (`dealerships.constants`, `workshops.constants`). Poner la creación conjunta ahí es el patrón existente, no una excepción.
- No hay otro consumidor del "grupo" fuera del alta admin; un servicio compartido nuevo sería abstracción sin uso.
- `CreateWorkshopHandler` (alta admin de taller independiente) queda intacto: sigue sirviendo al flujo "taller suelto".

**Alternativas:** handler nuevo `CreateDealershipGroupHandler`: rechazado (ceremonia extra, mismo resultado, duplica el bloque de creación de dealership).

**Trade-offs:** el handler crece (~+50 líneas). Se mitiga extrayendo el bloque de creación de roles del taller a un helper privado del handler (reutiliza `WORKSHOP_DEFAULT_ROLES`/`WORKSHOP_ROLE_PERMISSIONS` — mismo patrón RB-10 de `permissionMap`).

**Importante — desvío deliberado del espejo:** a diferencia de `CreateWorkshopHandler`, la creación conjunta **NO hace dedupe de nombre del taller al alta**: el nombre `"{name} Service"` es un prefill editable del paso 2 y el dedupe se difiere al claim (AC-6). El schema lo permite (`name` tiene `@@index`, no `unique`). Consecuencia documentada: pueden coexistir N workshops `pending_claim` con el mismo prefill; el claim los resuelve con 409.

**Impacto:** `POST /admin/dealerships` (ruta, guard y permiso `admin.dealerships.create` intactos) + DTO + handler + respuesta con `workshop?: { id, name }`.

---

### D-TL-3 — Token compartido = UNA sola fila `DealershipInvitation` (sin fila `WorkshopInvitation`)

**Problema:** el spec pregunta mecanismo del token compartido respetando el `unique` de token por tabla.

**Decisión:** El claim conjunto usa exclusivamente la fila `dealership_invitations` existente (token UUID, expiración 7 días). NO se crea `workshop_invitations` para el taller vinculado. El taller se resuelve por `Workshop.dealershipId`.

**Razón:**
- El `unique` de token es **por tabla**: dos filas en tablas distintas podrían compartir token, pero eso introduce un problema de coherencia: aceptar/expirar/cancelar/reinvitar debe mantenerse sincronizado entre dos filas, y dos filas pueden derivar (una accepted, otra pending) rompiendo el doble-claim y el reenvío.
- Con una sola fila, el ciclo de vida (expiración, cancelación, reenvío, claim) es el existente, sin cambios: `ReinviteDealershipInvitationHandler` funciona tal cual (emite `dealership.member.invited` y el listener resuelve el taller por link).
- El wizard sigue siendo "el wizard de la concesionaria" (`kind=dealership`); el taller es un dato anexo del mismo claim.

**Consecuencias (documentadas):**
- El taller vinculado no tiene fila en `workshop_invitations`. `WorkshopMember.invitedAt` se completa con `invitation.createdAt` (patrón ya usado por los handlers espejo).
- Nunca se emite `workshop.member.invited` para talleres vinculados (solo `dealership.member.invited`, que lleva el mail combinado). El listener de taller gana un guard defensivo (D-TL-5).

**Trade-offs:** la asimetría "taller sin invitación propia" es intencional; ningún código existente asume taller → invitación obligatoria.

---

### D-TL-4 — Claim conjunto: extender `WizardClaimHandler` (dealerships) en la misma `$transaction`

**Problema:** dónde y cómo implementar el claim atómico de ambas entidades (RG-5, AC-4..AC-6).

**Decisión:** Extender `src/modules/dealerships/commands/wizard-claim/wizard-claim.handler.ts`. Misma matriz de errores D-106, mismo flujo de cuenta (inexistente/pending/active/soft-deleted suspensión), mismo `updateMany` de invitación — y, si la dealership tiene taller vinculado (`dealership.workshop != null`):

1. Validar el bloque `dto.workshop` (paso 2):
   - `name` requerido → 400 `'Ingresá el nombre del taller.'` (si falta el bloque o el nombre está vacío);
   - dedupe nombre case-insensitive → 409 `'Ya existe un taller con este nombre.'`;
   - dedupe CUIT normalizado (solo dígitos) → 409 `'Ya existe un taller con este CUIT.'` + P2002 race → mismo 409 (patrón existente).
2. `updateMany` del taller con condición `status: 'pending_claim'` → `status: 'active'`, `claimedAt: now`, + patch `name/taxId/email/phone/website/description`; `count === 0` → `InvitationUsedException` (rollback).
3. Lookup `workshopRole` owner (`workshopId_code`) → error si falta.
4. `workshopMember.create` (owner, `status: 'active'`, `joinedAt: now`, `invitedAt: invitation.createdAt`, `acceptedAt: now`).

Todo dentro de la **misma** `$transaction` del claim actual (DEALERSHIP claim + WORKSHOP claim + 2 membresías = un solo commit). Post-commit (solo si hubo taller): `permissionCache.invalidateUser`, emitir `workshop.member.joined` + `workshop.claimed` (además de los existentes de dealership; `auth.user.registered` solo si cuenta nueva).

**Razón:**
- Reescribir el flujo de cuenta (25 líneas de lógica de estados) en un handler nuevo duplicaría la lógica más frágil. Extender preserva la matriz D-106 y el contrato de errores congelado.
- La doble protección `updateMany` (invitación `pending` + taller `pending_claim`) blinda AC-5 en ambos sentidos con rollback total.
- `workshop.dealershipId` nunca cambia en el claim: el link nace en el alta admin.

**Impacto:** DTO de claim (+`workshop?`), handler, respuesta con `workshop` cuando corresponde. El `WizardController` (rutas/throttle) NO cambia.

---

### D-TL-5 — Mails combinados: variantes en `MailService` + guards en listeners de workshop

**Problema:** un solo correo de invitación y un solo correo de confirmación combinados, reutilizando eventos existentes y sin duplicar envíos.

**Decisión:**

1. `mail.types.ts`: nuevos templates estables `DEALERSHIP_GROUP_INVITATION` y `DEALERSHIP_GROUP_CLAIMED`.
2. `mail.service.ts`:
   - `sendDealershipGroupInvitationEmail(to, dealershipName, workshopName, token, context?)` — link `{FRONTEND_URL}/invitations/{token}?kind=dealership`, asunto `Completá el alta de ${dealershipName} y su taller - Autentia`, copy §13.B.
   - `sendDealershipGroupClaimedEmail(to, dealershipName, workshopName, context?)` — asunto `${dealershipName} y su taller quedaron activos - Autentia`, copy §13.D (2 CTAs).
   - Ambas pasan por `send()` existente (idempotencia/retry D-113 intactos) y context con `{ dealershipId, workshopId }` para correlación de logs.
3. `dealership-invitation-email.listener.ts`: tras el guard `pending_claim`, `workshop.findFirst({ where: { dealershipId } })`; si existe → variante combinada; si no → comportamiento actual. **Sin cambios de contrato de evento.**
4. `dealership-claimed-email.listener.ts`: mismo patrón → variante combinada vs. actual.
5. Guards en listeners espejo de workshop:
   - `workshop-invitation-email.listener.ts`: skip si `workshop.dealershipId != null` (defensivo; el flujo combinado nunca emite `workshop.member.invited`, pero el guard lo vuelve estructural).
   - `workshop-claimed-email.listener.ts`: skip si `workshop.dealershipId != null` — **clave**: el claim combinado emite `dealership.claimed` + `workshop.claimed`; sin este guard se enviarían 2 mails de confirmación. El listener de dealership envía el único mail combinado.

**Razón:** los eventos no cambian de nombre ni payload (spec §11: "no se crean eventos nuevos"); la variante la elige el listener consultando el link — consistente con el patrón actual (los listeners ya consultan la BD para armar el mail y ya tienen guards).

**Trade-offs:** un guard más en listeners de workshop (2 líneas) a cambio de no crear eventos nuevos ni duplicar envíos.

---

### D-TL-6 — `hasOwnWorkshop` derivado en `GetDealershipHandler` + `DealershipDetailAdminResponseDto`

**Problema:** AC-7 exige exponer `hasOwnWorkshop` (derivado) y el taller asociado en `GET /admin/dealerships/:id`.

**Decisión:** `GetDealershipHandler` suma `include: { workshop: { select: { id: true, name: true } } }`; el DTO mapea `hasOwnWorkshop: !!dealership.workshop` y `workshop: dealership.workshop ?? null`. **Nada se persiste** (RG-6/D7). El listado (`DealershipAdminResponseDto`) queda sin cambios (contrato congelado; AC-7 solo cubre el detalle).

---

### D-TL-7 — Rol `employee` → "Recepcionista" (AC-10): sincronizar constantes + seed

**Problema:** label "Recepcionista" + permisos `appointment.update`/`appointment.cancel` en el rol `employee`.

**Decisión:**
- `src/modules/workshops/workshops.constants.ts` → `WORKSHOP_ROLE_PERMISSIONS.employee = ['appointment.create', 'history.view', 'appointment.update', 'appointment.cancel']`.
- `prisma/seed.ts` → `systemWorkshopRolePermissions.employee` (línea 721): misma adición. Los archivos son espejo; el comentario de `workshops.constants.ts` lo exige.
- Ambos permisos ya existen como filas en el seed (§ líneas 216/223), no se crean permissions nuevos.
- `seedSystemWorkshopRolePermissions` usa `upsert` → al re-ejecutar `npm run db:seed` los roles `employee` existentes ganan los 2 permisos (idempotente).
- Label "Recepcionista": es **UI** (mapeo frontend code→label); sin cambio de schema ni de `name` del rol en BD.

**BLOQUEANTE:** revisión Security del alcance de `appointment.update/cancel` para recepcionistas (ownership de turnos/ventana de cancelación). No bloquea el resto de la feature (spec §9); sí bloquea merge del AC-10. **Solicitar a Security antes de implementar este punto.**

---

### D-TL-8 — Seed AC-9: bloque de vínculo idempotente dentro de `seedDealerships`

**Problema:** vincular los 3 service centers a sus concesionarias sin tocar los 20 talleres independientes, respetando el orden del seed (workshops se siembran ANTES que dealerships — `main()` líneas 2960/2962).

**Decisión:** NO reordenar `main()`. Dentro de `seedDealerships`, después del loop existente, agregar un bloque de vínculo:

```ts
const serviceLinks = [
  { dealershipTaxId: '30-71709321-3', workshopTaxId: '30-72010031-5' }, // Giorgi ↔ giorgi-svc
  { dealershipTaxId: '30-70125584-1', workshopTaxId: '30-72010032-2' }, // Fortecar ↔ fortecarsvc
  { dealershipTaxId: '30-70042389-5', workshopTaxId: '30-72010033-9' }, // Pesado Castro ↔ castro-svc
];
```

por cada par: `findUnique` de ambas por `taxId`; si ambas existen y `workshop.dealershipId !== dealership.id` → `update workshop.dealershipId = dealership.id`. Corre también para dealerships pre-existentes (el loop de creación `skips`), por eso va fuera del loop → idempotente.

**Razón:** mantener el orden del seed evita riesgo de romper dependencias existentes (`seedWorkshopSpecialties`, `seedCareEpisodes`, etc.). El vínculo por `taxId` es estable (CUITs únicos conocidos).

**Riesgo acotado:** si un workshop ya estuviera vinculado a otra dealership, el `unique` lanzaría P2002 y el seed fallaría con ruido (indica datos corruptos; comportamiento deseado). Actualizar además el comentario de `seed.ts:1864` (decisión resuelta).

---

## 2. Schema — migración

`prisma/schema.prisma`:

```prisma
model Workshop {
  // ... campos existentes sin cambios ...

  dealershipId String? @unique @map("dealership_id") @db.Uuid
  dealership   Dealership? @relation(fields: [dealershipId], references: [id], onDelete: SetNull)
}

model Dealership {
  // ... campos existentes sin cambios ...

  workshop Workshop?
}
```

Migración (`npm run db:migrate`): aditiva, NO destructiva. SQL generado equivalente a:

```sql
ALTER TABLE "workshops" ADD COLUMN "dealership_id" UUID;
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_dealership_id_key" UNIQUE ("dealership_id");
ALTER TABLE "workshops"
  ADD CONSTRAINT "workshops_dealership_id_fkey"
  FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

Verificaciones posteriores: `npm run db:generate`, build, y smoke test de queries existentes de workshop (list/get admin) — el campo nuevo no altera selects existentes (Prisma solo lo incluye si se pide).

---

## 3. Contratos API

Todos los cambios son aditivos; rutas, métodos, guards y permisos NO cambian.

### 3.1 `POST /admin/dealerships` — `CreateDealershipDto`

```ts
// + campos nuevos
@IsOptional()
@IsBoolean()
hasOwnWorkshop?: boolean; // default false
```

Respuesta (handler): objeto dealership existente + `workshop?: { id, name }` cuando `hasOwnWorkshop=true`.

### 3.2 `GET /admin/dealerships/:id` — `DealershipDetailAdminResponseDto`

```ts
+ hasOwnWorkshop: boolean;               // derivado: !!dealership.workshop (RG-6)
+ workshop: { id: string; name: string } | null;
```

### 3.3 `GET /dealerships/wizard/invitations/:token` (validación pública)

> **Nota de discrepancia con el spec:** el spec §6/§11 escribe `GET /dealerships/wizard/validation?token`; el código real es `GET /dealerships/wizard/invitations/:token` (WizardController `@Get('invitations/:token')`). El diseño se basa en el contrato REAL; el spec debe corregirse (PM, no bloqueante).

Respuesta (cuando el token es conjunto): además de los campos actuales,

```ts
+ workshop?: { id: string; name: string }   // presente si hay taller vinculado pending_claim
```

(frontend renderiza 2 pasos — AC-3).

### 3.4 `POST /dealerships/wizard/claim` — `WizardClaimDto`

```ts
+ @IsOptional() @ValidateNested() @Type(() => WizardWorkshopGroupDataDto)
+ workshop?: WizardWorkshopGroupDataDto;
```

Nuevo DTO anidado (en `dealerships/dto/wizard-claim.dto.ts` — no reusar `WizardWorkshopDataDto` de workshops: le faltan `name`/`taxId`; la duplicación de 4 campos entre módulos es aceptable y evita una carpeta `shared-dto` prematura):

```ts
class WizardWorkshopGroupDataDto {
  name?: string;        // requerido SOLO si el token es conjunto (validado en handler, 400 'Ingresá el nombre del taller.')
  taxId?: string;       // opcional, normalizado server-side (solo dígitos)
  email?: string;       // opcional
  phone?: string;       // opcional
  website?: string;     // opcional (IsUrl)
  description?: string; // opcional
}
```

Respuesta: campos actuales + `workshop?: { id, name, status, email, phone, website, description }` cuando corresponde.

### 3.5 Eventos

Reutilización exacta (spec §11, sin eventos nuevos): `dealership.member.invited`, `dealership.member.joined`, `dealership.claimed`, `workshop.member.joined`, `workshop.claimed`, `auth.user.registered`. La selección de variante de mail la hace el listener (D-TL-5).

### 3.6 Sin cambios

- `POST /admin/workshops` y `CreateWorkshopHandler` (alta de taller independiente) — intactos.
- `WorkshopAdminResponseDto` / `WorkshopDetailAdminResponseDto` — intactos (opcional futuro: exponer `dealershipId`; fuera de alcance hoy).
- Rutas de reinvitación (`POST /admin/dealerships/:id/invitations`) — funcionan sin cambio (D-TL-3).
- Throttling del wizard (10 req/60s GET, 5 req/300s POST) — intacto.

---

## 4. Flujo detallado de handlers

### 4.1 `CreateDealershipHandler` (extendido)

```
1. Dedupe dealership (name case-insensitive, taxId normalizado) — EXISTENTE.
2. hasOwnWorkshop = dto.hasOwnWorkshop ?? false
3. $transaction:
   a. dealership.create (pending_claim, roles owner/admin/seller, isActive) — EXISTENTE
   b. if hasOwnWorkshop:
      - workshop.create({
          name: `${dto.name} Service`, status: 'pending_claim', isActive: true,
          dealershipId: created.id,
          roles: { create: WORKSHOP_DEFAULT_ROLES con WORKSHOP_ROLE_PERMISSIONS via permissionMap } // sin taxId
        })
   c. dealershipInvitation.create (token único, 7 días, rol owner) — EXISTENTE
4. Post-commit: emit dealership.member.invited (SIN workshop.member.invited)
5. Respuesta: dealership + invitation + workshop?: { id, name } si aplica
```

Errores: los P2002 existentes del dealership (name/taxId). Workshop al alta NO lleva taxId ni dedupe de nombre (desvío documentado, D-TL-2).

### 4.2 `WizardValidationHandler` (extendido)

```
1. Invitation lookup por token + include dealership.workshop { id, name, status }
2. Matriz de errores D-106 EXISTENTE, + guard: si hay taller vinculado y workshop.status !== 'pending_claim' → InvitationUsed (inalcanzable por flujo normal)
3. account/requiresRegister EXISTENTE
4. Respuesta: + workshop?: { id, name } si hay taller vinculado
```

### 4.3 `WizardClaimHandler` (extendido)

```
1. Invitation lookup por token + include dealership.workshop { id, name, status }
2. Matriz de errores D-106 EXISTENTE (inválida/expirada/usada/cancelada/email mismatch/suspensión/soft-deleted D-S3)
3. Resolución de cuenta EXISTENTE (inexistente → crea; pending → reactiva; active → exige sesión del dueño)
4. $transaction:
   a. dealershipInvitation.updateMany({ status: 'pending' } → accepted) — EXISTENTE; count 0 → rollback
   b. dealership.updateMany({ status: 'pending_claim' } → active + claimedAt + patch) — EXISTENTE; count 0 → rollback
   c. [account create/reactivate] — EXISTENTE
   d. dealershipRole owner lookup + dealershipMember.create — EXISTENTE
   e. if linkedWorkshop:
      - validar dto.workshop: name requerido (400), dedupe name (409), dedupe taxId (409) — ANTES del write
      - workshop.updateMany({ status: 'pending_claim' } → active + claimedAt + patch name/taxId/email/phone/website/description); count 0 → InvitationUsed (rollback)
      - workshopRole owner lookup (error si falta)
      - workshopMember.create (owner, invitedAt = invitation.createdAt, acceptedAt/joinedAt = now)
5. Post-commit: permissionCache.invalidateUser(userId); emit dealership.member.joined, dealership.claimed, (if linked) workshop.member.joined, workshop.claimed, (if newUser) auth.user.registered
6. Respuesta: user + dealership + member + workshop? cuando corresponde
```

TC totales de la transacción: usuario(?) + 1 invitación + 2 entidades + 2 membresías.

### 4.4 Rugosidad verificada (spec §7)

| Caso | Mecanismo |
|---|---|
| Doble claim | `updateMany` invitación `pending` + `updateMany` taller `pending_claim`; count 0 → rollback total (AC-5) |
| Colisión nombre/CUIT taller | dedupe pre-write + P2002 race → 409 (AC-6) |
| Fallo parcial | una sola `$transaction` (RG-5) |
| Taller sin completar paso 2 | el claim no se ejecuta; ambas siguen `pending_claim` (sin taller fantasma activo) |
| Email soft-deleted | D-S3 intacto (409) |

---

## 5. Seed (AC-9)

- `seed.ts:1864`: actualizar comentario (decisión de arquitectura resuelta por D-TL-1).
- `seedDealerships`: bloque de vínculo post-loop por `taxId` (D-TL-8), 3 pares.
- `systemWorkshopRolePermissions.employee` (línea 721): +`appointment.update`, `appointment.cancel` (D-TL-7).
- Invariante verificado: `w01..w20` quedan con `dealershipId IS NULL`; los 3 services vinculados.

---

## 6. Plan de pruebas

### 6.1 Unit — `create-dealership.handler.spec.ts` (extender existente)

1. `hasOwnWorkshop=true` → crea dealership + workshop `pending_claim` + UNA invitation; workshop sin `taxId`, con `name = "{name} Service"`, `dealershipId = dealership.id`; respuesta incluye `workshop`. (AC-1)
2. `hasOwnWorkshop` ausente/false → comportamiento actual sin taller. (AC-2)
3. Roles del taller creados con la matriz `WORKSHOP_ROLE_PERMISSIONS` (RB-10, permissionMap).
4. Dedupe dealership intacto (regresión: nombre/CUIT).
5. P2002 dealership → 409 (regresión).

### 6.2 Unit — `wizard-validation.handler.spec.ts`

1. Token conjunto → respuesta con `workshop: { id, name }` + `valid: true`. (AC-3)
2. Token simple → sin campo `workshop` (regresión).
3. Matriz de errores intacta (inválida/expirada/usada) (regresión).

### 6.3 Unit — `wizard-claim.handler.spec.ts` (nuevo o extendido)

1. Claim conjunto, cuenta nueva → usuario + 2 membresías owner (`DealershipMember` + `WorkshopMember`) + ambas entidades `active` con `claimedAt`; eventos `dealership.claimed` + `workshop.claimed` + `auth.user.registered` post-commit. (AC-4)
2. Claim conjunto, cuenta active con sesión del dueño → mismas membresías; sin `auth.user.registered`.
3. Claim conjunto, cuenta pending → reactivación + ambas membresías.
4. Doble claim → 409 y NINGÚN cambio parcial (verificar BD: entidades siguen `pending_claim`, sin membresías). (AC-5)
5. Taller con nombre duplicado → 409, rollback. (AC-6)
6. Taller con CUIT duplicado → 409, rollback. (AC-6)
7. Taller vinculado sin bloque `dto.workshop` / sin name → 400.
8. Fallo de cuenta (soft-deleted D-S3) → 409 y rollback del taller.
9. Claim simple (sin taller) → regresión completa del flujo actual.

### 6.4 Unit — listeners de email

1. `dealership-invitation-email.listener`: taller vinculado → `sendDealershipGroupInvitationEmail` con ambos nombres; sin vínculo → template actual.
2. `dealership-claimed-email.listener`: ídem con variante combinada.
3. `workshop-invitation-email.listener`: workshop con `dealershipId` → `undefined` (no envía).
4. `workshop-claimed-email.listener`: workshop con `dealershipId` → `undefined` (no duplica confirmación).

### 6.5 Unit — `mail.service.ts`

1. `sendDealershipGroupInvitationEmail`: link `{FRONTEND_URL}/invitations/{token}?kind=dealership`, asunto/copy §13.B, context con ambos ids, nunca loguea token.
2. `sendDealershipGroupClaimedEmail`: copy §13.D.
3. Comportamiento `send()` (retry/idempotencia D-113) cubierto por los spec existentes; las variantes nuevas solo aportan payload.

### 6.6 Unit — `get-dealership` + `dealership-detail-response.dto`

1. Dealership con taller → `hasOwnWorkshop: true` + `workshop: { id, name }`. (AC-7)
2. Dealership sin taller → `hasOwnWorkshop: false` + `workshop: null`.
3. Listado (`DealershipAdminResponseDto`) sin cambios (regresión).

### 6.7 Integración / BD

1. Migración aditiva: `workshops` gana columna + unique + FK SetNull; datos existentes intactos.
2. Constraint: intentar vincular un taller a 2 concesionarias → P2002 (RG-1).
3. `onDelete: SetNull`: borrar dealership → taller queda huérfano con `dealershipId IS NULL` y `CareEpisode`s intactos (RG-2).

### 6.8 E2E (si la suite e2e lo permite)

1. Superadmin crea dealership con `hasOwnWorkshop=true` → invita → dueño valida (2 pasos) → claim → login → el usuario ve 2 contextos activos (DEALERSHIP + WORKSHOP) y puede crear un `CareEpisode` SOLO desde el contexto WORKSHOP (AC-8).
2. Flujo sin checkbox → regresión (1 contexto).

### 6.9 Seed

1. Ejecutar `npm run db:reset` + `npm run db:seed` → verificar: `giorgi-svc/fortecar-svc/castro-svc` con `dealershipId` set; `w01..w20` con `NULL`; carpetas de roles employee con 4 permisos. (AC-9)
2. Re-ejecutar seed → idempotente (sin errores ni duplicados).

### 6.10 Security (pendiente, no bloqueante del resto)

- Revisar alcance de `appointment.update/cancel` en empleados: ownership del turno, ventana de cancelación, a quién puede modificar citas (AC-10). Plan: test de autorización sobre `appointments` module por rol `employee`.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Claim conjunto es la operación más delicada (AC-5) | Misma `$transaction` + doble `updateMany` guard; 0 cambios en flujo de cuenta |
| Doble mail de confirmación | Guard `dealershipId == null` en `workshop-claimed-email.listener` (D-TL-5) |
| Caché de permisos | `permissionCache.invalidateUser` ya cubre todas las membresías del user (patrón existente) |
| P2002 de `workshop.dealershipId` en seed (dato corrupto) | Falla ruidosa = señal; guard previo `!== dealership.id` para idempotencia |
| Reescribir flujo de cuenta | No se reescribe: se extiende el handler; matriz D-106 congelada |
| Tocar esquema (FK nueva) | Migración aditiva; sin cambios sobre `CareEpisode`/branches/permisos |
| Discrepancia spec vs código (ruta wizard) | Documentada (§3.3); corrección del spec delegada al PM |
| AC-10 sin aval Security | Implementación del punto N bloqueada hasta revisión (spec §9) |

---

## 8. Checklist de revisión (para el Tech Lead antes de delegar)

- [ ] Schema: FK única + SetNull; migración aditiva verificada
- [ ] D-TL-1..D-TL-8 aceptados (o refutados con alternativa)
- [ ] RG-1..RG-8 cubiertos explícitamente en el código propuesto
- [ ] AC-1..AC-10 mapeados a casos de test (§6)
- [ ] Contratos API aditivos, rutas/permisos congelados intactos
- [ ] Eventos reutilizados; ninguna variante nueva de evento
- [ ] Listener espejo de workshop con guards anti duplicación
- [ ] Seed idempotente + comentario `seed.ts:1864` actualizado
- [ ] Revisión Security del AC-10 iniciada en paralelo
- [ ] Spec: corrección de ruta del wizard (§3.3) comunicada al PM

---

## 9. Archivos impactados

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` (+migración) | FK `Workshop.dealershipId` unique + relación |
| `prisma/seed.ts` | vínculo AC-9, matriz employee, comentario 1864 |
| `src/modules/administration/dto/create-dealership.dto.ts` | +`hasOwnWorkshop?` |
| `src/modules/administration/commands/create-dealership/create-dealership.handler.ts` | creación conjunta en la misma tx |
| `src/modules/administration/queries/get-dealership.handler.ts` | include workshop (AC-7) |
| `src/modules/administration/dto/dealership-detail-response.dto.ts` | +`hasOwnWorkshop` +`workshop` |
| `src/modules/dealerships/dto/wizard-claim.dto.ts` | +`workshop?` (nuevo DTO anidado) |
| `src/modules/dealerships/commands/wizard-claim/wizard-claim.handler.ts` | claim conjunto |
| `src/modules/dealerships/queries/wizard-validation/wizard-validation.handler.ts` | +`workshop` en respuesta |
| `src/modules/dealerships/listeners/dealership-invitation-email.listener.ts` | variante combinada |
| `src/modules/dealerships/listeners/dealership-claimed-email.listener.ts` | variante combinada |
| `src/modules/workshops/listeners/workshop-invitation-email.listener.ts` | guard `dealershipId == null` |
| `src/modules/workshops/listeners/workshop-claimed-email.listener.ts` | guard `dealershipId == null` |
| `src/modules/workshops/workshops.constants.ts` | matriz employee (AC-10) |
| `src/common/mail/mail.types.ts` | 2 templates |
| `src/common/mail/mail.service.ts` | 2 métodos |
| `docs/specs/dealership-service-center-flow.md` | fix ruta wizard (§3.3), nota D-TL-3 |