# Plan 03 — Inventario de huecos del repo (check-in de taller + reclamo de vehículo)

> **Autor:** sesión principal (verificación directa sobre el código) — **Fecha:** 2026-11-01
> **Fuentes:** `docs/designs/vehicle-claim-technical-design.md`, `docs/specs/workshop-checkin-flow.md`, `DECISION-REGISTER.md` §42, `docs/plans/01-scope-acceptance.md`, `docs/plans/00-frontend-copy-context.md`.
> **Naturaleza:** inventario **verificado** de lo que falta en el código para implementar el MVP. No propone diseño nuevo: dice qué existe, qué no, y con qué evidencia.
> **Regla:** todo hueco cita `archivo:línea` del estado actual del repo. Si algo no se pudo verificar, se dice explícitamente.

---

## 0. Método

Se revisó, en este repo:

- `prisma/schema.prisma` (modelos y enums de vehículo, atención, especialidad, titularidad, invitaciones).
- `src/common/authorization/vehicle-access.service.ts` (autorización de vehículo, incluida la asociación taller↔vehículo).
- `src/modules/care-episodes/**` (comandos, queries, controller, módulo, DTOs).
- `src/modules/vehicles/**` (alta de vehículo, historial, controller).
- `src/app.module.ts`, `src/config/envs.ts`, `src/common/mail/*`, `src/common/storage/*`.
- Frontend en `C:\Users\dario_xn6f7lj\Desktop\PROYECTOS\web-follow-app` (detalle en `00-frontend-copy-context.md`).

Cada hueco tiene un ID `G-xx` estable para que `02-backend-implementation.md` y `04-implementation-plan.md` lo referencien.

---

## 1. Resumen ejecutivo

| ID | Hueco | Severidad | Bloquea |
|---|---|---|---|
| G-01 | No existen modelos `ServiceType` / `ServiceTypeSpecialty` / `VehicleClaim*` / `VehicleMileageRange` | **Bloqueante** | PR-1, PR-2, PR-3, PR-6 |
| G-02 | `CareEpisode` no tiene tipo de atención, ni odómetro de salida, ni excepción de odómetro, ni motivo de cierre | **Bloqueante** | Fase C, PR-2 |
| G-03 | `Vehicle` / `User` no tienen `phoneE164` canónico ni país por defecto | **Bloqueante** | Fase B, PR-3 |
| G-04 | No existe transición `open → delivered` para atenciones de taller | **Bloqueante** | Fase C, PR-2, PR-7 |
| G-05 | `care_episodes` **no** está en el UNION de `assertWorkshopVehicleAccess` | **Alta** | Fase A–C (acceso del taller al vehículo que atendió) |
| G-06 | `RegisterVehicleHandler` rechaza el contexto `WORKSHOP` con 403 | **Alta** | Fase B (alta por placa desde el taller) |
| G-07 | `GET /care-episodes/:id` devuelve **404** cuando el taller B pide una atención del taller A (debería ser 403) | **Media** | Contrato de visibilidad multi-taller |
| G-08 | Los adjuntos devuelven 409 si la atención está `delivered` | **Alta** | Fase C (foto "después" + cierre) |
| G-09 | `CareEpisodesModule` sólo importa `AuthorizationModule` | **Media** | Fase C (evento de cierre → invite) |
| G-10 | No hay `DEFAULT_PHONE_COUNTRY_CODE` en `envs.ts` | **Alta** | Fase B (celular opcional) |
| G-11 | No existe módulo `vehicle-claims` (ni endpoints públicos ni de taller) | **Bloqueante** | PR-3..PR-7 |
| G-12 | No existe `GET /challenge`, `POST /verify`, `POST /commit` | **Bloqueante** | PR-4, PR-5 |
| G-13 | No hay QR persistido en storage para el invite | **Bloqueante** | PR-3 |
| G-14 | No hay bucket de throttle por token de reclamo | **Media** | PR-4 (anti-fuerza bruta) |
| G-15 | No existe listener `care-episode.closed → create invite` | **Bloqueante** | PR-7 |
| G-16 | No hay copy de P-2 (página pública + mails) | **Bloqueante de contenido** | PR-3, PR-6, PR-7 |
| G-17 | Frontend: no existe `/reclamo/[token]` ni `vehicle-claim` | **Bloqueante** | PR-6 |
| G-18 | Frontend: `?next=` sólo permite `/transfer/qr/<token>` | **Alta** | PR-6 (round-trip de registro/login) |
| G-19 | Frontend: `vehicle-claims/public/*` no está en las exclusiones de contexto ni de refresh | **Media** | PR-6 |
| G-20 | Frontend: no existe componente de radio / multiple choice | **Media** | PR-4 (verificación por kilometraje) |
| G-21 | `VehicleOwnership` tiene CHECK XOR persona/concesionaria | **Alta** (restricción, no hueco) | PR-5 (commit) |
| G-22 | El acceso del dueño reclamado **ya** está cubierto por la titularidad activa | — (no es hueco) | — |
| G-23 | No hay bucket de throttle por token (detalle de G-14) | **Media** | PR-2 |

