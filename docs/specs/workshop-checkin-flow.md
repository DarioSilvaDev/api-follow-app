# Especificación: Check-in unificado del taller (alta de vehículo + Atención/CareEpisode)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-10-31
> **Estado:** Borrador para validación técnica (Tech Lead). Decisiones del fundador **A/B/C/D confirmadas (2026-10-31)** y **OA-03/04/05/09/10/11 confirmadas (2026-11-01)**, todas registradas en `DECISION-REGISTER.md` §42 (D-159, D-160, D-164, D-166, D-172, D-173…D-178); siguen abiertas OA-06, OA-07 y OA-08 (§12)
> **Basado en:** GTM "el taller primero", F-010 (registro), F-020 (crear CareEpisode), F-023 (listado), iteración 2-2 (cola de verificaciones), iteración 2-3 (timeline), ADR-005 (Vehicle Care Lifecycle), D-024 A2 (writes WORKSHOP-only), D-020 A1 (contexto por headers)
> **Módulo en paralelo (dado, NO rediseñado aquí):** `docs/designs/vehicle-claim-technical-design.md` (reclamo de vehículo). Solo se define el punto de conexión: **generación del link SOLO en el primer cierre efectivo del vehículo** (§6.3, Decisión C / D-172, coordinación resuelta 2026-10-31).
> **Código afectado:** `prisma/schema.prisma` + migración, `prisma/seed.ts` (permiso + catálogos), `src/modules/vehicles/commands/register-vehicle/*`, `src/modules/care-episodes/*`, `src/common/authorization/vehicle-access.service.ts`, `src/modules/workshops/dto/wizard-claim.dto.ts` + `wizard-claim` handler, frontend `web-follow-app` (`atenciones/nueva`, detalle de atención, wizard de taller).

---

## 1. Problema

El GTM del MVP es **"el taller primero"**: el taller es quien registra vehículos y atenciones, y el propietario reclama su vehículo después. Hoy el recorrido del mostrador del taller está roto en tres puntos:

1. **No puede dar de alta un vehículo.** `RegisterVehicleHandler` rechaza el contexto `WORKSHOP` con 403 fail-closed (`register-vehicle.handler.ts:54`), y `POST /api/vehicles` exige sesión en contexto PERSONAL con `ownerId` (D-035). Un vehículo que llega por primera vez **no tiene dónde registrarse** desde el taller.
2. **El check-in exige dos pasos imposibles.** `GET /care-episodes/lookup` devuelve **404** si la placa no existe (`lookup-vehicle.handler.ts:45-47`) y `POST /care-episodes` exige `vehicleId` de un vehículo ya existente. La propia spec F-020 §5 lo dice textualmente: *"el vehículo debe existir… El taller NO lo registra en esta iteración"* — contradice el GTM.
3. **La atención nunca cierra.** No existe command de cierre de `CareEpisode`: solo hay create, create-owner, attach, verify y remove-attachment. El estado queda `open` para siempre, no se registra egreso (`mileageOut` no existe), no hay tipos de atención y **el valor del producto (historial confiable + link de reclamo) nunca se materializa**.

Además, el contacto del propietario no tiene dónde guardarse: `Vehicle` no tiene campos de contacto, `VehicleOwnership` está pensado para titularidad (y el índice único parcial de D-155 reserva "un solo titular activo por vehículo"), y crear un `User` exige `email` único — además de ser exactamente lo que el GTM dice que **no** debe pasar (el celular no autentica ni habilita login).

## 2. Objetivo, alcance y no-objetivos

### 2.1 Objetivo

Que un miembro de taller (`owner`/`mechanic`) con contexto WORKSHOP pueda ejecutar de extremo a extremo:

1. **Ingresar un vehículo en un solo acto** (`Ingresar vehículo`): escribir la placa → si existe, reutilizarla con confirmación; si no, completar datos mínimos → crear `Vehicle` + `CareEpisode(open)` **en la misma transacción**.
2. **Registrar la atención completa**: odómetro de ingreso obligatorio (con excepción "no legible"), tipos de atención, motivo, fotos opcionales.
3. **Cerrar la atención** (`open → delivered` con `closedAt`), registrando odómetro de egreso y tipos de atención, lo que desbloquea el historial del vehículo y **dispara la generación del link de reclamo solo en el primer cierre efectivo del vehículo** (módulo dado, D-172).
4. **Leer en modo multi-taller**: cada taller ve lo suyo en modo escritura y, en modo lectura, el historial de otros talleres (resumen + adjuntos — **incluye `customerComplaint` y `customerNotes`**; solo se ocultan `internalNotes` y la PII del propietario, D-175).

### 2.2 Alcance (dentro)

- Migración de datos: contacto del propietario, `mileageOut` + excepciones de odómetro, `ServiceType` + relación M:N, texto libre de marca/modelo.
- Comando unificado de check-in (rama WORKSHOP en el alta de vehículo + creación del episodio, atómico).
- Comando de cierre de `CareEpisode` + evento de cierre + punto de conexión con el módulo de reclamo.
- Onboarding del taller: pedir **especialidad** (`WizardClaimDto` no la pide hoy — verificado).
- Lectura multi-taller (acceso a historial y a episodios de otros talleres en proyección resumida).
- Frontend: rediseño de `/atenciones/nueva` (flujo unificado) + pantalla de cierre.

### 2.3 No-objetivos (fuera, NO romper)

- **No** se implementa cancelación/edición de episodios (D-075 → iteración candidate 2-5).
- **No** se crea titularidad en el alta desde taller (§7.4); el titular se establece en el módulo de reclamo.
- **No** se autentica ni se crea `User` con el celular; **no** se habilita login.
- **No** se toca el alta en contexto PERSONAL (F-010) ni su contrato `POST /api/vehicles` (409 por placa duplicada se mantiene ahí).
- **No** se modifica el flujo del propietario (`POST /care-episodes/owner`, cola de verificaciones, timeline del propietario).
- **No** se rediseña el módulo de reclamo (`docs/designs/vehicle-claim-technical-design.md` es dado).
- **No** se agregan versiones ni año en el mostrador; **no** hay agenda/turnos nuevos; **no** hay filtros de listado (D-F023-1).
- **No** se introduce infraestructura nueva (sin CQRS/Kafka/outbox): eventos in-process con `@nestjs/event-emitter` (AGENTS.md).

## 3. Contradicciones detectadas con specs y código vigentes (no se fuerzan)

Se listan explícitamente en lugar de escribir por encima. **Las enmiendas de C-1 (D-035), C-2 (F-020 §5) y C-4 (D-038) fueron CONFIRMADAS por el fundador (2026-10-31) y registradas en `DECISION-REGISTER.md` (D-035 A1, D-038 A1, §42 / D-159 y D-160);** la actualización de los textos de esas specs queda para la Fase G. Las demás se resuelven dentro de este flujo.

| # | Qué dice hoy | Qué pide este flujo | Dónde |
|---|---|---|---|
| C-1 | **D-035 / F-010 §3:** "Registro solo en contexto PERSONAL en MVP. Los miembros de taller **no** registran vehículos en esta iteración (WORKSHOP → post-MVP)". | El taller registra vehículos desde el día 1 (GTM). | `docs/specs/vehicle-register-flow.md` §4 D-035, §3 |
| C-2 | **F-020 §5:** "el vehículo debe existir… **El taller NO lo registra en esta iteración**"; **RF-1:** "`vehicleId` es obligatorio". | Ingreso unificado: si la placa no existe, el taller crea el vehículo en el mismo acto. | `docs/specs/care-episode-create-flow.md` §5/§RF-1 |
| C-3 | **F-020 / DTO `CreateCareEpisodeDto`:** `mileageIn` **opcional**. | Odómetro de ingreso **obligatorio** (con excepción). | `create-care-episode.dto.ts:17-24` |
| C-4 | **D-038 (F-010):** "Catálogo opcional, **sin texto libre**… No hay campos de texto libre para marca/modelo/versión en esta iteración". | Selects de marca/modelo con fallback **"Otra marca"/"Otro modelo" → texto libre**. | `vehicle-register-flow.md` §4 D-038 |
| C-5 | **Premisa del encargo:** "`VehicleOwnership` requiere `userId`". **Verificado: es `String?` nullable** (`schema.prisma:778`, lo usa la concesionaria con `type='company'` y `userId=null`; matiz verificado en el diseño de reclamos §3.2: **pero** el CHECK `vehicle_ownerships_owner_xor` exige `user_id XOR dealership_id NOT NULL` — no puede existir una fila sin persona ni concesionaria). El problema real es otro: (a) crear una fila de ownership implicaría titularidad, que el taller **no** tiene; (b) el índice único parcial de **D-155** (`WHERE ends_at IS NULL AND type <> 'co_owner'`) haría que esa fila **ocupara el lugar del único titular activo** y bloqueara el reclamo posterior. | Guardar el contacto sin ownership ni User. Se resuelve con tabla nueva (§7.3.3). | `schema.prisma:775-796`, `DECISION-REGISTER.md` D-155 |
| C-6 | **`GET /care-episodes/:id`** (`get-care-episode.handler.ts:190-193`): en contexto WORKSHOP, si `episode.workshopId !== ctx.workshopId` → **404**. | Taller B debe poder leer el episodio del taller A en proyección resumida. | `src/modules/care-episodes/queries/get-care-episode/*` |
| C-7 | **`GET /vehicles/:id/history`** usa el check **strict** (`vehicles.controller.ts:145-155` → `assertOwnershipOrSharedAccess`, **sin pata WORKSHOP**); y el UNION de `assertWorkshopVehicleAccess` (`vehicle-access.service.ts:501-513`, rutas maintenance) **no incluye `care_episodes`**. | El taller con relación de atención debe poder leer el historial del vehículo en modo lectura. Son **dos** huecos distintos: el primero bloquea `/vehicles/*`, el segundo bloquea `/maintenance/*`. | `src/common/authorization/vehicle-access.service.ts` |
| C-8 | **`attach-care-episode-attachments.handler.ts:235-251`:** `assertWritableState` devuelve **409** si el episodio está `delivered`/`cancelled`/`verified`. | Fotos de egreso (`phase: after`) del cierre. | Si se suben después de cerrar → 409. Este flujo las sube **antes** de cerrar (§5.4). |
| C-9 | **F-010 RF-2:** placa duplicada → **409 CONFLICT** en `POST /api/vehicles`. | En el check-in del taller la placa repetida **se reutiliza**, nunca 409. | No es conflicto real: son endpoints distintos. Debe quedar explícito para que nadie "unifique" ambos comportamientos. |

