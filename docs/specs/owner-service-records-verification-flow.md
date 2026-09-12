# Especificación: F-020 Iteración 2-2 — Registro de servicios del propietario + verificación por taller

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-11
> **Estado:** v2 — Aprobada por Tech Lead con ajustes #1–#9 (2026-09-11). Lista para implementación.
> **Basado en:** P2-1..P2-6 (F-020), decisiones A-G confirmadas por usuario 2026-09-11, D-024 A2 (a amendar parcialmente vía D-062), D-060 (Trust diferido → retomado en modo discreto), ADR-005 T3/T4, D-020 A1, D-035

---

## 1. Problema

En F-020 el taller pudo registrar atenciones, pero el **propietario no puede construir el historial de su vehículo por su cuenta**:

- Los autos usados llegan con historial vacío: Pedro (nuevo usuario, Chevrolet Onix 2024 usado) no puede registrar el cambio de aceite y los 2 neumáticos que hizo **antes de darse de alta**.
- No existe distinción de fuente (taller vs propietario) ni mecanismo para que el propietario gane confianza en la historia mediante **verificación del taller responsable**.
- El modelo `CareEpisode` actual exige contexto WORKSHOP (`workshopId`/`branchId`/`createdByMemberId` NOT NULL) — un propietario no puede crear episodios (D-024 A2).

## 2. Objetivo

Completar el journey **"el propietario registra un servicio histórico y el taller puede darle veracidad"**:

1. El propietario registra un servicio propio (fecha pasada permitida, km, título, notas, taller responsable: taller de la app **o** texto libre).
2. El episodio nace como `source=OWNER`, estado `delivered`, confianza `UNVERIFIED` (nivel discreto: "Registrado por el propietario").
3. Si asoció un taller de la app, ese taller ve el episodio en su **cola de verificaciones** (contexto WORKSHOP) y puede confirmarlo → `WORKSHOP_VERIFIED` ("Verificado por {taller}").
4. El origen del episodio **nunca cambia** (sigue siendo registro del propietario; la verificación es una afirmación auditable del taller).

## 3. Actores

| Actor | Acceso |
|---|---|
| **Propietario** (ownership vigente) | CONTEXTO PERSONAL — crea episodios `source=OWNER` sobre **sus** vehículos (`assertOwnership`). NO edita/borra (F-021). NO verifica. |
| **Miembro de taller activo** (owner/mechanic) | CONTEXTO WORKSHOP — crea episodios `source=WORKSHOP` (flujo F-020 intacto) + ve cola de verificaciones + confirma (`care-episode.verify`). |
| Miembro `employee` | NO crea episodios ni verifica (solo appointment). |
| super_admin | Read path actual intacto; writes de maintenance siguen excluidos de PERSONAL salvo el alcance de D-062. |

## 4. Decisiones de producto confirmadas (A–G, 2026-09-11)

### D-062 — Amendar D-024 A2 parcialmente: propietario puede crear `care_episode.create` con `source=OWNER`

- El write de maintenance sigue siendo WORKSHOP-only (D-024 A2) **EXCEPTO** `care_episodes.create` en contexto PERSONAL cuando: (a) el actor es el owner vigente del vehículo (`assertOwnership`), (b) el episodio se crea con `source=OWNER`.
- NO se amenda ningún otro write (service records, work orders, etc.).

### D-063 — Origen fijo e inmutable

- El autor del episodio queda fijado en la creación: `source=OWNER` (autor = `user.id` del propietario) o `source=WORKSHOP` (autor = `memberId`). La verificación **nunca cambia el origen**: es una afirmación del taller superpuesta.
- El `source` se deriva del contexto activo (nunca del body): PERSONAL → OWNER, WORKSHOP → WORKSHOP.

### D-064 — Confianza como nivel discreto, no puntaje