**Lectura:** el MVP no es "agregar un módulo". Es **una migración de schema grande (G-01..G-03) + cerrar el ciclo de la atención (G-04..G-09) + un módulo nuevo (G-11..G-15) + frontend nuevo (G-17..G-20)**. Sin G-04 no hay invite; sin G-01 no hay dónde persistirlo.

---

## 2. Modelo de datos

### G-01 — No existen los modelos del dominio de reclamo ni el catálogo de tipos de atención

**Evidencia:** el schema tiene 54 modelos (`prisma/schema.prisma`) y **ninguno** se llama `ServiceType`, `ServiceTypeSpecialty`, `VehicleClaim`, `VehicleClaimInvite`, `VehicleClaimAttempt`, `VehicleMileageRange` ni `VehicleClaimDispute`. La lista completa incluye `Specialty`, `WorkshopSpecialty`, `CareEpisode`, `CareEpisodeAttachment`, `VehicleOwnership`, `VehicleShare`, `VehicleTransferQr`, pero nada de reclamo.

**Lo que sí existe y sirve de molde:**
- `Specialty` (`prisma/schema.prisma:553-561`): `code @unique`, `name`, `description`, relación con `WorkshopSpecialty`.
- `WorkshopSpecialty` (`:563-572`): tabla puente con `@@unique([workshopId, specialtyId])` — **el patrón exacto** que necesita `ServiceTypeSpecialty`.
- `VehicleTransferQr` (`:827`): token con estado (`pending`/`accepted`/`expired`/`revoked`), `expiresAt`, QR. Es el precedente más cercano a `VehicleClaimInvite`, pero **no** tiene `tokenHash @unique` ni `qrObjectKey`.

**Impacto:** sin estos modelos no hay catálogo de 14 tipos (D-166..D-169), no hay invite, no hay intentos, no hay rangos de kilometraje para el multiple choice (F-3).

**Bloquea:** PR-1 (schema + catálogo), PR-2 (tipos en la atención), PR-3 (invite), PR-6 (intentos/lock).

---

### G-02 — `CareEpisode` no tiene los campos que el check-in exige

**Evidencia — campos actuales** (`prisma/schema.prisma:963-1005`):

```
id, vehicleId, workshopId, branchId, appointmentId, createdByMemberId,
status, mileageIn, customerComplaint, customerNotes, internalNotes,
checkedInAt, closedAt, createdAt, updatedAt, createdByUserId,
serviceDate, source, title, verification, verifiedAt, verifiedByMemberId,
workshopName
```

**Falta, contra `docs/specs/workshop-checkin-flow.md`:**

| Necesidad del spec | Campo que no existe |
|---|---|
| Tipo de atención (14 tipos, M:N con especialidad) | `serviceTypeId` (FK) — **no hay ninguna relación con `Specialty`** |
| Odómetro obligatorio con excepción "no legible" | sólo existe `mileageIn`; falta `mileageOut`, `mileageSource` (leído / no legible), `mileageNotReadableReason`, `mileageExceptionNote` |
| Excepción "tablero reemplazado" | falta flag/motivo explícito |
| Cierre con odómetro de salida | falta `mileageOut` + validación contra máximo histórico |
| Quién cerró | falta `closedByMemberId` |
| Motivo de cierre / resultado | falta `closeNotes` o equivalente |
| Fotos "antes / durante / después" | **existe**: `CareEpisodeAttachmentPhase` con `before | work | after` (`:1370-1374`) |
| Notas internas invisibles al dueño | **existe**: `internalNotes` (`:975`) |
| Fecha de servicio | **existe**: `serviceDate` (`:982`) |