## 4. Actores y permisos

| Actor | Acceso en este flujo |
|---|---|
| **Miembro de taller `owner`** con contexto WORKSHOP activo | Check-in, cierre, adjuntos, listado, verificación, gestión de especialidades (`workshop.specialties.manage`). |
| **Miembro de taller `mechanic`** con contexto WORKSHOP activo | Idem `owner` para check-in/cierre/adjuntos/listado/verificación. **No** gestiona especialidades del taller. |
| Miembro con rol `employee` | **No** crea ni cierra episodios (403 PERMISSION_DENIED) — matriz de seed existente. |
| Propietario (contexto PERSONAL) | **No** participa de este flujo. Ve el resultado en su timeline/historial (specs 2-3 / F-023 ya existentes). |
| super_admin | Bypass de `PermissionsGuard`, pero **WorkshopOnlyGuard corre antes** → en contexto PERSONAL no puede hacer check-in ni cierre (D-024 A2, patrón anti-bypass existente). |

### 4.1 Guards y permisos (patrón verificado del repo)

| Endpoint (propuesta) | Guards (orden) | Permiso |
|---|---|---|
| `POST /api/care-episodes/check-in` | `JwtAuthGuard` + `ContextGuard` (clase) → `WorkshopOnlyGuard` + `PermissionsGuard` (método, **WorkshopOnly antes**) | `care-episode.create` (**existente**, owner+mechanic — sin permiso nuevo: el alta del vehículo es efecto del mismo acto) |
| `POST /api/care-episodes/:id/close` | igual que arriba | `care-episode.close` (**nuevo**, owner+mechanic; requiere seed) |
| `GET /api/care-episodes/lookup?plate=` (existente) | `WorkshopOnlyGuard` + `ThrottlerGuard` (`@Throttle` 30/60s) | sin permiso granular (membership validada por resolver) |
| `POST /api/care-episodes/:id/attachments` (existente) | igual que check-in | `care-episode.attach` (existente) |
| `GET /api/care-episodes/:id` (existente) | clase `Jwt`+`Context`; autorización **en handler** (proyección por actor) | sin `@Permissions` |
| `GET /api/vehicles/:id/history` (existente) | clase `Jwt`+`Context` + `assertVehicleAccess` en el handler | sin permiso (queda bajo revisión: §11 Fase D) |
| `POST /api/workshops/:id/specialties` (existente) | `WorkshopGuard` + `PermissionsGuard` | `workshop.specialties.manage` (owner) |

**DECISIÓN (propuesta D-158):** no se crea permiso `workshop.vehicle.create`. El check-in es **un solo acto con un solo permiso** (`care-episode.create`); crear un segundo permiso para una sub-operación del mismo journey agrega matriz de roles sin valor para el usuario. *Alternativa descartada:* permiso nuevo — se reevalúa solo si el fundador quiere que `mechanic` registre atenciones pero **no** vehículos.

## 5. User journey: check-in unificado

### 5.1 Diagrama de flujo

```
Actor: Miembro de taller (owner/mechanic)
  ↓
Contexto: selector de header en contexto WORKSHOP → nav "Nueva atención" (/atenciones/nueva)
  ↓
[PASO 1] Input de PLACA (obligatoria) → normalización trim + mayúsculas (D-037)
  ↓
[PASO 2] GET /api/care-episodes/lookup?plate=  (throttler 30/60s existente)
  ↓
        ┌───────────────┬──────────────────────────────┐
   ¿match?         SÍ (vehículo existe)          NO (404)
        │               │                              │
        ▼               ▼                              ▼
  [PASO 3A]        [PASO 3B]                    [PASO 3C]
  CONFIRMACIÓN     REUTILIZAR                     CREAR
  de placa         "Vehículo encontrado"         "Nuevo vehículo"
  (si la placa     · tarjeta: placa + catálogo   · placa (pre-llenada)
  cambió entre      (marca/modelo/año)           · marca  → select + "Otra marca"
  el tipeo)        · checkbox:                    · modelo → select + "Otro modelo"
                     "Es el mismo vehículo"        · celular (opcional): 2 inputs
                   · si NO tiene canal de            (área + número) + checkbox "No disponible"
                     reclamo → pedir celular (opc.)   · VIN (opcional, con nota)
                   · si SÍ lo tiene → se            · (NO se pide año ni versión)
                     muestra enmascarado y         · si VIN incompatible → 409 y
                     se puede actualizar             se vuelve al paso 1
        │               │                              │
        └───────┬───────┴──────────────────────────────┘
                ▼
[PASO 4] FORMULARIO DE ATENCIÓN (común a ambas ramas)
  · Sucursal (branch) — preseleccionada si hay 1
  · Odómetro de ingreso — OBLIGATORIO
      – si marca "No se puede leer" → motivo (obligatorio) + aviso:
        "adjuntá una foto del tablero" (foto obligatoria en phase `before`)
      – si es menor al máximo histórico → MODAL de advertencia
        (NO bloquea): confirmar, o marcar "tablero reemplazado"
        que reinicia la base de comparación (D-164)
  · Tipos de atención — chips, máx 3, filtrados por las especialidades
      del taller (M:N, D-174)
      – sin especialidades cargadas → catálogo completo + aviso
        "Cargá las especialidades de tu taller" (link a Mi taller)
      – opción "Otro" → texto libre (obligatorio si se elige)
  · Motivo / queja del cliente (opcional, ya existente)
  · Fotos (OPCIONALES; la UI recomienda 1 en `before`; subida con
      phase `before` vía endpoint existente, o después desde el detalle)
  ↓
[PASO 5] Submit → POST /api/care-episodes/check-in  (UNA transacción)
  · servidor resuelve la placa:
      – existe  → reutiliza Vehicle (nunca 409 por placa)
      – no existe → crea Vehicle (datos mínimos + contacto)
  · crea CareEpisode { status: open, checkedInAt: now, mileageIn… }
  · crea/actualiza el contacto activo del propietario
  · emite CareEpisodeCreated (existente) + VehicleRegistered (si creó)
  ↓
[PASO 6] Éxito → resumen "Atención ingresada — vehículo ABC123"
  · CTA: "Ver atención" → /vehicles/{vehicleId}/servicios/{servicioId}
  · CTA: "Cargar fotos de ingreso" (opcional)
  ↓
… la atención permanece OPEN mientras el taller trabaja …
  ↓
[PASO 7] Cierre (§5.4) → POST /api/care-episodes/:id/close
  · odómetro de EGRESO (obligatorio + misma excepción)
  · tipos de atención ≥ 1 (si no, 400 con selector)
  · fotos `after` subidas ANTES de cerrar (hoy el cierre bloquea adjuntos)
  · status open → delivered + closedAt = now  (transacción)
  · emite care-episode.closed → NOTIFICA y genera link de reclamo
    SOLO si es el primer cierre efectivo del vehículo (sin invite
    vigente y sin reclamo previo — D-172); si no, omite.
    Degradable: el cierre no espera ese resultado
  ↓
Resultado: atención "Entregada" en listado/timeline; historial del vehículo
completo; propietario recibe (o tiene disponible) el link de reclamo
```

### 5.2 Decisiones de UI y de datos por paso

| Paso | Decisión de UI | Decisión de datos |
|---|---|---|
| 1 | Un único input de placa; sin botón "crear"/"usar" (la rama la decide el sistema). | Normalización `trim().toUpperCase()` cliente y servidor (D-037/D-042). |
| 2 | Estados: `searching` / `found` / `not-found` / `error` (ya existentes en `atenciones/nueva/page.tsx`). | Lookup existente, **sin cambios de contrato**; `not-found` deja de ser un callejón y pasa a ser la rama "crear". |
| 3A | Si la placa se edita tras encontrar, se re-busca (evita confirmar sobre otra placa). | — |
| 3B | Tarjeta de confirmación explícita ("Usar vehículo existente"); nunca se saltea el primer contacto. | **No** se escribe en la ficha del vehículo existente (solo se lee). Si carece de canal de reclamo → se pide celular (opcional; dos inputs área + número). |
| 3C | Dos formularios separados están **descartados**: un solo formulario con bloque "Datos del vehículo" + bloque "Atención". | Transacción única `Vehicle` + `CareEpisode` + contacto. |
| 4 | Odómetro con checkbox de excepción; modal de confirmación o "tablero reemplazado" si retrocede; chips de tipo con límite visual de 3 (opcionales al ingreso). | `mileageIn` obligatorio; excepción persiste flag+motivo+foto. |
| 5 | Spinner + disabled en submit; errores 4xx mapeados junto al campo. | Ver §7 (qué se crea/actualiza). |
| 6 | Feedback de éxito con deep-link al detalle (patrón existente). | Emisión de eventos **después** de confirmar la persistencia (patrón del repo). |
| 7 | Pantalla de cierre accesible desde el detalle y desde la lista de atenciones. | Transacción de cierre + evento posterior. |