- `CareEpisodeVerification { unverified | verified }` (minúsculas, convención del repo). `verified` **implica** verificación por taller (solo talleres pueden verificar).
- Mapping de UI **source-aware**: `source=workshop` → "Registrado por {taller}" ignorando `verification` (nunca mostrar "Registrado por el propietario" para episodios de taller); `source=owner` → "Registrado por el propietario" (si `unverified`) / "Verificado por {workshop}" (si `verified`).
- Se descarta el puntaje numérico 4/10 (regla arbitraria sin datos para sostenerla). Escala 1-10 futura (si llega) se deriva de estos niveles.
- El taller **no puede** verificar episodios `source=workshop` (ya son confiables por origen) ni episodios de otros talleres.

### D-065 — Estado de nacimiento según fuente

- `source=OWNER`: nace `delivered` (el servicio ya se hizo; puede ser retroactivo). `serviceDate` puede ser pasada (no futura).
- `source=WORKSHOP`: nace `open` (check-in, flujo F-020 intacto).

### D-066 — Taller responsable (XOR)

- Al crear un episodio owner, el propietario indica el taller de una de dos formas, **mutuamente excluyentes**:
  - **En la app:** busca el taller por nombre (`GET /api/workshops/search?q=`) → `workshopId` (la cola de verificación de ese taller verá el episodio).
  - **Texto libre:** `workshopName` (el taller no está en la app; queda sin verificación posible hasta que se registre y reclame — fuera de alcance MVP).
- Si elige taller de la app, ese taller lo ve en su cola de verificaciones y puede confirmar o ignorar. No hay "rechazo" en MVP (evita feedback loops; el propietario no pierde nada: su registro queda `unverified`).

### D-067 — Permiso nuevo `care-episode.verify` (owner + mechanic)

- Convención: `module: 'care-episode', resource: 'care-episode', action: 'verify'`. Employee NO. Seed idempotente (patrón F-020).

### D-068 — Km del episodio: informativo, NO genera `VehicleMileage`

- `mileageIn` del episodio OWNER es un dato del servicio, no un registro de kilometraje. La deuda #4 de F-020 (`mileageIn` → `VehicleMileage` con `source: workshop`) se difiere; si en F-024 se decide sincronizar, se hace a posteriori.

## 5. User Journey

```
Actor: Pedro (propietario del Onix, contexto PERSONAL)
  ↓
En /vehicles/[id] pulsa "Registrar servicio" (solo owner)
  ↓
Formulario: título "Cambio de aceite + 2 neumáticos" (req),
  fecha del servicio 2026-06-15 (req, no futura), km 18.500 (opc),
  notas (opc)
  ↓
Taller responsable: busca "Lubricentro" en la app → selecciona "Lubricentro Central"
  (o elige "Otro taller" → escribe "Taller de la esquina")
  ↓
POST /api/care-episodes/owner (contexto PERSONAL) → 201
  ↓
Episodio: source=owner, status=delivered, verification=unverified
  Feedback: "Servicio registrado — quedará como 'Registrado por el propietario' hasta que
  Lubricentro Central lo verifique"
```

```
Actor: Recepcionista del taller (owner/mechanic, contexto WORKSHOP — Lubricentro Central)
  ↓
En el header selecciona "Lubricentro Central" → clic en "Verificaciones"
  ↓
GET /api/care-episodes/verifications → episodio de Pedro (Onix ABC123, "Cambio de aceite + 2 neumáticos",
  2026-06-15, km 18.500, propietario "Pedro ...") con badge "Pendiente de verificación"
  ↓
Reconoce el trabajo → clic "Confirmar" → POST /api/care-episodes/:id/verify → 200
  ↓
Episodio → verification=verified, verifiedByMemberId, verifiedAt
  Se emite care-episode.verified
```

### Flujo alternativo: episodio ajeno al taller
```
  → Miembro de taller intenta confirmar un episodio cuyo workshopId != contexto → 404 (no revelar existencia)
  → Intenta confirmar un episodio source=workshop → 403 (ya es confiable por origen)
  → Intenta confirmar uno ya verified por ESTE taller → 200 idempotente (devuelve estado actual)
  → Intenta confirmar uno ya verified por OTRO taller → 409
```

### Flujo alternativo: contexto incorrecto
```
  → Taller crea episodio en PERSONAL → 403 (ruta WORKSHOP intacta con WorkshopOnlyGuard, D-024 A2)
  → Propietario (o cualquiera) intenta POST /care-episodes/owner en WORKSHOP/PLATFORM → 403 (handler exige ctx.type PERSONAL)
  → El source nunca viene del body: la ruta /owner es OWNER por definición, la ruta /care-episodes es WORKSHOP por definición
```