**Impacto:** el check-in unificado (D-161) no se puede persistir completo. El odómetro obligatorio (decisión central del spec) no tiene dónde guardar la excepción.

**Bloquea:** Fase B y C del spec, PR-2.

---

### G-03 — No hay teléfono canónico ni país por defecto

**Evidencia:**
- `User.phone String? @db.VarChar(30)` (`prisma/schema.prisma:16`), `Workshop.phone` (`:199`), `Dealership.phone` (`:232`), `WorkshopBranch.phone` (`:364`). **No hay** `phoneE164`, `phoneArea`, `phoneCountry`.
- `src/config/envs.ts` no tiene ninguna variable `PHONE*`; `FRONTEND_URL` sí existe con default `http://localhost:3000` (`:122`).

**Impacto:** el spec exige E.164 canónico para construir `wa.me` (D-172), dos inputs (área + número) sin longitud fija, y `DEFAULT_PHONE_COUNTRY_CODE` con default `+54` (R-11 del PM: **no** puede ser requerida en Joi o rompe todos los entornos).

**Bloquea:** Fase B (alta con celular opcional), PR-3 (`whatsappUrl`).

---

### G-21 — `VehicleOwnership.userId` es nullable pero hay un CHECK XOR en la base

**Evidencia:** `VehicleOwnership.userId String?` (`prisma/schema.prisma:777`) y `dealershipId String?` (`:786`). La migración `vehicle_ownerships_owner_xor` exige persona XOR concesionaria. **No se verificó el nombre exacto de la constraint en este pase** — hay que confirmarlo con `prisma/migrations/**` antes de escribir la migración de reclamo.

**Impacto:** al comprometer el reclamo hay que crear una `VehicleOwnership` de persona. Si el vehículo venía de una concesionaria, hay que **cerrar** (`endsAt`) la titularidad anterior en la misma transacción, o el CHECK/UNIQUE falla.

**Bloquea:** PR-5 (commit del reclamo). **No** es un hueco de diseño: es una restricción que la implementación debe respetar.

---

## 3. Autorización

### G-05 — `care_episodes` no está en el UNION de asociación taller↔vehículo

**Evidencia:** `assertWorkshopVehicleAccess` (`src/common/authorization/vehicle-access.service.ts:488-516`) valida membresía activa y después busca asociación con:

```sql
SELECT workshop_id FROM appointments ...
UNION SELECT workshop_id FROM work_orders ...
UNION SELECT workshop_id FROM estimates ...
UNION SELECT workshop_id FROM service_records ...
```

**No incluye `care_episodes`.**

**Impacto:** un vehículo que el taller atendió **sólo** vía check-in (sin turno, sin orden de trabajo, sin presupuesto) queda fuera de `assertVehicleAccess` en modo WORKSHOP. Eso rompe: ver el vehículo, ver el historial, adjuntar fotos y — crítico — generar el invite de reclamo desde el cierre.

**Bloquea:** Fase A–C y PR-7.

**Nota:** el propio handler de `get-care-episode` documenta el hueco: *"NO se usa assertWorkshopVehicleAccess (gap conocido: su SQL union no…)"* (`src/modules/care-episodes/queries/get-care-episode/get-care-episode.handler.ts:24`).

**Corrección al spec (B-3 desactualizado):** `docs/specs/workshop-checkin-flow.md:507` dice que `GET /vehicles/:id/history` usa el check **strict** (`assertOwnershipOrSharedAccess`). **Ya no es así**: el controller llama a `assertVehicleAccess(id, user, ctx)` (`src/modules/vehicles/controllers/vehicles.controller.ts:734`), que es el modo **full** e incluye la rama WORKSHOP. Por lo tanto el historial ya está habilitado para talleres; lo único que falta es la pata `care_episodes` del UNION (G-05) para que un vehículo atendido sólo por check-in pase el filtro. No hace falta tocar el controller.