### 5.3 Flujos alternativos

- **Sin contexto WORKSHOP:** guard temprano en la página (patrón `/atenciones`): "Seleccioná un taller en el selector del header". En API → 403 INVALID_CONTEXT / WorkshopOnly.
- **Rol `employee`:** 403 PERMISSION_DENIED (matriz existente).
- **Lookup falla (red/5xx):** estado de error con Reintentar; **nunca** interpretar un error como "no existe" y ofrecer crear (riesgo de duplicar un vehículo existente).
- **Placa con match pero datos de catálogo vacíos:** la tarjeta muestra "Sin datos de catálogo" (copy ya existente) y la rama sigue siendo "reutilizar".
- **VIN incompatible:** 409 con mensaje claro; se conservan los datos del formulario y se vuelve al paso 1 (§9 CV-2).
- **Celular opcional (OA-03, 2026-11-01):** si no se informa (o se marca "No disponible") el vehículo queda **sin canal de reclamo** (`status=unavailable`, chip visible en la tarjeta de confirmación); el check-in y el cierre siguen funcionando (§9 CV-4).
- **Fotos:** si el storage no está configurado o falla, el check-in **no se bloquea** (las fotos son opcionales); se reintenta desde el detalle con el botón "Reintentar" (mecanismo existente).

### 5.4 Journey de cierre (valor del flujo)

```
Actor: Miembro de taller con la atención abierta
  ↓
Abre la atención (detalle o lista) → botón "Cerrar atención"
  ↓
Modal/pantalla de cierre:
  · Odómetro de EGRESO (obligatorio; misma excepción "no legible" + motivo + foto `after`)
  · Tipos de atención (≥1; si la atención nació sin tipo, acá es obligatorio)
  · Aviso: "Las fotos de egreso deben cargarse antes de cerrar" (hoy el cierre bloquea adjuntos)
  ↓
POST /api/care-episodes/:id/close  →  transacción:
  status: open → delivered · closedAt = now · mileageOut* · serviceTypes
  ↓
Éxito → evento `care-episode.closed` { careEpisodeId, vehicleId, workshopId }
  ↓
Consumidores (in-process, best-effort):
  · módulo de reclamo (DADO): genera el link SOLO en el primer cierre
    efectivo del vehículo — sin invite vigente y sin reclamo previo
    (D-172; coincide con el índice único parcial "un invite activo por
    vehículo" del diseño de reclamos). Si ya hay invite vigente o el
    vehículo ya fue reclamado → NO genera nada (sin error).
    Canal: WhatsApp si el contacto activo (§7.3.3) tiene celular; si
    está "no disponible" → solo QR en mostrador (D-162 + F-7 del
    diseño de reclamos).
  · (futuro) notificaciones al propietario
  ↓
Si el consumidor falla: la atención YA quedó entregada; el fallo se loguea
y se reintenta desde el módulo de reclamo. NUNCA revierte el cierre.
```

## 6. Estados y transiciones del `CareEpisode`

### 6.1 Estados (enum existente, sin cambios)

```text
open ──close──▶ delivered        (única transición nueva implementada aquí)
  │
  └──(cancelled queda fuera de alcance: D-075, iteración 2-5)
```

`source=owner` nace directamente en `delivered` (comportamiento existente, intacto).

### 6.2 Reglas de la transición `open → delivered`

- **Quién:** solo un miembro activo del **taller dueño del episodio** (`workshopId` del contexto), con permiso `care-episode.close`. El propietario nunca; otro taller nunca.
- **Cuándo:** solo desde `open`. Si ya está `delivered`/`cancelled` → **409** ("La atención ya fue cerrada"). Sin reapertura en MVP (§12, OA-10).
- **Qué exige:** odómetro de egreso (valor **o** excepción completa) + ≥1 tipo de atención.
- **Qué queda inmutable después:** el episodio no admite adjuntos posteriores (409 existente) ni edición (no existe endpoint); el historial se considera cerrado (ADR-005: la historia se agrega, no se reescribe).
- **Auditoría:** `closedAt` + `updatedAt`; el autoría ya queda en `createdByMemberId`. La auditoría de "quién cerró" es detalle de diseño técnico (hoy no hay columna de cierre por miembro — §7.3.6).

### 6.3 Qué implica el cierre (valor + conexión con reclamo)

1. **El historial del vehículo se vuelve completo:** el episodio aparece como "Entregado" en el listado del taller (F-023) y en el timeline del propietario (2-3), con odómetro de egreso y tipos.
2. **Se dispara el link de reclamo, solo en el primer cierre (D-172).** Punto de conexión **único** con el módulo dado `docs/designs/vehicle-claim-technical-design.md`: este flujo **no** define cómo se arma, expira ni entrega el link; emite el hecho `care-episode.closed` con `{ careEpisodeId, vehicleId, workshopId }` **después** de confirmar la transacción. El consumidor genera el invite **solo si el vehículo no tiene invite vigente y no fue reclamado antes**; los cierres siguientes no generan enlace (un solo invite activo por vehículo — coherente con el índice único parcial del diseño de reclamos). Payload mínimo consumido: `vehicleId` (+ `careEpisodeId` para trazabilidad del origen; `workshopId` para el scope del taller). *(Coordinación resuelta 2026-10-31.)*
3. **El cierre no depende de la notificación.** Email/WhatsApp/link son consumidores best-effort del evento: si fallan, la atención queda `delivered` igual y el fallo queda registrado para reintento. (Requisito de producto explícito del encargo.)
4. **Sin canal de reclamo** (`status=unavailable`, `"no disponible"`): el cierre **igual procede** y el link **igual se genera** (cuando corresponde por D-172); simplemente se entrega **sin WhatsApp** — el taller muestra el **QR en mostrador** (`ownerPhone` opcional, F-7 del diseño de reclamos). El contacto activo de `vehicle_owner_contacts` (§7.3.3) es la fuente que el consumidor lee al generar el invite. *(Coordinación resuelta 2026-10-31.)*

## 7. Modelo de datos

### 7.1 Qué se crea (check-in)

| Entidad | Condición | Detalle |
|---|---|---|
| `Vehicle` | **Solo si la placa no existe** | placa normalizada + marca/modelo (catálogo **o** texto libre) + VIN opcional + `manufactureYear/modelYear/color` **no** se piden. **Sin `VehicleOwnership`** (§7.4). |
| `CareEpisode` | siempre | `status=open`, `checkedInAt=now`, `workshopId`/`branchId`/`createdByMemberId` del contexto, `source=workshop`, `mileageIn` (+ flags de excepción), `customerComplaint`/`internalNotes` opcionales, tipos de atención (0..3 en el ingreso). |
| Contacto del propietario | siempre | upsert del registro **activo** del vehículo (§7.3.3). |
| `VehicleMileage` | **no** en MVP (§12, OA-08) | el km de ingreso vive en el episodio. |

### 7.2 Qué se actualiza

| Momento | Qué cambia |
|---|---|
| Check-in sobre placa existente | **Solo** el contacto activo del vehículo (si cambió). La ficha del vehículo **no** se toca. |
| Cierre | `care_episodes`: `status`, `closedAt`, `mileageOut` + flags, filas de tipos de atención (si vinieron), `updatedAt`. |
| Onboarding (especialidad) | `workshop_specialties` (nuevo vínculo en la misma transacción del wizard). |

### 7.3 Tablas / columnas nuevas (migración aditiva)

#### 7.3.1 Texto libre de marca/modelo (`Vehicle`)

```prisma
model Vehicle {
  // …existentes…
  brandName String? @map("brand_name") @db.VarChar(100)  // "Otra marca"
  modelName String? @map("model_name") @db.VarChar(100)  // "Otro modelo"
}
```

- **Precedencia de lectura:** `versionId` (catálogo) → `brandName`/`modelName` (texto libre) → `null`. El lookup y el detalle deben hacer el fallback (hoy leen solo `version.model.brand.name` y devuelven `null`).
- Enmienda parcial de **D-038** (§3 C-4): aplica al alta **desde taller**; el alta PERSONAL (F-010) queda como está hasta que el fundador decida unificar (§12, OA-06).

#### 7.3.2 Odómetro de egreso y excepciones (`CareEpisode`)

```prisma
model CareEpisode {
  // …existentes…
  mileageOut                Int?    @map("mileage_out")
  mileageInUnreadable       Boolean @default(false) @map("mileage_in_unreadable")
  mileageInUnreadableReason String? @map("mileage_in_unreadable_reason") @db.VarChar(200)
  mileageOutUnreadable      Boolean @default(false) @map("mileage_out_unreadable")
  mileageOutUnreadableReason String? @map("mileage_out_unreadable_reason") @db.VarChar(200)
}
```

- **Invariantes (en handler, no solo en DTO):** en ingreso → `mileageIn` **o** (`mileageInUnreadable=true` + motivo + ≥1 adjunto `phase='before'`), XOR. En egreso → análogo con `phase='after'`.
- `mileageIn` pasa a ser **obligatorio en el check-in** (enmienda C-3); sigue siendo nullable en el modelo para episodios legacy y para el alta del propietario.

#### 7.3.3 Contacto del propietario (tabla nueva)