## 6. Reglas de Negocio / Requisitos Funcionales

### RF-1: Creación de episodio owner — RUTA SEPARADA `POST /api/care-episodes/owner` (contexto PERSONAL)

- **Decisión TL (ajuste #3):** el path del propietario es una ruta separada `POST /api/care-episodes/owner`; `POST /api/care-episodes` queda 100% intacto con su matriz de guards de F-020 (evita debilitar el enforcement y preserva los tests existentes). El `source` es una constante del path (jamás del body — D-063 escrito en piedra).
- Guards: `JwtAuthGuard` + `ContextGuard` (clase) + **`ThrottlerGuard` con `@Throttle 30/60s`** (anti-spam) en el método. **Sin** `PermissionsGuard` (los permisos son de contexto taller; el propietario se autentica con ownership — RF-6).
- En el handler:
  - Exige `ctx.type === 'PERSONAL'` → 403 si WORKSHOP/PLATFORM.
  - Exige `assertOwnership` sobre `vehicleId` (vehículo inexistente → 404; no owned → 403).
  - `title` requerido, `MaxLength(120)`.
  - `serviceDate` requerido, **no futura**: comparar contra **fin de día UTC actual** (tolerancia de huso documentada; sin usar `user.timezone` — sobre-ingeniería en MVP).
  - `mileageIn` opcional (`@IsInt @Min(0)`).
  - `notes` opcional (`MaxLength(1000)`). **Decisión PM (ajuste #5):** campos de taller (`branchId`/`appointmentId`/`customerComplaint`/`internalNotes`) enviados a esta ruta son **stripped silenciosamente** por el `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: false`, main.ts) — NO se agrega rechazo duro (consistencia con el repo; protección equivalente).
  - Taller responsable XOR: `workshopId` (taller existente y activo → 404 si no) **o** `workshopName` (`MaxLength(150)`). Ninguno o ambos → `400 BadRequest` (no 422: el repo usa `BadRequestException`/`ConflictException` con códigos — ser consistente).
  - Persiste `source='owner'`, `status='delivered'`, `verification='unverified'`, `serviceDate`, `createdByUserId=user.id`, `checkedInAt=null`, `createdByMemberId=null` + `workshopId` si taller de app (perfil `branchId=null`).
  - Emite `care-episode.created` (payload extendido: + `source`; `workshopId`/`createdByMemberId` nullables).

### RF-2: Flujo WORKSHOP intacto (contexto WORKSHOP)
- `POST /api/care-episodes` conserva exactamente el comportamiento F-020 (guards `Jwt+Context` clase + `WorkshopOnly+Permissions` método, `care-episode.create`, workshopId/branchId/createdByMemberId del contexto, estado `open`, `source='workshop'`). **Cero cambios** en contrato, handler y tests existentes.

### RF-3: Búsqueda pública acotada de talleres para el propietario
- `GET /api/workshops/search?q=...` (JwtAuthGuard, SIN membresía): busca talleres **activos** por nombre, case-insensitive. **Decisión TL (ajuste #4):** handler `SearchWorkshopsHandler` + **controller nuevo `@Controller('workshops')` registrado ANTES de `WorkshopsController`** en `workshops.module.ts` (el `@Get(':id')` de WorkshopsController capturaría `GET /workshops/search`; precedente: `PublicWorkshopController`). NO reutilizar `ListWorkshopsHandler` (exige membresía).
- Query: `q` mínimo 2 chars (`MaxLength(50)`); `contains` + `mode: 'insensitive'` con **`escapeLike()`** (escape `\`, `%`, `_` — Prisma no escapa automáticamente y `q="%%%"` matchearía todo); orden nombre asc; `limit: 10`.
- Sin match → **`200 []`** (semántica de búsqueda).
- Devuelve SOLO: `id`, `name`, `logoUrl?`, `city` (branch headquarters, patrón de `ListWorkshopsHandler`). Sin taxId, sin email, sin branches.
- Anti-abuso: `ThrottlerGuard` + `@Throttle 30/60s` (mecanismo existente).

### RF-4: Cola de verificaciones del taller (contexto WORKSHOP)
- `GET /api/care-episodes/verifications` (WorkshopOnly + `care-episode.verify`):
  - Episodios con `source='owner'`, `verification='unverified'`, `workshopId = ctx.workshopId`.
  - Orden: `serviceDate` asc (más antiguos primero, prioridad de atención). **`limit` default 50, max 100** (anti-scraping interno).
  - Devuelve por episodio: `id`, `title`, `serviceDate`, `mileageIn?`, `notes?` + vehículo (`licensePlate`, `brand`, `model`, `version`, `manufactureYear` — join catálogo) + propietario (`firstName`, `lastName` — sin email, PII mínimo: el taller está confirmando trabajo de un cliente identificable por placa+nombre).

### RF-5: Confirmar verificación (contexto WORKSHOP)
- `POST /api/care-episodes/:id/verify` (WorkshopOnly + `care-episode.verify`):
  - **Atomicidad (ajuste #6):** `updateMany({ where: { id, workshopId: ctx.workshopId, source: 'owner', verification: 'unverified' }, data: { verification: 'verified', verifiedByMemberId: ctx.memberId, verifiedAt: new Date() } })`.
  - Si `count === 0` → re-leer y decidir: no existe → 404; `source='workshop'` → 403 (el taller conoce sus check-ins, ya confiables); ya `verified` por ESTE taller → 200 idempotente (devuelve estado); ya `verified` por OTRO taller → 409; `workshopId` de otro taller → **404** (no revelar existencia).
  - Emite `care-episode.verified` (payload: `{ careEpisodeId, vehicleId, workshopId, verifiedByMemberId, verifiedAt }`).
  - El propietario NO puede llamar este endpoint (WorkshopOnly).
  - Foot-gun registrado: la ruta estática `verifications` y `POST :id/verify` conviven hoy sin colisión (no existe `GET :id` ni `POST :id`); si en F-021/F-022 se agrega `:id`, declarar las rutas estáticas primero (patrón F-012).

### RF-6: Permisos y seed
- Nuevo `care-episode.verify` (owner + mechanic). Seed idempotente.
- El path OWNER del POST NO exige `PermissionsGuard` (los permisos son de contexto taller; el propietario se autentica con ownership).

### RF-7: Sin cambios en los writes existentes de maintenance
- ServiceRecord/WorkOrder/Estimate intactos (RF-6 de F-020 se mantiene). `source=OWNER` NO genera service records.

### RF-8: Frontend
- **Ruta propietario (ajuste #9):** `(dashboard)/vehicles/[id]/servicios/nueva` con `vehicleId` vía `useParams` (heredó el layout dashboard; el proxy ya protege `/vehicles/*` → sin cambios de proxy). Form: título, fecha (date picker, máx hoy), km, notas, taller responsable (búsqueda con debounce + "Otro taller" texto libre). Éxito con aclaración de confianza `unverified`.
- **Botón "Registrar servicio"** en el detalle `/vehicles/[id]`: visible solo si `isVehicleOwner && activeContext?.type === 'PERSONAL'` (un owner con taller seleccionado ve el flujo taller).
- **Página taller "Verificaciones"**: ruta nueva bajo el dashboard, link condicionado a `activeContext?.type === 'WORKSHOP'` (mismo patrón del link "Nueva atención"). Lista de la cola + badge "Pendiente de verificación" + detalle mínimo + botón "Confirmar" (con confirmación) + estados (éxito, 403/404/409).
- La página "Nueva atención" existente (`/atenciones/nueva`) **NO se bifurca** — sigue siendo del taller (contexto WORKSHOP); el journey del propietario vive en su ruta propia bajo `/vehicles/[id]/servicios/nueva`.
- Tipos frontend: `CareEpisodeSource ('workshop'|'owner')`, `CareEpisodeVerification ('unverified'|'verified')` (valores reales del enum, minúsculas), `WorkshopSearchResult`, `CareEpisodeVerificationItem`; funciones API nuevas (`searchWorkshops`, `getCareEpisodeVerifications`, `verifyCareEpisode`).
- El inyector de contexto actual (auth/* excluido, logout reset) NO cambia.

## 7. Contrato Backend (validado por TL — ajustes aplicados)

### Migración Prisma (aditiva)
```prisma
// EN CareEpisode — CAMBIOS
workshopId        String?   @map("workshop_id") @db.Uuid          // NULLABLE (era NOT NULL)
branchId          String?   @map("branch_id") @db.Uuid            // NULLABLE
createdByMemberId String?   @map("created_by_member_id") @db.Uuid // NULLABLE
checkedInAt       DateTime? @map("checked_in_at") @db.Timestamptz // NULLABLE (owner no hace check-in)
// NUEVOS CAMPOS
source            CareEpisodeSource @default(workshop)  // 'workshop' conserva los registros existentes
verification      CareEpisodeVerification @default(unverified)
title             String?   @map("title") @db.VarChar(120)        // requerido en owner
serviceDate       DateTime? @map("service_date") @db.Timestamptz  // requerido en owner (pasada/hoy)
workshopName      String?   @map("workshop_name") @db.VarChar(150) // texto libre XOR workshopId
createdByUserId   String?   @map("created_by_user_id") @db.Uuid   // autor owner (auditoría)
verifiedByMemberId String?  @map("verified_by_member_id") @db.Uuid // FK WorkshopMember
verifiedAt        DateTime? @map("verified_at") @db.Timestamptz

// RELACIONES opcionales (obligatorio en Prisma al hacer NULLABLE las FKs) + back-relations:
workshop          Workshop?       @relation(fields: [workshopId], references: [id], onDelete: Restrict)
branch            WorkshopBranch? @relation(fields: [branchId], references: [id], onDelete: Restrict)
createdByMember   WorkshopMember? @relation(fields: [createdByMemberId], references: [id], onDelete: Restrict)
createdByUser     User?           @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)
verifiedByMember  WorkshopMember? @relation("VerifiedCareEpisodes", fields: [verifiedByMemberId], references: [id], onDelete: Restrict)
// En User: careEpisodesCreated CareEpisode[]
// En WorkshopMember: verifiedCareEpisodes CareEpisode[] (relación "VerifiedCareEpisodes")

enum CareEpisodeSource { workshop owner }
enum CareEpisodeVerification { unverified verified }
```
- Registros existentes (F-020, todos de taller): `source` default `workshop`, `verification` default `unverified` — backfill automático por default constante (metadata-only en PG), sin datos manuales.
- Índices añadidos: `@@index([workshopId, source, verification])` (cola), `@@index([createdByUserId])` (auditoría propietario). Sin nombres custom (Prisma auto-genera).
- Regla Cross/campo: `source='owner'` → exigir `title`+`serviceDate`+`createdByUserId`; `workshopId` XOR `workshopName`; `source='workshop'` → exigir `workshopId`+`branchId`+`createdByMemberId`+no `title` ni `serviceDate`. **Sin CHECKs SQL en esta migración** (decisión TL): los dos paths se enforcean con dos handlers separados (una sola fuente de verdad por path) + tests de matriz. Si se quiere garantía DB-level, migración aparte en F-021.

### Endpoints
| Ruta | Contexto | Guard/Permiso | Descripción |
|---|---|---|---|
| `POST /api/care-episodes` | WORKSHOP | Jwt + Context (clase); WorkshopOnly + Permissions (método) + `care-episode.create` | **INTACTO (F-020)** — flujo taller, `source='workshop'` |
| `POST /api/care-episodes/owner` | PERSONAL | Jwt + Context (clase); Throttler 30/60s (método); **sin** PermissionsGuard | Flujo owner (RF-1): `assertOwnership` + validación owner + XOR; `source='owner'` constante del path |
| `GET /api/workshops/search?q=` | PERSONAL o WORKSHOP | JwtAuth | Búsqueda pública acotada (RF-3) + Throttle 30/60s; controller nuevo ANTES de WorkshopsController |
| `GET /api/care-episodes/verifications` | WORKSHOP | WorkshopOnly + `care-episode.verify` | Cola del taller (RF-4) |
| `POST /api/care-episodes/:id/verify` | WORKSHOP | WorkshopOnly + `care-episode.verify` | Confirmar (RF-5, idempotente) |

- El evento `care-episode.created` se extiende con `source` (payload: `workshopId`/`createdByMemberId` pasan a nullables; + `createdByUserId?`). Nuevo evento `care-episode.verified` con `verifiedAt` (BaseEvent). Sin listeners nuevos (grep: no hay `@OnEvent('care-episode.*')`).
- No se modifica ni un carácter del POST WORKSHOP actual ni de sus tests (la ruta `/owner` es un sub-ruteo adicional, precedente: `invitations/accept`, `lookup`, `transfers/incoming`).

### DTO (dos DTOs, uno por ruta — ajuste #6)
```typescript
// INTACTO (F-020): CreateCareEpisodeDto { vehicleId, branchId, appointmentId?, mileageIn?, customerComplaint?, customerNotes?, internalNotes? }

// NUEVO para POST /care-episodes/owner:
CreateOwnerCareEpisodeDto {
  vehicleId!: string;            @IsUUID()
  title!: string;                @IsString @MaxLength(120)
  serviceDate!: string;          @IsDateString  // validar "<= fin de día UTC" en handler
  workshopId?: string;           @IsUUID   // XOR con workshopName
  workshopName?: string;         @IsString @MaxLength(150) // XOR con workshopId
  mileageIn?: number;            @IsInt @Min(0)
  notes?: string;                @MaxLength(1000)
}
// XOR + fecha no futura + campos rechazables por whitelist: validación manual en handler (class-validator no expresa XOR limpiamente)
```

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Migración aditiva (nullable + source + verification + campos owner + back-relations + índices).
- `POST /api/care-episodes/owner` (nuevo handler + DTO + evento extendido) — POST de taller INTACTO.
- `GET /api/workshops/search?q=` (búsqueda pública acotada; controller nuevo antes de WorkshopsController).
- `GET /api/care-episodes/verifications` + `POST /api/care-episodes/:id/verify` + evento `care-episode.verified`.
- Permisos `care-episode.verify` + seed.
- Frontend: "Registrar servicio" (propietario, ruta `/vehicles/[id]/servicios/nueva`) + "Verificaciones" (taller) + tipos/funciones API.
- Tests (backend 3 suites nuevas ~15-20 tests; frontend ~15-20 tests).

### Fuera (siguientes iteraciones)
- Editar/borrar episodio (F-021), cerrar (F-022), listado episodios del taller completo (F-023), timeline con episodios + sello de confianza (F-024).
- "Reclamo" de un taller escrito en texto libre (reclamar workshopName → workshopId) — decisión futura.
- Rechazo/desvinculación de verificación (el taller solo confirma o ignora en MVP).
- Escala 1-10 derivada (decisión futura sobre D-064).
- `mileageIn` → `VehicleMileage` (D-068 difiere).

## 9. Criterios de Aceptación

- [ ] Dado el owner vigente en contexto PERSONAL, cuando crea en `POST /api/care-episodes/owner` con `title`+`serviceDate` pasada+`vehicleId` owned, entonces responde 201 con `source='owner'`, `status='delivered'`, `verification='unverified'`, `serviceDate`, `workshopId` o `workshopName` (nunca ambos), `checkedInAt=null`, `createdByUserId=user.id`.
- [ ] Dado el owner en PERSONAL con vehículo no owned, cuando crea en `/owner`, entonces 403. Vehículo inexistente → 404.
- [ ] Dado `serviceDate` posterior al fin de día UTC actual, entonces `400 BadRequest`.
- [ ] Dado el XOR sin taller o con ambos (`workshopId`+`workshopName`), entonces `400 BadRequest`.
- [ ] Dado cualquier request en `POST /api/care-episodes/owner` desde contexto WORKSHOP/PLATFORM, entonces 403 (el handler exige `ctx.type === 'PERSONAL'`).
- [ ] Dado un POST en `/api/care-episodes` (WORKSHOP), entonces conserva el flujo F-020 (`source='workshop'`, `status='open'`, `care-episode.create`); un body con `source:'owner'` es stripped por whitelist — el source es constante del path (D-063).
- [ ] Dado un miembro de taller (owner/mechanic) en WORKSHOP, cuando consulta `GET /care-episodes/verifications`, entonces ve solo episodios `source='owner'`+`'unverified'`+`workshopId=ctx` (≤50 default), ordenados por `serviceDate` asc, con placa + brand/model + nombre del propietario (sin email).
- [ ] Dado un episodio OWNER de su taller en `unverified`, cuando confirma (`POST /:id/verify`), entonces 200, `verification='verified'`, `verifiedByMemberId=ctx.memberId`, `verifiedAt` seteado y se emite `care-episode.verified`.
- [ ] Dado un episodio de otro taller → 404. Dado `source='workshop'` → 403. Dado ya verificado por ESTE taller → 200 idempotente; por otro taller → 409.
- [ ] Dado el propietario en PERSONAL, cuando intenta `POST /:id/verify`, entonces 403 (WorkshopOnly).
- [ ] Dado `GET /api/workshops/search?q=` autenticado (sin membresía), entonces devuelve `200 []` sin match o ≤10 talleres activos con solo `id`/`name`/`logoUrl?`/`city`; sin taxId/email/branches; `q` de 1 char → 400; throttle 30/60s activo.
- [ ] Regresión: el flujo WORKSHOP de F-020 (POST + lookup con throttle 30/60s), los journeys PERSONAL F-010..F-014 y el inyector de contexto no se rompen.

### Build / Calidad
- [ ] Backend: `npm test` verde (baseline 29 suites/264 tests + nuevos) + build OK.
- [ ] Frontend: `npm test` verde (baseline 13 files/122 tests + nuevos) + build OK.
- [ ] Migración aditiva aplicada en dev (sin `db:reset`); los episodios existentes conservan `source=workshop`.
- [ ] Seed idempotente con `care-episode.verify`.
- [ ] Sin dependencias nuevas.

## 10. Dependencias

- F-020 (modelo CareEpisode, contexto WORKSHOP frontend, inyector, `care-episode.create`).
- `VehicleAccessService.assertOwnership` (existe en `src/common/authorization/vehicle-access.service.ts:142`).
- `@nestjs/throttler` (existe, add-on por endpoint).
- ADR-005 T3/T4 (histórico, Restrict — la migración no cambia FKs existentes).

## 11. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Dualidad del POST (PERSONAL/WORKSHOP) debilitando enforcement | **Eliminado por diseño** | Dos rutas separadas: `POST /care-episodes` (guards F-020 intactos) y `POST /care-episodes/owner` (sin PermissionsGuard, Throttler 30/60s). El source es constante del path, nunca del body. Tests de matriz para ambos. |
| FKs NOT NULL → NULLABLE en tabla con datos (workshopId/branchId/createdByMemberId) | Media | Aditiva metadata-only en PostgreSQL (sin reescritura); relaciones opcionales + back-relations en Prisma; validar con Database. |
| Abuso del formulario del propietario (spam de episodios no verificados) | Media | ThrottlerGuard 30/60s en `POST /owner`; los episodios quedan visibles como `unverified` (incentivo a no inflar); auditoría vía `createdByUserId`. |
| Propietario asocia talleres random a sus episodios (spam de cola del taller) | Media | El taller solo ve su cola (limit 50/100) y confirma o ignora; no hay costo para el taller; auditoría (`verifiedByMemberId`). |
| PII: el taller ve nombre completo + placa del propietario en la cola | Media | Solo firstName+lastName+placa (sin email/teléfono); el taller confirma trabajo de un cliente que lo declaró; revisión de Security antes de implementar. |
| `serviceDate` futura con husos | Baja | Comparación contra fin de día UTC en el handler (tolerancia documentada; sin `user.timezone` — sobre-ingeniería en MVP). |
| Migración de enums: Postgres enums `source`/`verification` | Baja | Enums nuevos aditivos con default constante (source='workshop', verification='unverified'); sin renombrar existentes. |

---

*Fin de la especificación iteración 2-2 (v2, aprobada por TL).*