---

### G-06 — El alta de vehículo rechaza el contexto WORKSHOP

**Evidencia:** `src/modules/vehicles/commands/register-vehicle/register-vehicle.handler.ts:53-57`:

```ts
if (ctx.type === 'WORKSHOP' || ctx.type === 'PLATFORM') {
  throw new ForbiddenException('La operación no está permitida desde este contexto');
}
```

**Impacto:** el check-in unificado (D-161) dice "placa → reutilizar o crear `Vehicle` + `CareEpisode(open)` en una transacción". Hoy el taller no puede crear el vehículo: el flujo tiene que vivir en `vehicle-claims`/`care-episodes`, no en `POST /vehicles`.

**Decisión de implementación:** **no** abrir `RegisterVehicleHandler` a WORKSHOP (ampliaría superficie de escritura sobre `/vehicles/*`). Crear el vehículo desde el nuevo comando de check-in, reutilizando el servicio de normalización de placa si existe. **Bloquea:** Fase B.

---

### G-07 — `GET /care-episodes/:id` devuelve 404 en vez de 403 para otro taller

**Evidencia:** `src/modules/care-episodes/queries/get-care-episode/get-care-episode.handler.ts:191-203`:

```ts
if (episodeWorkshopId !== ctx.workshopId) {
  throw new NotFoundException('CareEpisode', careEpisodeId);
}
```

**Impacto:** el spec de visibilidad multi-taller (D-173) exige que un taller **pueda** leer la atención de otro taller (todo salvo `internalNotes` y PII del propietario). Hoy la lectura cross-taller es 404, así que la visibilidad multi-taller no existe.

**Bloquea:** contrato de visibilidad. **No** bloquea el happy path del piloto (un solo taller), pero sí la decisión ya tomada.

---

### G-22 — El acceso de lectura del dueño reclamado no está cubierto por ningún flujo existente

**Evidencia:** `assertOwnershipOrSharedAccess` acepta titularidad activa (`:120-124`), `VehicleAccess` vigente (`:127-136`), concesionaria (`:143-150`) y super_admin (`:152-154`). El reclamo crea una `VehicleOwnership`, así que **el acceso del dueño queda cubierto por el paso 2** sin tocar el servicio.

**Conclusión:** no es un hueco. Se documenta para que no se invente autorización nueva en PR-5.

---

## 4. Ciclo de vida de la atención

### G-04 — No existe la transición `open → delivered` para atenciones de taller

**Evidencia:** grep de `delivered` en `src/**/*.ts` devuelve 19 matches y **ninguno** es un update de estado desde `open`. El único lugar que escribe `status: 'delivered'` es `create-owner-care-episode.handler.ts:168`, que **nace** entregada (`source='owner'`). No hay `close-care-episode` en `src/modules/care-episodes/commands/` (la carpeta sólo tiene `attach-care-episode-attachments`, `create-care-episode`, `create-owner-care-episode`, `remove-care-episode-attachment`, `verify-care-episode`).

**Impacto:** sin cierre no hay `closedAt`, no hay odómetro de salida, no hay evento `care-episode.closed`, no hay invite de reclamo. **Es el hueco que corta la cadena del GTM "taller primero".**

**Bloquea:** Fase C, PR-2, PR-7.

---

### G-08 — Los adjuntos se rechazan con 409 si la atención está `delivered`

**Evidencia:** `src/modules/care-episodes/commands/attach-care-episode-attachments/attach-care-episode-attachments.handler.ts:243-248`:

```ts
episode.status === 'delivered' ||
episode.status === 'cancelled' || ...
  throw new ConflictException(...)
```

**Impacto:** si el taller sube la foto "después" **antes** de cerrar, funciona; si la sube después, 409. El spec recomienda la foto `before` como no bloqueante y permite fotos en cualquier momento del check-in, pero el cierre congela. Hay que decidir en implementación: (a) exigir que las fotos se suban antes del cierre (simple, sin cambio), o (b) permitir `phase='after'` post-cierre con ventana. **El diseño ya eligió (a) implícitamente**; se documenta como restricción operativa del panel, no como cambio de código.