```prisma
model VehicleOwnerContact {
  id                 String    @id @default(uuid()) @db.Uuid
  vehicleId          String    @map("vehicle_id") @db.Uuid
  phoneE164           String?   @map("phone_e164") @db.VarChar(20)          // E.164 canónico (fuente de verdad p/ wa.me); null si unavailable
  phoneAreaCode       String?   @map("phone_area_code") @db.VarChar(6)      // display: código de área ("336", "11")
  phoneNationalNumber String?   @map("phone_national_number") @db.VarChar(12) // display: número ("4687486", "22681000")
  status             VehicleContactStatus               // available | unavailable
  source             String    @default("workshop_counter")
  recordedByMemberId String?   @map("recorded_by_member_id") @db.Uuid
  isActive           Boolean   @default(true) @map("is_active")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  vehicle            Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  @@unique([vehicleId, isActive])   // o índice único parcial WHERE is_active (patrón D-155)
  @@map("vehicle_owner_contacts")
}
enum VehicleContactStatus { available unavailable }
```

- **Por qué tabla y no columnas en `Vehicle`:** preserva historial de correcciones (quién cargó qué y cuándo), permite corregir sin pisar el dato anterior y deja crecer a otros canales (email/WhatsApp) sin migrar de nuevo. **Por qué no `User`:** el celular no autentica ni habilita login; `User.email` es unique not-null. **Por qué no `VehicleOwnership`:** implicaría titularidad (que el taller no otorga) y pisaría el slot único de D-155.
- **Único registro activo por vehículo** (índice único parcial, patrón D-155). El módulo de reclamo lee el registro activo.
- `status=unavailable` ⇔ "sin canal de reclamo" (los tres campos de teléfono quedan `null`).
- **Teléfono (OA-03 → D-173):** celular **opcional** en el alta; país fijo `DEFAULT_PHONE_COUNTRY_CODE` (default `+54`, variable de config; **sin selector de país en MVP**); validación por **par área+número, sin longitud fija** (ej. `336 4687486`, `11 22681000`); `phoneE164` se construye servidor-side (`+<país><área><número>`) y es la **única** fuente para el `wa.me` del módulo de reclamo; `phoneAreaCode`/`phoneNationalNumber` son los campos de display que ve y edita el taller en la UI.

#### 7.3.4 Catálogo de tipos de atención (tablas nuevas)

```prisma
model ServiceType {
  id          String        @id @default(uuid()) @db.Uuid
  code        String        @unique @db.VarChar(60)
  name        String        @db.VarChar(120)
  description String?
  isActive    Boolean       @default(true) @map("is_active")
  createdAt   DateTime      @default(now()) @map("created_at")
  specialties ServiceTypeSpecialty[]
  links       CareEpisodeServiceType[]
  @@map("service_types")
}

model ServiceTypeSpecialty {
  id            String      @id @default(uuid()) @db.Uuid
  serviceTypeId String      @map("service_type_id") @db.Uuid
  specialtyId   String      @map("specialty_id") @db.Uuid
  serviceType   ServiceType @relation(fields: [serviceTypeId], references: [id], onDelete: Cascade)
  specialty     Specialty   @relation(fields: [specialtyId], references: [id], onDelete: Cascade)
  @@unique([serviceTypeId, specialtyId])
  @@map("service_type_specialties")
}

model CareEpisodeServiceType {
  id            String      @id @default(uuid()) @db.Uuid
  careEpisodeId String      @map("care_episode_id") @db.Uuid
  serviceTypeId String?     @map("serviceTypeId") @db.Uuid   // XOR con customLabel
  customLabel   String?     @db.VarChar(120)                 // opción "Otro"
  careEpisode   CareEpisode @relation(fields: [careEpisodeId], references: [id], onDelete: Restrict)
  serviceType   ServiceType? @relation(fields: [serviceTypeId], references: [id])
  @@index([careEpisodeId])
  @@map("care_episode_service_types")
}
```

- **Catálogo global, jamás enum por taller** (requisito explícito). **Semilla aprobada por el fundador (2026-11-01):** la lista enumerada abajo — **14 códigos distintos** para las 3 especialidades del piloto *(conteo confirmado por el fundador el 2026-11-01)*. Filtrado = **unión** de las `WorkshopSpecialty` del taller del contexto. **"Otro" con texto libre no es una fila del catálogo**: existe en todos los rubros y se persiste como `customLabel` (XOR).

| `code` sugerido (snake_case) | `name` | Especialidades (`ServiceTypeSpecialty`) |
|---|---|---|
| `cambio_aceite_filtros` | Cambio de aceite y filtros | mecánica general |
| `frenos` | Frenos (pastillas/discos) | mecánica general |
| `tren_delantero_suspension` | Tren delantero y suspensión | mecánica general |
| `distribucion_correa` | Distribución / correa | mecánica general |
| `aire_acondicionado` | Aire acondicionado | mecánica general |
| `embrague` | Embrague | mecánica general |
| `reparacion_abolladuras` | Reparación de abolladuras | chapa y pintura |
| `pintura_panel` | Pintura de panel | chapa y pintura |
| `reparacion_paragolpes` | Reparación de paragolpes | chapa y pintura |
| `enderezado_chasis` | Enderezado de chasis | chapa y pintura |
| `diagnostico_escanner` | Diagnóstico por escáner | mecánica general **+** electricidad → **2 filas** en la intermedia |
| `bateria_alternador` | Batería / alternador | mecánica general **+** electricidad → **2 filas** en la intermedia |
| `luces_opticas` | Luces y ópticas | electricidad |
| `cierre_centralizado_alarma` | Cierre centralizado / alarma | electricidad |

- **Máximo 3 filas por episodio** (validación en handler). XOR `serviceTypeId`/`customLabel` (patrón CHECK con precedente en la migración `20260918000002_add_organizational_owner`).
- Relación de filtrado: **M:N `ServiceType↔Specialty` vía `ServiceTypeSpecialty`** (enmienda 2026-11-01, OA-04 → D-174; **revierte** la propuesta 1:N con `specialtyId` nullable del borrador). Un tipo puede pertenecer a varias especialidades; el catálogo que ve el taller = unión de sus especialidades. **Regla de mantenimiento:** si la opción "Otro" supera ~10% del uso del catálogo, falta un tipo — se da de alta por admin (catálogo administrable, **sin deploy**).
- `CareEpisode` gana la relación `serviceTypes CareEpisodeServiceType[]`.

#### 7.3.5 Especialidad en el onboarding (sin cambios de schema)

- `Specialty` (12 códigos seed: `chapa_pintura`, `mecanica_general`, `frenos`, `tren_delantero`, `suspension`, `electricidad`, `diagnostico`, `diesel`, `inyeccion`, `transmision`, `aire_acondicionado`, `llantas_balanceo`) y `WorkshopSpecialty` **ya existen**.
- **`WizardClaimDto` (`src/modules/workshops/dto/wizard-claim.dto.ts`) no pide especialidad — verificado:** solo `token`, `email`, `firstName`, `lastName`, `password`, `phone` y `workshop { email, phone, website, description }`. Se agrega `specialtyIds: string[]` (mín. 1) al paso "completar datos" y se persiste `WorkshopSpecialty` en la misma transacción del claim. Endpoints existentes `POST /workshops/:id/specialties` siguen siendo la vía de corrección posterior (`workshop.specialties.manage`).

#### 7.3.6 Permiso nuevo (seed)

- `care-episode.close` (module/resource/action `care-episode`/`care-episode`/`close`) → roles **owner + mechanic** (misma matriz que `care-episode.create`). **Sin cambios** en `employee`.

### 7.4 Qué NO se toca (explícito)

- **No se crea `VehicleOwnership`** en el alta desde taller: el vehículo queda **sin titular** hasta el reclamo (coherente con "vehículo sin titular no es propiedad del taller" y con el índice único de D-155).
- No se crea `User`, ni sesión, ni credenciales con el celular.
- No se modifica `POST /api/vehicles` (alta PERSONAL, 409 por placa).
- No se modifica `POST /care-episodes/owner` ni la cola de verificaciones.
- No se agregan estados al enum `CareEpisodeStatus`.

## 8. Reglas de negocio y validaciones