**Bloquea:** sólo si el copy del panel promete subir fotos después del cierre.

---

### G-09 — `CareEpisodesModule` no importa `VehiclesModule` ni `MailModule`

**Evidencia:** `src/modules/care-episodes/care-episodes.module.ts:16` → `imports: [AuthorizationModule]`. `MailModule` y `StorageModule` son globales en `AppModule` (`src/app.module.ts:56-57`), así que **no hace falta importarlos**; `VehiclesModule` sí sería necesario si el cierre reutiliza handlers de vehículo.

**Impacto:** bajo, pero define la forma del wiring: el listener de cierre puede vivir en `vehicle-claims` (módulo nuevo) y escuchar el evento, sin que `care-episodes` dependa del módulo de reclamos. **Recomendación:** mantener la dependencia en un solo sentido (`vehicle-claims` escucha `care-episode.closed`).

---

### G-15 — No existe el listener que genera el invite al cerrar

**Evidencia:** los eventos existentes son `care-episode-created`, `care-episode-verified`, `care-episode-attachment-added`, `care-episode-attachment-removed` (`src/modules/care-episodes/events/`). **No hay** `care-episode.closed`.

**Impacto:** R-9 del PM: si la Fase C shippea antes que PR-7, los cierres ocurren **sin listener** y no se genera ningún invite — silenciosamente. El plan de implementación debe forzar el orden cierre → listener en el mismo release, o dejar feature flag.

---

## 5. Módulo nuevo de reclamos

### G-11 / G-12 / G-13 / G-14 — No existe nada del módulo `vehicle-claims`

**Evidencia:** no hay `src/modules/vehicle-claims/`. No hay ningún endpoint `/challenge`, `/verify`, `/commit` (grep de `challenge|claimToken|reclamo` en `src/` → 0 matches relevantes). No hay uso de storage para QR de reclamo (sólo `VehicleTransferQr` guarda un `qrDataUrl`/similar, no un objeto en R2).

**Falta construir, según el diseño:**

| Pieza | Estado |
|---|---|
| `VehicleClaimInvite` con `tokenHash @unique`, `qrObjectKey`, `expiresAt`, `status` | no existe (G-01) |
| `POST /workshop/vehicles/:id/claim-invites` (crear/rotar/revocar) | no existe |
| `GET /public/vehicle-claims/:token/challenge` | no existe |
| `POST /public/vehicle-claims/:token/verify` | no existe |
| `POST /public/vehicle-claims/:token/commit` | no existe |
| Throttle por token (10 GET/min, 5 POST/5 min) | no existe; el `ThrottlerModule` sólo tiene el bucket global y `dealershipVehicleCreate` (`src/app.module.ts:39-54`) |
| Lock 5 fallos/15 min → 30 min; 3 lockouts → auto-revoke | no existe |
| Ticket JWT de 20 min post-verificación | no existe |
| QR en R2 | no existe para este caso |

**Impacto:** es el núcleo del PR-3..PR-7. **Bloquea:** todo el GTM.

---

## 6. Configuración y entorno

### G-10 — Falta `DEFAULT_PHONE_COUNTRY_CODE`

**Evidencia:** `src/config/envs.ts` no tiene ninguna clave `PHONE`. El patrón de validación es Joi con `.default(...)` para valores opcionales (`FRONTEND_URL` en `:122`).

**Impacto:** R-11 del PM. Si se agrega como `.required()`, **todos los entornos existentes rompen al arrancar** (incluido el CI y el piloto). Debe ser `Joi.string().pattern(/^\+\d{1,3}$/).default('+54')`.

**Bloquea:** Fase B.

---

### G-23 — No hay bucket de throttle por token de reclamo

**Evidencia:** `src/app.module.ts:39-54` define dos entradas: la global (`THROTTLE_TTL`/`THROTTLE_LIMIT`) y `dealershipVehicleCreate` (10/hora con `getTracker: req.user?.id ?? req.ip`).