- **RF-1 — Ingreso unificado (D-158).** Un solo endpoint resuelve la placa: existe → reutiliza; no existe → crea `Vehicle` + `CareEpisode` + contacto en **una transacción** (sin estados intermedios: no puede quedar un vehículo sin atención ni una atención sin vehículo).
- **RF-2 — Placa.** Normalización `trim().toUpperCase()` en cliente y servidor (D-037/D-042). Placa repetida en el check-in → **reutilizar, nunca 409** (C-9). La rama de "no existe" solo se activa con un 404 **confirmado** del lookup (un error de red no habilita crear).
- **RF-3 — VIN.** Opcional (D-036). **Bloqueo único:** si el VIN informado ya pertenece a **otro** vehículo → 409 "El VIN ya está registrado en otro vehículo"; si el vehículo reutilizado tiene VIN distinto del informado → 409 "El VIN no coincide con el vehículo registrado". VIN ausente → sin bloqueo. (Placa nunca bloquea; VIN incompatible bloquea.)
- **RF-4 — Datos mínimos del vehículo nuevo.** Placa (obligatoria) + marca + modelo + celular (**opcional** desde 2026-11-01, OA-03: si no se informa → `status=unavailable`, sin canal de reclamo). **No** se pide versión, año, color ni número de motor en el mostrador. VIN opcional con nota de trazabilidad. **Buena práctica del piloto (no requisito):** si el propietario está en el mostrador, **capturar el VIN fotografiando el parabrisas** — más vehículos quedan con verificación fuerte en el reclamo (últimos 4 del VIN, F-2/D-180) y la revisión manual se evita. El check-in **no** bloquea ni condiciona nada sin VIN.
- **RF-5 — Marca/modelo.** Selects desde el catálogo existente (`/vehicle-brands`, `/vehicle-models`) con opciones finales **"Otra marca"** / **"Otro modelo"** que habilitan texto libre (obligatorio si se elige). Guardado en `brandName`/`modelName` (§7.3.1). Nunca un enum por taller.
- **RF-6 — Celular del propietario (enmienda 2026-11-01, OA-03 → D-173).** **Opcional en el alta**: no se exige en el mostrador (~90% de los casos el taller ya conoce el contacto del propietario); si no se informa (con o sin la excepción explícita **"No disponible"**) persiste `status=unavailable` ("sin canal de reclamo") y **no se frena el mostrador**. UI: **dos inputs separados** — código de área + número — validados **en par, sin longitud fija** (ej. `336 4687486`, `11 22681000`); **país fijo en configuración** (`DEFAULT_PHONE_COUNTRY_CODE`, default `+54`; sin selector de país en MVP). Persistencia: **E.164 canónico en columna única** (fuente de verdad para el `wa.me`, que se arma **solo** desde el E.164, nunca desde el formato local) + los dos campos de display. No autentica, no crea cuenta, no habilita login, no es identidad. Quien está en el mostrador declara el canal vigente: si el vehículo ya tenía contacto, se muestra **enmascarado** y puede actualizarse (quién y cuándo queda en la fila de contacto).
- **RF-7 — Odómetro obligatorio.** Ingreso (check-in) y egreso (cierre), enteros ≥ 0. Excepción "no legible" ⇒ flag + motivo (≥3 caracteres) + **foto del tablero** obligatoria (`phase=before` en ingreso, `phase=after` en egreso).
- **RF-8 — Odómetro regresivo (D-164, confirmado 2026-10-31).** Si la lectura es **menor al máximo histórico del vehículo** → el backend responde con un código de aviso + la referencia; la UI muestra **modal de confirmación** (con la referencia visible) y al aceptar reenvía con confirmación explícita. **Nunca bloquea.** Excepción **"tablero reemplazado"** (opción del mismo modal): la lectura se persiste marcada como excepción y **reinicia la base de comparación** a partir de ese punto (la excepción es una marca auditable sobre la historia del vehículo, no solo del endpoint — mecánica: §13-9).
- **RF-9 — Tipos de atención.** Catálogo **global** `ServiceType` filtrado por las especialidades del taller del contexto — **unión** de sus especialidades (sin especialidades → catálogo completo + aviso de onboarding). Relación tipo↔especialidad **M:N** vía `ServiceTypeSpecialty` (**D-174, OA-04 confirmado 2026-11-01**: un tipo puede pertenecer a varias especialidades, ej. "Diagnóstico por escáner" en mecánica y electricidad). Relación episodio↔tipo **M:N**, **máximo 3** por episodio, más opción **"Otro"** con texto libre obligatorio. **Obligatoriedad: al cierre ≥1; al ingreso opcional** (D-166, confirmado 2026-10-31).
- **RF-10 — Aislamiento entre talleres.** Escritura: cada taller solo escribe en **sus** episodios (y en la creación de vehículos vía su propio check-in). Lectura: un taller con ≥1 atención sobre el vehículo puede ver el historial del vehículo y el detalle de episodios de **otros** talleres en **proyección resumida** = resumen + adjuntos, **incluyendo `customerComplaint` y `customerNotes`** (OA-09 → **D-175**, enmienda de D-168: "todo salvo `internalNotes`"); lo único oculto es **`internalNotes`** y la PII del propietario (email/nombre/teléfono — consistente con D-F023-2/D-072). **Nunca** escritura sobre episodios ajenos.
- **RF-11 — Permisos.** `care-episode.create` (check-in), `care-episode.close` (nuevo), `care-episode.attach` (fotos), `care-episode.list`/`verify` (existentes). Guard order: `WorkshopOnlyGuard` **antes** de `PermissionsGuard` (anti-bypass D-024 A2). En contexto PERSONAL → 403; `employee` → 403; miembro inactivo → 403.
- **RF-12 — Fotos.** Opcionales para no frenar el mostrador; la UI **recomienda 1 en `before`** (copy de ayuda, no bloqueo — OA-05 **confirmada 2026-11-01**, D-177). Única foto obligatoria: la del odómetro ilegible. Fases `before/work/after` ya existen. Las fotos de egreso se suben **antes** de cerrar (C-8).
- **RF-13 — Cierre.** Solo el taller dueño, solo desde `open`, exige egreso + tipos; transacción primero, eventos después; el fallo del consumidor de notificación **no** revierte ni retrasa el cierre.
- **RF-14 — Especialidad en onboarding.** El wizard del taller pasa a exigir ≥1 especialidad; los talleres ya activos sin especialidad se manejan con el fallback de RF-9 (§12, OA-07).
- **RF-15 — Concurrencia.** Dos miembros (o dos talleres) ingresando la misma placa al mismo tiempo: el `@unique(licensePlate)` es la red final; ante P2002 el handler **reintenta como reutilización** (lee el vehículo creado por el otro y continúa con el episodio), no devuelve 500 ni 409.

## 9. Casos borde

| ID | Caso | Comportamiento esperado |
|---|---|---|
| CV-1 | Placa ya existente | Reutilizar con confirmación explícita; **sin 409**; se crea solo el `CareEpisode` (+ contacto si cambió). |
| CV-2 | VIN incompatible (informado ≠ registrado, o VIN de otro vehículo) | 409 con mensaje específico; conserva el formulario; vuelve a la placa. |
| CV-3 | Marca/modelo fuera de catálogo | "Otra marca"/"Otro modelo" → texto libre obligatorio; se guarda en `brandName`/`modelName`; lookup los devuelve con fallback. |
| CV-4 | Sin celular | Excepción "no disponible" → `status=unavailable` ("sin canal de reclamo"); check-in y cierre proceden; el módulo de reclamo debe contemplarlo. |
| CV-5 | Odómetro ilegible | Flag + motivo + foto `before`/`after` obligatoria; si falta alguno → 400 con el campo señalado. |
| CV-6 | Episodio sin tipo | Ingreso puede nacer sin tipo (lectura OK, chip "Sin tipo de atención"); **al cerrar** → 400 "Agregá al menos un tipo de atención" con el selector (catálogo = **unión de las especialidades del taller**, M:N D-174). Episodios legacy: se muestran sin chip, no se bloquea lectura. |
| CV-7 | Sin permisos / contexto incorrecto | 401 sin sesión; 403 INVALID_CONTEXT sin WORKSHOP; 403 PERMISSION_DENIED (`employee`); 403 si intenta cerrar un episodio de otro taller. |
| CV-8 | Episodio ya cerrado | Cierre → 409 "La atención ya fue cerrada"; adjuntos → 409 (mecanismo existente); UI sin acciones de escritura. |
| CV-9 | Taller B ve el episodio del taller A | **Hoy: 404** (C-6). Requerido: proyección resumida (resumen + adjuntos, **con `customerComplaint` y `customerNotes`** — D-175; **sin `internalNotes`**, sin PII), solo lectura. |
| CV-10 | Taller B sin ninguna relación con el vehículo | 404/403 controlado (no revelar existencia); el lookup por placa sigue permitiendo iniciar un primer contacto (P2-3). |
| CV-11 | Odómetro menor al histórico | Modal de advertencia: confirmar (nunca bloqueo) o marcar "tablero reemplazado", que reinicia la base de comparación (RF-8/D-164). |
| CV-12 | Error de red en el lookup | Estado de error + Reintentar; **no** ofertar "crear vehículo" (evita duplicar). |
| CV-13 | Placa repetida concurrente (carrera) | P2002 → reutilizar (RF-15); sin 500. |
| CV-14 | Taller sin especialidades cargadas | Catálogo completo + aviso "Cargá las especialidades de tu taller" (no se bloquea el ingreso). |
| CV-15 | Vehículo creado en el taller y reclamo posterior | El alta **no** crea ownership ni User; el titular lo define el módulo de reclamo (dado). |
| CV-16 | Cierre con consumidor de reclamo caído | `delivered` persistido igual; evento logueado para reintento; la atención no vuelve a `open`. |

## 10. Criterios de aceptación (numerados)

### Happy path

1. Dado un miembro `owner` con contexto WORKSHOP, cuando escribe una **placa inexistente** y completa marca, modelo y odómetro de ingreso (sin celular — es **opcional**, OA-03), entonces `POST /api/care-episodes/check-in` responde 201 con `Vehicle` y `CareEpisode(open)` creados en la misma transacción, y ambos son consultables (detalle de atención + lookup de la placa ahora resuelve).
2. Dado el mismo miembro, cuando escribe una **placa existente** y confirma el vehículo encontrado, entonces se crea un `CareEpisode(open)` sobre el vehículo existente **sin** 409 y **sin** modificar la ficha del vehículo.
3. Dado el check-in exitoso, entonces `checkedInAt = now`, `workshopId`/`branchId`/`createdByMemberId` corresponden al contexto y `source = workshop`.
4. Dado un check-in con odómetro informado, entonces `mileageIn` queda persistido y la excepción `mileageInUnreadable` permanece `false`.
5. Dado un check-in con marca fuera del catálogo elegida como "Otra marca", entonces el vehículo se guarda con `brandName` en texto libre y el lookup lo devuelve (fallback `version → brandName`).
6. Dado un check-in con celular informado (área + número), entonces se persiste un registro de contacto **activo** `available` con `phoneE164` canónico (país de `DEFAULT_PHONE_COUNTRY_CODE`) y los dos campos de display (`phoneAreaCode`/`phoneNationalNumber`).
7. Dado un miembro con una atención abierta, cuando completa odómetro de egreso y al menos un tipo de atención y presiona "Cerrar atención", entonces `POST /api/care-episodes/:id/close` responde 200 con `status=delivered`, `closedAt` seteado, `mileageOut` persistido y los tipos asociados.
8. Dado el cierre exitoso de un vehículo **sin invite vigente y sin reclamo previo**, entonces se emite `care-episode.closed` con `{ careEpisodeId, vehicleId, workshopId }` **después** de la persistencia, y el consumidor del módulo de reclamo genera el invite (o queda registrado el fallo de reintento) **sin** que el estado del episodio dependa de ese resultado.
9. Dado el episodio cerrado, entonces aparece con badge "Entregado" en `/atenciones` (F-023) y en el timeline del propietario (2-3) sin regresiones de orden (D-070) ni de PII.
10. Dado un taller con ≥1 atención sobre un vehículo, cuando abre el historial del vehículo en contexto WORKSHOP, entonces ve todos los episodios (incluidos los de otros talleres) en modo lectura.

### Permisos y contexto

11. Dado un miembro en contexto PERSONAL (sin headers), cuando intenta check-in o cierre, entonces responde 403 (WorkshopOnlyGuard, antes del bypass de super_admin).
12. Dado un miembro con rol `employee`, cuando intenta check-in o cierre, entonces responde 403 PERMISSION_DENIED.
13. Dado un miembro activo del taller A, cuando intenta cerrar un episodio del taller B, entonces responde 403/404 controlado y **no** se modifica el episodio.
14. Dado un miembro sin `care-episode.close` (rol/custom sin asignar), cuando intenta cerrar, entonces responde 403 PERMISSION_DENIED.

### Borde

15. Dado un VIN informado que ya pertenece a otro vehículo, entonces el check-in responde 409 con mensaje específico (no 500) y conserva los datos del formulario.
16. Dado un vehículo existente con VIN distinto al informado, entonces responde 409 "El VIN no coincide con el vehículo registrado".
17. Dado el check-in **sin celular informado** (opcional desde 2026-11-01; con o sin la excepción "no disponible" marcada), entonces el vehículo queda con `status=unavailable` (sin canal de reclamo) y el flujo **no** se bloquea.
18. Dado un check-in sin odómetro y sin excepción, entonces responde 400 señalando el campo (no crea nada).
19. Dado el odómetro ilegible sin motivo o sin foto `before`, entonces responde 400; con ambos, crea el episodio con el flag activo.
20. Dado un odómetro menor al máximo histórico, entonces el backend devuelve el aviso con la referencia y, tras la confirmación del usuario, persiste (nunca bloquea); si el usuario marca "tablero reemplazado", la lectura persiste con la marca de excepción y las validaciones de no-regresión posteriores usan la nueva base (D-164).
21. Dado un cierre sin tipos de atención, entonces responde 400 "Agregá al menos un tipo de atención".
22. Dado un episodio con 3 tipos y un intento de agregar un cuarto, entonces responde 400 (máximo 3).
23. Dado el tipo "Otro" sin texto libre, entonces responde 400; con texto, persiste `customLabel` sin `serviceTypeId` (XOR). Regla de mantenimiento del catálogo: si "Otro" supera ~10% del uso, falta un tipo — se da de alta por admin **sin deploy** (§7.3.4, D-174).
24. Dado un cierre sobre un episodio ya `delivered`, entonces responde 409 sin modificar `closedAt`.
25. Dado un taller B (con atención propia sobre el vehículo) que abre el detalle de un episodio del taller A, entonces recibe resumen + adjuntos **incluyendo `customerComplaint` y `customerNotes`** (D-175), **sin** `internalNotes` y sin PII del propietario; sin relación previa sobre el vehículo → 404/403 controlado.
26. Dado un taller B que abre el historial del vehículo, entonces ve los episodios del taller A junto a los suyos y **no** puede editarlos ni cerrarlos.
27. Dado dos check-ins concurrentes con la misma placa, entonces no hay 500: uno crea y el otro reutiliza (RF-15).
28. Dado un taller sin especialidades, entonces el selector de tipos muestra el catálogo completo con el aviso de onboarding.
29. Dado un lookup con error de red/5xx, entonces la UI ofrece Reintentar y **no** ofrece "crear vehículo".

### Onboarding del taller

30. Dado un owner completando el wizard de claim del taller, cuando envía ≥1 especialidad, entonces `workshop_specialties` queda persistido en la misma transacción y el check-in filtra el catálogo por esas especialidades.
31. Dado el wizard sin especialidades, entonces responde 400 indicando el paso pendiente.

### Build / calidad