**Impacto:** el diseño pide límites **por token**, que es distinto de por IP y de por usuario. Se implementa con un bucket nuevo + `getTracker` que lea el token del parámetro (o con `@Throttle` a nivel de handler si alcanza). **Decisión de implementación:** bucket nombrado `vehicleClaimToken` con `getTracker` sobre `req.params.token`; si el token no está, cae a IP.

---

## 7. Frontend

Detalle completo en `docs/plans/00-frontend-copy-context.md`. Acá sólo los huecos que condicionan el backend:

### G-17 — No existe `/reclamo/[token]`
Glob `web-follow-app/src/app/reclamo/**` → 0 archivos. **Bloquea:** PR-6.

### G-18 — `?next=` no admite `/reclamo/<token>`
`web-follow-app/src/lib/auth-redirect.ts:20` sólo permite `/^\/transfer\/qr\/[A-Za-z0-9._~-]+$/`. Sin esto, el copy "volvés a tu reclamo" es mentira. **Bloquea:** PR-6 (no el backend).

### G-19 — `vehicle-claims/public/*` fuera de las listas de `api.ts`
`web-follow-app/src/lib/api.ts:146-154` (`isContextFreePath`) y `:222-247` (skip del refresh 401) no incluyen la ruta nueva. **Impacto:** un 401 en el GET público dispara refresh y muestra un error distinto al copy terminal.

### G-20 — No hay componente de radio
Grep `type="radio"|RadioGroup` en `web-follow-app/src` → 0 matches. El multiple choice de kilometraje (F-3) no tiene precedente visual.

---

## 8. Activos reutilizables (no hay que construirlos)

| Activo | Ubicación | Para qué sirve |
|---|---|---|
| `MailService` con 15 métodos HTML inline | `src/common/mail/mail.service.ts` | Agregar `sendVehicleClaim*` siguiendo `sendWorkshopInvitationEmail` (`:751-774`) |
| `MAIL_TEMPLATES` | `src/common/mail/mail.types.ts:19-38` | Registrar los IDs nuevos |
| Storage R2 | `src/common/storage/storage-r2.service.ts`, `storage.service.ts` | Guardar el PNG del QR (`qrObjectKey`) |
| Guards `JwtAuthGuard`, `WorkshopOnlyGuard`, `PermissionsGuard` | `src/common/guards/` | Proteger los endpoints de taller |
| `CodedHttpException` + `ERROR_CODES` | `src/common/exceptions/` | Errores con código para el frontend |
| `EventEmitter2` | `src/app.module.ts:34` | Evento de cierre → invite |
| `ThrottlerModule` | `src/app.module.ts:39` | Buckets nombrados |
| Patrón comando/handler (`execute()`) | `src/modules/care-episodes/commands/**` | Estructura de los comandos nuevos |
| `CareEpisodeAttachmentPhase` (`before/work/after`) | `prisma/schema.prisma:1370` | Fotos del check-in |
| `Specialty` / `WorkshopSpecialty` | `prisma/schema.prisma:553-572` | Molde de `ServiceType` / `ServiceTypeSpecialty` |
| `VehicleTransferQr` | `prisma/schema.prisma:827` | Molde de estados del invite |

---

## 9. Riesgos de migración

| Riesgo | Evidencia | Mitigación |
|---|---|---|
| **CHECK XOR de titularidad** | `VehicleOwnership.userId` nullable (`:777`) + CHECK `vehicle_ownerships_owner_xor` | Al comprometer, cerrar la titularidad anterior (`endsAt`) y crear la nueva **en la misma transacción** |
| **`licensePlate @unique`** | `Vehicle.licensePlate String @unique` (`:697`) | El check-in debe normalizar (mayúsculas, sin guiones/espacios) **antes** de buscar/crear, o dos talleres crean dos vehículos para la misma placa |
| **`vin @unique` nullable** | `Vehicle.vin String? @unique` (`:698`) | El VIN es opcional; la verificación por últimos 4 no puede asumir que existe |
| **Migración con datos** | `prisma/migrations/` | `mileageIn` ya existe y puede tener datos; los campos nuevos deben ser nullable o con default |
| **Enums nuevos** | `CareEpisodeStatus` sólo tiene `open/delivered/cancelled` (`:1354-1358`) | **No** hace falta un estado nuevo para el cierre: `delivered` ya existe |
| **Seed de permisos** | `prisma/seed.ts` | Si se agregan permisos (`workshop.claim.*`), hay que sembrarlos o el guard rechaza |