32. `npm run build` (backend) sin errores y `npm run db:generate` consistente con la migración.
33. Suites existentes de backend y frontend **sin regresiones** (en verde) **+** los **3 tests críticos** de OA-11 (D-178): (a) guard de transición de estado (`updateMany` de episodio e invite: un estado mal salido = vehículo reclamado dos veces), (b) atomicidad del check-in (`Vehicle` + `CareEpisode` en la misma transacción: fallo = vehículo huérfano), (c) test de contrato del GET pre-verificación del módulo de reclamos (no expone datos antes de verificar; control de seguridad).
34. Seed actualizado: permiso `care-episode.close` (owner+mechanic) + catálogo `service_types` con la **lista aprobada del 2026-11-01 (§7.3.4)** + filas `service_type_specialties` (los 2 tipos multi-especialidad con 2 filas cada uno).
35. Ninguna respuesta de este flujo expone `internalNotes` a talleres ajenos ni email/nombre/teléfono del propietario (select explícito, patrón Security Review #13); `customerComplaint` y `customerNotes` **sí** forman parte de la proyección multi-taller (D-175).
36. Dado un vehículo cuyo primer cierre ya generó invite de reclamo (o que ya fue reclamado), cuando se cierra una segunda atención, entonces el cierre responde 200 `delivered` y el consumidor de reclamo **no** genera un invite nuevo (D-172; omisión sin error, coherente con el índice único parcial del diseño de reclamos).

## 11. Dependencias de implementación y orden de trabajo

### 11.1 Bloqueadores verificados en el repo (dependencias de implementación)

| # | Bloqueador | Verificado en | Qué hay que hacer |
|---|---|---|---|
| B-1 | `RegisterVehicleHandler` rechaza contexto `WORKSHOP` con 403 fail-closed | `src/modules/vehicles/commands/register-vehicle/register-vehicle.handler.ts:54` | **Crear el vehículo dentro del comando de check-in (D-TL-B2, confirmado 2026-11-01)**, sin abrir la rama WORKSHOP de `RegisterVehicleHandler`: alta sin ownership (§7.4), sin `initialMileage` (regla de concesionaria, D-07/D-148), validación de placa/VIN existentes. |
| B-2 | El UNION de `assertWorkshopVehicleAccess` **no incluye `care_episodes`** | `src/common/authorization/vehicle-access.service.ts:501-513` | Agregar la pata `care_episodes` con `status <> 'cancelled'` para que el taller con una atención vigente pase el check de las rutas **maintenance** (full mode). |
| B-3 | `GET /vehicles/:id/history` usa el check **strict sin pata WORKSHOP** (`assertOwnershipOrSharedAccess`) | `src/modules/vehicles/controllers/vehicles.controller.ts:145-155` y `:725-736` | **Fuera del alcance de B-1/B-2/B-3 de este plan.** Habilitar lectura WORKSHOP en el historial (con proyección acorde a RF-10) es un alcance distinto de G-05; no confundir con la pata `care_episodes` del UNION. |
| B-4 | No existe command de cierre de `CareEpisode` (solo create, create-owner, attach, verify, remove-attachment) | `src/modules/care-episodes/commands/` | Nuevo comando `close` + permiso seed + evento `care-episode.closed`. |
| B-5 | `GET /care-episodes/lookup` devuelve 404 si la placa no existe (punto de ramificación a "crear") | `src/modules/care-episodes/queries/lookup-vehicle/lookup-vehicle.handler.ts:45-47` | Mantener el 404 como señal de rama en UI; el alta ocurre en el nuevo comando de check-in (no en el lookup). |
| B-6 | No hay `ServiceType`, ni `ServiceTypeSpecialty`, ni `mileageOut`, ni texto libre de marca/modelo en `Vehicle` | `prisma/schema.prisma` | Migración de §7.3 (5 objetos nuevos + columnas). |
| B-7 | `GET /care-episodes/:id` devuelve **404** al taller B por `episodeWorkshopId !== ctx.workshopId` | `get-care-episode.handler.ts:190-193` | Nueva proyección "resumida/neutral" para talleres ajenos con relación (RF-10). |
| B-8 | Los adjuntos se bloquean con 409 en `delivered`/`verified` | `attach-care-episode-attachments.handler.ts:235-251` | Orden de flujo: fotos de egreso **antes** de cerrar (RF-12). No se propone relajar el guard en MVP. |
| B-9 | `CareEpisodesModule` solo importa `AuthorizationModule`; `VehiclesModule` exporta `VEHICLE_REPOSITORY` (no el handler) | `care-episodes.module.ts`, `vehicles.module.ts:84` | Acoplamiento del check-in (importar módulo / inyectar token / invocar el handler) → **decisión del Tech Lead**. |
| B-10 | `WizardClaimDto` no pide especialidad (aunque `Specialty`/`WorkshopSpecialty` + seed de 12 existen) | `src/modules/workshops/dto/wizard-claim.dto.ts` | Agregar `specialtyIds` al claim + persistencia en la misma transacción. |

### 11.2 Orden de trabajo sugerido (fases)

| Fase | Contenido | Salida verificable | ¿Paralelizable? |
|---|---|---|---|
| **A — Modelo y catálogos** | Migración §7.3 (contacto, odómetro, ServiceType↔Specialty M:N, texto libre marca/modelo) + seed (`service_types` con la lista aprobada §7.3.4 + `service_type_specialties`, `care-episode.close`) | `db:migrate` + `db:seed` verdes; schemas Prisma generados | Precondición de B y C. |
| **B — Check-in unificado** | Comando `check-in` atómico que crea el vehículo si falta (D-TL-B2; **no** se abre `RegisterVehicleHandler`) + rediseño de `/atenciones/nueva` | AC 1-7, 15-23, 27-29, 34 | Después de A. |
| **C — Cierre** | Comando `close` + permiso + UI de cierre (egreso, tipos, fotos `after` previas) + evento `care-episode.closed` | AC 8, 9, 21, 24 | Después de A; puede correr en paralelo con B si comparte contrato de tipos. |
| **D — Lectura multi-taller** | B-7 (proyección resumida) + B-3 (historial en contexto WORKSHOP) + B-2 (UNION maintenance) | AC 10, 25, 26, 35 | Independiente: puede arrancar en paralelo a B. |
| **E — Onboarding de especialidad** | B-10 (wizard) + fallback RF-9 en la UI | AC 28, 30, 31 | Independiente. |
| **F — Conexión con reclamo** | Listener del módulo dado sobre `care-episode.closed` con la **regla de primer cierre** (D-172: skip si hay invite vigente o reclamo previo), lectura del contacto activo (§7.3.3, campo `phoneE164`) y fallback QR si `unavailable`; que el cierre no dependa de la entrega | AC 8, 36, 16 (CV-16) | Después de C; el diseño de reclamos ya usa `care-episode.closed` (choque cerrado 2026-11-01). |
| **G — Enmiendas documentales** | Enmiendas ya CONFIRMADAS (D-159/D-160, `DECISION-REGISTER.md` §42 + D-035 A1 / D-038 A1, 2026-10-31): actualizar los textos de `vehicle-register-flow.md` (D-035/D-038) y `care-episode-create-flow.md` (F-020 §5) para que digan lo que se decidió | Specs consistentes con el registro | Puede correr en paralelo con B-F. |

## 12. Decisiones de producto abiertas (requieren confirmación del fundador)

> **Actualizado 2026-10-31:** desconflictado con el diseño de reclamos e ingresado en `DECISION-REGISTER.md` §42: **D-159, D-160 (enmiendas), D-164 (odómetro, Decisión A), D-166 (tipos al cierre, Decisión B), D-172 (link solo en el primer cierre, Decisión C)** — las enmiendas son la Decisión D. **OA-01, OA-02 y OA-12 quedan RESUELTAS.**
>
> **Actualizado 2026-11-01:** nuevas decisiones del fundador, ingresadas en `DECISION-REGISTER.md` §42 — **OA-03** (celular opcional + dos inputs área/número + país fijo `DEFAULT_PHONE_COUNTRY_CODE` + E.164 canónico → **D-173**), **OA-04** (M:N `ServiceType↔Specialty` + semilla aprobada — lista en §7.3.4 — + regla "Otro" >10% → **D-174**), **OA-09** (visibilidad multi-taller = todo salvo `internalNotes` y PII, incluye `customerComplaint`/`customerNotes` → **D-175**), **OA-10** (sin reapertura en MVP → **D-176**), **OA-05** (foto `before` recomendada, no bloqueante → **D-177**) y **OA-11** (solo 3 tests críticos → **D-178**) quedan **RESUELTAS**. **Quedan abiertas: OA-06, OA-07 y OA-08** (todas con recomendación por defecto, no bloqueantes). Las decisiones abiertas de **ambos** documentos (incl. F-1..F-11/S-1..S-4/P-1..P-2 del diseño de reclamos) quedan consolidadas con recomendación por defecto y bloqueantes marcados en `DECISION-REGISTER.md` §42.

| ID | Decisión abierta | Qué sabemos | Qué no sabemos | Recomendación del PM |
|---|---|---|---|---|
| ~~**OA-01 (D-166)**~~ **RESUELTA (Decisión B, 2026-10-31)** | **Obligatorio al cierre, opcional al ingreso (confirmado).** | Máx. 3, catálogo global, "Otro"; el motivo del cliente ya se pide como texto. | — | El ingreso puede nacer de un diagnóstico; la obligatoriedad vive donde aporta valor: el cierre (RF-9, CV-6, AC-21). |
| ~~**OA-02 (D-164)**~~ **RESUELTA (Decisión A, 2026-10-31)** | **Máximo histórico + excepción "tablero reemplazado" que reinicia la base de comparación (confirmado).** | D-150 ya medía contra el máximo histórico; coherencia confirmada. | — | Modal con la referencia visible; la excepción queda auditada quién/cuándo (RF-8, CV-11, AC-20). |
| ~~**OA-03 (D-161/D-173)**~~ **RESUELTA (Decisión del fundador, 2026-11-01)** | **Celular OPCIONAL en el alta; dos inputs en la UI (área + número, sin longitud fija); país fijo `DEFAULT_PHONE_COUNTRY_CODE` (default `+54`); E.164 canónico en columna única + dos campos de display (confirmado).** | Ejemplos reales: `336 4687486` (7 dígitos), `11 22681000` (8); el `wa.me` se arma **solo** desde el E.164. | — | La semántica `status=unavailable` ("sin canal de reclamo") se mantiene para cuando no se carga; ~90% de los casos el taller ya tiene el contacto, exigirlo frenaba el mostrador (RF-4, RF-6, §7.3.3, CV-4, AC 6/17). |
| ~~**OA-04 (D-165/D-174)**~~ **RESUELTA (Decisión del fundador, 2026-11-01; LISTA DE TIPOS APROBADA el 2026-11-01)** | **M:N `ServiceType↔Specialty` (revierte la 1:N del borrador) + semilla aprobada enumerada en §7.3.4 — 14 códigos para las 3 especialidades del piloto (conteo confirmado 2026-11-01).** | Un tipo puede pertenecer a varias especialidades: **"Diagnóstico por escáner"** y **"Batería / alternador"** están en mecánica general **y** electricidad (2 filas cada uno en la intermedia). | — | Regla de mantenimiento: si "Otro" supera ~10% del uso, falta un tipo en el catálogo (alta por admin, sin deploy); "Otro" **no** es fila del catálogo (§7.3.4, RF-9, CV-6, AC 23/34; lista registrada en `DECISION-REGISTER.md` §42 / D-192). |
| ~~**OA-05 (D-170/D-177)**~~ **RESUELTA (Decisión del fundador, 2026-11-01)** | **Foto `before` RECOMENDADA, no bloqueante (confirmada; ya estaba en el cuerpo del spec).** | El cierre no se bloquea sin foto. | — | Recomendación + contador en la UI ("0/1 fotos"); obligatoria **solo** en la excepción de odómetro ilegible (RF-12, AC 19). |
| **OA-06 (D-160)** | **¿Unificar también el alta PERSONAL con texto libre de marca/modelo?** | D-038 lo prohibe hoy; el flujo de taller lo necesita. | Si el propietario debe tener la misma opción ya. | Dejar F-010 como está en esta iteración y unificar después (evita tocar un journey aprobado sin necesidad). |
| **OA-07 (D-169)** | **Especialidad obligatoria en el wizard + talleres ya activos sin especialidad** | El wizard no la pide; los talleres seed sí tienen especialidades. | Qué hacer con talleres activos sin ninguna. | Exigirla **solo en el wizard nuevo**; para los existentes, fallback de catálogo completo + banner "Completá tu perfil" (RF-9). |
| **OA-08** | **¿El km de ingreso se replica en `VehicleMileage`?** | La ficha/timeline de km usa `VehicleMileage`; el episodio tiene su propio `mileageIn`. | Si duplicarlo genera dos fuentes de verdad en conflicto. | **No duplicar en MVP** (el episodio es la fuente de esa lectura); reevaluar cuando el propietario reclame y quiera cargar km. |
| ~~**OA-09 (D-168/D-175)**~~ **RESUELTA (Decisión del fundador, 2026-11-01)** | **Visibilidad multi-taller = "todo salvo `internalNotes`": `customerComplaint` (motivo de ingreso) y `customerNotes` SÍ son visibles para el taller con relación; solo se ocultan `internalNotes` y la PII del propietario (email/nombre/teléfono) (enmienda de D-168, confirmada).** | El requisito original decía "resumen + adjuntos, sin `internalNotes`"; hoy el timeline excluye `customerComplaint`. | — | Coherente con "la información del vehículo es del vehículo"; el taller B que ya trabajó el vehículo necesita el motivo y las notas del cliente (RF-10, CV-9, AC 25/35). |
| ~~**OA-10 (D-167/D-176)**~~ **RESUELTA (Decisión del fundador, 2026-11-01)** | **Sin reapertura de atención cerrada en el MVP (confirmada; ya estaba en el cuerpo del spec).** | No existe comando de reapertura; el cierre dispara el reclamo. | — | Corrección por registro nuevo/edición futura (2-5, D-075). Si el fundador la pide después, requiere invalidar/regenerar el link de reclamo. |
| ~~**OA-11 (D-178)**~~ **RESUELTA (Decisión del fundador, 2026-11-01)** | **Tests pospuestos, con 3 excepciones críticas (confirmado):** (1) **transiciones de estado** — guard `updateMany` de episodio e invite (un estado mal salido = vehículo reclamado dos veces), (2) **atomicidad del check-in** — `Vehicle` + `CareEpisode` en la misma transacción (fallo = vehículo huérfano), (3) **test de contrato del GET pre-verificación** del módulo de reclamos (no expone datos antes de verificar; control de seguridad). | Además: las suites existentes de backend y frontend deben seguir **en verde**. | — | Cobertura mínima alrededor de invariantes de integridad del historial, no de UI (AC 33). |
| ~~**OA-12 (D-159/D-160)**~~ **RESUELTA (Decisión D, 2026-10-31)** | **Enmiendas CONFIRMADAS** a D-035, D-038 y F-020 §5, registradas con fecha y motivo (`DECISION-REGISTER.md` D-035 A1, D-038 A1, §42). | El fundador aprobó las tres (GTM "taller primero"). | — | Pendiente solo la actualización de los textos de las specs (Fase G). |

**COORDINACIÓN RESUELTA (2026-10-31, contra `docs/designs/vehicle-claim-technical-design.md`):** (a) **payload mínimo** consumido del evento: `{ vehicleId, careEpisodeId, workshopId }` — el diseño ya prevé `careEpisodeId` opcional en el invite (trazabilidad del origen); (b) **`status=unavailable`** → el invite se genera igual y se entrega **solo QR** en mostrador (`ownerPhone` opcional, F-7 del diseño; nunca bloquea el cierre); (c) **solo el primer cierre** genera enlace (D-172): skip si hay invite vigente o reclamo previo, coherente con su índice único parcial "un invite activo por vehículo". **Choques del lado del diseño de reclamos — TODOS RESUELTOS el 2026-11-01:** (1) §1.2/§3.2 ya citan D-038 como **enmendada** por D-160; (2) D-TL-VC-9/F-6/PR-7 ya usan `care-episode.closed` (no `delivered`); (3) §3.2 ya reconoce `VehicleOwnerContact` (D-161) y su campo canónico `phoneE164` (D-173) como fuente del contacto. Registro de los choques: `DECISION-REGISTER.md` §42.

## 13. Solicitud de análisis técnico al Tech Lead

El PM define **qué** y **por qué**; el Tech Lead define **cómo**. Para diseño técnico se requiere:

1. **Contrato del comando unificado**: ruta (propuesta `POST /api/care-episodes/check-in`, declarada antes de las rutas dinámicas `:id/*`, patrón F-012), DTOs (check-in + cierre), shape de respuesta (`{ reused, vehicle, careEpisode }`) y manejo de P2002 (RF-15).
2. **Acoplamiento de módulos** (B-9): cómo el check-in invoca el alta de vehículo (`VehiclesModule` exporta token de repositorio, no el handler) sin acoplamiento circular.
3. **Transaccionalidad**: si `Vehicle` + `CareEpisode` + contacto + tipos viven en un `prisma.$transaction` único del handler de check-in (recomendado por RF-1) y en uno aparte para el cierre.
4. **Mecánica del aviso de odómetro regresivo** (RF-8/D-164): dónde se calcula la referencia (máximo histórico combinando `VehicleMileage` + `CareEpisode.mileageIn`) y el protocolo de confirmación (código de error + reenvío con flag, u otro).
5. **Proyección multi-taller** (B-3/B-7): si el historial se habilita con pata WORKSHOP en el check strict, con qué `select` explícito (RF-10; OA-09 **resuelta** → D-175: incluye `customerComplaint`/`customerNotes`, oculta solo `internalNotes` + PII) y si el detalle de episodio ajeno reutiliza `GET /care-episodes/:id` con una nueva proyección.
6. **Throttling** del nuevo endpoint de check-in (el lookup ya tiene 30/60s) y del cierre.
7. **Índices/cheques**: índice único parcial del contacto activo, CHECK XOR de tipos, invariantes de odómetro (¿en handler, en CHECK de migración, o ambos?).
8. **Super_admin** en los endpoints nuevos (mismo patrón WorkshopOnly-antes-de-Permissions, o excepción explícita).
9. **Excepción "tablero reemplazado"** (RF-8/D-164): cómo se persiste la marca de reinicio de la base de comparación (flag+autor+fecha en la lectura, tabla aparte o columna en `Vehicle`) y cómo interactúa con la validación de no-regresión de `POST /vehicles/:id/mileage` (D-150) para que **ambas rutas usen la misma base**. Auditoría mínima: quién marcó la excepción y cuándo (patrón D-156).

---

## DECISIONES DE PRODUCTO PROPUESTAS (para confirmar con el fundador junto a §12)

1. **D-158 — Ingreso unificado en un solo acto:** placa → existe, reutilizar con confirmación; no existe, crear `Vehicle` + `CareEpisode(open)` en una transacción. Dos formularios separados descartados.
2. **D-159 — El taller registra vehículos desde el día 1** (enmienda de D-035 **y** de F-020 §5; GTM "taller primero"). **CONFIRMADA 2026-10-31 (Decisión D) — registrada en `DECISION-REGISTER.md` §42.**
3. **D-160 — Texto libre de marca/modelo desde el taller** ("Otra marca"/"Otro modelo"; enmienda de D-038). **CONFIRMADA 2026-10-31 (Decisión D) — registrada en `DECISION-REGISTER.md` §42.**
4. **D-161 — Contacto del propietario en tabla nueva `vehicle_owner_contacts`**, sin `User` y sin `VehicleOwnership` (el celular es **opcional** en el alta desde D-173).
5. **D-162 — Excepción "sin celular" = vehículo sin canal de reclamo**, nunca bloquea el mostrador. *Aplica también cuando el celular simplemente no se informa — celular opcional, D-173.*
6. **D-163 — Odómetro obligatorio (ingreso y egreso)** con excepción "no legible" + motivo + foto.
7. **D-164 — Odómetro regresivo: contra el MÁXIMO HISTÓRICO, advertencia con confirmación o excepción "tablero reemplazado" (reinicia la base de comparación), nunca bloqueo.** **CONFIRMADA 2026-10-31 (Decisión A).**
8. **D-165 — Tipos de atención: catálogo global `ServiceType` ↔ especialidad M:N (D-174), episodio↔tipo M:N máx. 3, "Otro" con texto libre** (nunca enum por taller). **Relación con especialidad CONFIRMADA M:N + semilla aprobada (lista enumerada en §7.3.4) 2026-11-01 (OA-04).**
9. **D-166 — Obligatoriedad del tipo: AL CIERRE (≥1), opcional al ingreso.** **CONFIRMADA 2026-10-31 (Decisión B).**
10. **D-167 — Cierre `open → delivered` con `closedAt` + evento `care-episode.closed`** que dispara el link de reclamo (módulo dado), sin dependencia de la notificación. *Refinada por D-172 (solo el primer cierre genera enlace).*
11. **D-168 — Lectura multi-taller:** cada taller escribe lo suyo y lee el resto en proyección resumida = **todo salvo `internalNotes` y PII del propietario** (incluye `customerComplaint`/`customerNotes` — **enmendada por D-175, 2026-11-01**).
12. **D-169 — El onboarding del taller pasa a pedir especialidad** (`WizardClaimDto`).
13. **D-170 — Fotos opcionales con recomendación de 1 en `before`; obligatorias solo con odómetro ilegible** (OA-05). **CONFIRMADA 2026-11-01.**
14. **D-171 — El alta desde taller NO crea titularidad** (consistente con D-155 y con "el vehículo sin titular no es propiedad del taller").
15. **D-172 — El link de reclamo se genera SOLO en el primer cierre del vehículo** (un invite activo por vehículo; skip si hay invite vigente o reclamo previo; "sin canal de reclamo" → solo QR, nunca bloquea el cierre). **CONFIRMADA 2026-10-31 (Decisión C) — registrada en `DECISION-REGISTER.md` §42.**
16. **D-173 — Celular OPCIONAL en el alta** (enmienda de D-161/D-162): dos inputs en la UI (área + número, sin longitud fija, ej. `336 4687486` / `11 22681000`), país fijo `DEFAULT_PHONE_COUNTRY_CODE` (default `+54`, sin selector de país), E.164 canónico en columna única + dos campos de display; `wa.me` armado **solo** desde el E.164. **CONFIRMADA 2026-11-01 (OA-03).**
17. **D-174 — `ServiceType↔Specialty` es M:N** (tabla `ServiceTypeSpecialty`; **revierte** la 1:N propuesta en el borrador): **semilla APROBADA enumerada en §7.3.4** (14 códigos para mecánica general, chapa y pintura y electricidad; "Diagnóstico por escáner" y "Batería / alternador" en 2 especialidades — conteo confirmado 2026-11-01); si "Otro" supera ~10% del uso, falta un tipo — alta por admin, sin deploy. **CONFIRMADA 2026-11-01 (OA-04); lista aprobada registrada en `DECISION-REGISTER.md` §42 / D-192.**
18. **D-175 — Visibilidad multi-taller = todo salvo `internalNotes` y PII del propietario** (enmienda de D-168): `customerComplaint` y `customerNotes` **sí** son visibles para el taller con relación sobre el vehículo. **CONFIRMADA 2026-11-01 (OA-09).**
19. **D-176 — Sin reapertura de atención cerrada en el MVP** (corrección por registro nuevo / edición futura, 2-5 D-075). **CONFIRMADA 2026-11-01 (OA-10).**
20. **D-177 — Foto `before` recomendada, no bloqueante** (obligatoria solo con odómetro ilegible; contador "0/1 fotos" en la UI). **CONFIRMADA 2026-11-01 (OA-05).**
21. **D-178 — Testing: solo 3 tests críticos** — guard de transiciones de estado (`updateMany` episodio/invite), atomicidad del check-in (`Vehicle` + `CareEpisode` en la misma transacción) y contrato del GET pre-verificación de reclamos — **más las suites existentes en verde**; el resto del testing queda pospuesto. **CONFIRMADA 2026-11-01 (OA-11).**

---

*Fin de la especificación — lista para análisis técnico del Tech Lead y confirmación de las decisiones abiertas del fundador.*