---

## 10. Tests

**Estado:** `jest.config.js` con `rootDir: src` y `*.spec.ts` junto al código. Hay specs para todos los comandos/queries de `care-episodes` y para `vehicle-access`/`vehicles`.

**Lo que el diseño exige como obligatorio (3 críticos):**

1. **Guard `updateMany`**: el commit del reclamo debe usar `updateMany({ where: { id, status: 'pending' } })` y verificar `count === 1` para evitar doble consumo del token bajo concurrencia.
2. **Atomicidad del check-in**: vehículo + atención se crean en una transacción; si falla la atención, no queda vehículo huérfano.
3. **Contrato del GET pre-verificación**: no filtra PII ni datos del vehículo antes de verificar (anti-enumeración).

**Suites existentes que deben quedar verdes:** `care-episodes.controller.spec.ts`, los 5 specs de comandos, `get-care-episode.handler.spec.ts`, `vehicle-access.service` (si existe spec), `vehicles.controller.spec.ts`.

---

## 11. Lo que NO es un hueco (verificado, para no inventar)

| Se creía | Realidad |
|---|---|
| "Hay que crear un estado nuevo para la atención cerrada" | `CareEpisodeStatus` ya tiene `delivered` (`:1354-1358`) |
| "Hay que crear el campo de notas internas" | `internalNotes` ya existe (`:975`) |
| "Hay que crear las fases de fotos" | `CareEpisodeAttachmentPhase` ya tiene `before/work/after` (`:1370`) |
| "El dueño reclamado no tendrá acceso" | `assertOwnershipOrSharedAccess` ya acepta titularidad activa (`:120-124`) |
| "Hay que crear infra de mail" | `MailService` + `MAIL_TEMPLATES` existen |
| "Hay que crear infra de storage" | `StorageR2Service` existe |
| "Hay que instalar `@nestjs/cqrs`" | El repo usa comando/handler con `execute()`, sin CQRS (AGENTS.md) |
| "El historial del vehículo no existe" | `GET /vehicles/:id/history` existe (`vehicles.controller.ts:725`) y el handler ya arma timeline con atenciones (`get-vehicle-history.handler.ts:34-60`) |

---

## 12. Cómo verificar este inventario

```bash
# Modelos existentes
grep -n "^model " prisma/schema.prisma

# No hay módulo de reclamos
ls src/modules/vehicle-claims

# No hay cierre de atención
ls src/modules/care-episodes/commands

# UNION sin care_episodes
sed -n '500,516p' src/common/authorization/vehicle-access.service.ts

# Alta de vehículo bloquea WORKSHOP
sed -n '50,60p' src/modules/vehicles/commands/register-vehicle/register-vehicle.handler.ts

# 404 cross-taller
sed -n '185,205p' src/modules/care-episodes/queries/get-care-episode/get-care-episode.handler.ts

# Throttle actual
sed -n '39,54p' src/app.module.ts

# Env sin teléfono
grep -n "PHONE" src/config/envs.ts
```

---

## 13. Conclusión para el plan

El orden **no** es negociable por dependencias técnicas:

1. **Schema + catálogo** (G-01, G-02, G-03, G-10, G-21) — sin esto no compila nada nuevo.
2. **Cerrar el ciclo de la atención** (G-04, G-05, G-06, G-08) — sin esto no hay evento de cierre.
3. **Módulo de reclamos** (G-11..G-15) — consume el evento y expone los endpoints.
4. **Frontend** (G-17..G-20, G-16) — consume los contratos.

El riesgo de secuencia es **R-9**: si (2) shippea sin (3), los cierres del piloto no generan invite y el GTM queda a medias. `04-implementation-plan.md` debe tratarlo como un solo corte de release.
