# Especificación: F-020 — Crear CareEpisode desde Taller (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-11
> **Estado:** v2 — Aprobada por Tech Lead (2026-09-11). Lista para implementación.
> **Basado en:** docs/features.md (Fase 2 F-020), D-005 (PENDING → resolviendo policy MVP), D-022 (policies MVP), D-023 (walk-in), D-024 A2 (WORKSHOP-only writes, ACCEPTED), P2-1..P2-6 (confirmadas por usuario 2026-09-11), D-020 A1 (contexto por headers)

---

## 1. Problema

El journey del propietario está completo (F-010..F-014), pero **no existe la historia clínica del vehículo**:

- No existe modelo `CareEpisode` en Prisma (D-005 PENDING); ServiceRecord/WorkOrder/Estimate no cuelgan de ningún episodio.
- El módulo maintenance existe con writes WORKSHOP-only (D-024 A2), pero el **frontend no tiene contexto de taller** (no envía `X-Context-Type`/`X-Context-Id`, no hay selector de taller) → ningún usuario puede operar en WORKSHOP desde la UI.
- El taller no puede encontrar un vehículo de un cliente para registrar una atención (el listado `GET /vehicles` es ownership-scoped).

## 2. Objetivo

Completar el journey **"el taller registra el ingreso (check-in) de un vehículo"** end-to-end:

1. El miembro de taller selecciona su taller (selector de contexto en el header) → el frontend opera en contexto WORKSHOP.
2. Busca un vehículo existente por placa (sin ser owner) y lo selecciona.
3. Registra el CareEpisode (check-in): datos mínimos del ingreso.
4. El episodio nace en estado `open`, se emite `CareEpisodeCreated`, y queda como base de la historia clínica del vehículo (F-021/F-022/F-023/F-024 usan esta entidad).

## 3. Actores

| Actor | Acceso |
|---|---|
| **Miembro de taller activo** (owner/mechanic) | CONTEXTO WORKSHOP — crea CareEpisodes. Rol de taller con permiso `care_episode.create`. |
| Miembro con rol `employee` | NO crea episodios (solo appointment, matriz existente). |
| Propietario | NO crea episodios en esta iteración (P2-1: propietario registra servicios propios en iteración 2-2). |
| super_admin | Bypass por PermissionsGuard (matriz existente). |

## 4. Decisiones de producto confirmadas (P2-1..P2-6, 2026-09-11)

| ID | Decisión | Detalle |
|---|---|---|
| **P2-1** | Al crear un CareEpisode, **solo el taller** puede hacerlo en esta iteración | Respeta D-024 A2 (ACCEPTED): el registro de atenciones es actividad del taller; writes de maintenance requieren contexto WORKSHOP. El propietario registrando servicios propios (`source=owner`) es la **iteración 2-2** (requiere amendar D-024 A2 parcialmente — decisión aparte). |
| **P2-2** | **Walk-in permitido** (appointment NO obligatorio) | D-023: `Appointment = reserva`; `CareEpisode = atención efectivamente iniciada`. El episodio nace en el check-in (el vehículo ingresa), con o sin appointment previo. `appointmentId` es opcional. |
| **P2-3** | **Primer contacto taller↔vehículo:** el taller puede crear un episodio sobre cualquier vehículo existente (buscado por placa), aunque no tenga historial propio | Es el onboarding natural (el taller atiende el vehículo de un cliente). El episodio crea la asociación taller↔vehículo (derivada, D-019 PENDING), visible en la timeline del propietario. Mitigación: el look-up por placa es controlado (ver RF-4), auditoría de creación, la asociación queda expuesta al propietario. |
| **P2-4** | Permiso nuevo `care_episode.create` asignado a roles **owner + mechanic** del taller | Employee NO. Consistente con la matriz: mechanic ya crea service records. |
| **P2-5** | **Nivel de confianza / Trust: DIFERIDO** | El Trust Profile es conceptual (ROADMAP 0); no se implementa infraestructura de confianza en esta iteración. La UI del detalle del episodio puede mostrar "Registrado por {taller}" como dato informativo (sin sistema de confianza). |
| **P2-6** | **Frontend mínimo de taller:** selector de contexto (dropdown en header) + página de creación de episodio (buscar por placa → check-in) | Mínimo indispensable para un journey end-to-end (D-020 A1). SIN la UI completa de taller (Fase 4: F-040..F-045). |

## 5. User Journey

```
Actor: Miembro de taller (owner o mechanic) autenticado
  ↓
Contexto: En el dashboard ve el selector de taller (dropdown en header, desde /auth/me workshopMemberships)
  ↓
Selecciona "Taller Mecánico Central" → el frontend activa contexto WORKSHOP
  (envía X-Context-Type: WORKSHOP + X-Context-Id en adelante para este taller)
  ↓
Navega a "Nueva atención" (link en el header o dashboard)
  ↓
Busca vehículo por placa "ABC123" → GET lookup → selecciona el vehículo
  ↓
Formulario de check-in: branch (pre-seleccionada), fecha/hora de ingreso (now), 
  kilometraje de ingreso (opcional), motivo/queja (opcional), notas (opcional)
  ↓
POST /api/care-episodes (contexto WORKSHOP, permiso care_episode.create)
  ↓
Sistema: crea CareEpisode estado 'open', emite CareEpisodeCreated
  ↓
Resultado: UI muestra resumen del episodio creado ("Atención ingresada OK — vehículo ABC123")
```

### Flujo alternativo: vehículo no encontrado
```
  ↓
El taller escribe placa sin match → mensaje "No se encontró un vehículo con esa placa"
  ↓
Solución: el vehículo debe existir (lo registra el propietario, F-010). El taller NO lo registra en esta iteración.
```

### Flujo alternativo: contexto incorrecto / permisos
```
  → Sin X-Context-Type WORKSHOP → 403 INVALID_CONTEXT (WorkshopOnlyGuard)
  → Rol employee → 403 PERMISSION_DENIED (PermissionsGuard)
  → Miembro inactivo → 403 (WorkshopGuard)
```

## 6. Reglas de Negocio / Requisitos Funcionales

### RF-1: Creación (check-in)
- `POST /api/care-episodes` opera EXCLUSIVAMENTE en contexto WORKSHOP (D-024 A2). En PERSONAL → 403 por diseño.
- El autor es el miembro de taller autenticado (se persiste `createdByMemberId` + `workshopId` del contexto).
- El episodio nace en estado `open`.
- `vehicleId` es obligatorio y debe referirse a un vehículo existente (404 si no).
- `branchId` es obligatorio y debe pertenecer al taller del contexto (404/403 si no).
- `appointmentId` opcional; si viene, debe pertenecer al vehículo y al taller (si no, 404).
- Evento `CareEpisodeCreated` emitido tras éxito (payload: `{ careEpisodeId, vehicleId, workshopId, createdByMemberId }`).

### RF-2: Búsqueda de vehículo por placa para el taller
- Endpoint de lookup accesible en contexto WORKSHOP: `GET /api/care-episodes/lookup?plate=ABC123` (WORKSHOP-only). **Decisión TL:** vive en el módulo nuevo `care-episodes`, NO en vehicles — evita el foot-gun de `@Get(':id')` (F-012) y no contamina el controller PERSONAL-strict (D-035).
- Exige placa exacta (normalizada trim+uppercase, D-037/D-042).
- Devuelve datos mínimos para el check-in: `id`, `licensePlate`, `brand`, `model`, `version`, `manufactureYear`, `modelYear` (sin PII del propietario ni ownership). NO devuelve email/nombre del owner (los episodios del taller se asocian al vehículo, no al dueño).
- Sin match → 404 "Vehicle not found" (mensaje controlado).
- Rate-limit: **decisión TL** — usar `@nestjs/throttler` (ya existe; `ThrottlerModule` add-on por endpoint, NO global en app.module). En el lookup: `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 30, ttl: 60_000 } })`. 30/60s mitiga enumeración sin romper UX de check-in (el default 10/60s sería demasiado agresivo). Sin infraestructura nueva.

### RF-3: Contexto WORKSHOP en el frontend (P2-6)
- Selector de taller en el header del dashboard: lista `workshopMemberships` de `/auth/me`.
- Al seleccionar un taller, el cliente API envía `X-Context-Type: WORKSHOP` + `X-Context-Id: {workshopId}` en todas las llamadas **EXCEPTO las rutas `auth/*`** (login/refresh/logout/me/verify) — un contexto stale en `/auth/me` rompería el bootstrap de sesión con 403 INVALID_CONTEXT (ContextResolver).
- Al deseleccionar (o por defecto), PERSONAL (sin headers — comportamiento actual intacto, D-035).
- El contexto es **por-sesión en memoria** del frontend (sin persistencia entre refreshes en esta iteración — D-021 PENDING). Compatible con D-020 A1 (headers por request).
- El selector permite volver a "Personal" (contexto por defecto).
- `clearSession()` (logout) DEBE resetear el contexto a `null`: si no, el próximo login hereda un `workshopId` stale y toda la navegación PERSONAL falla con 403.

### RF-4: Primer contacto taller↔vehículo (P2-3)
- El taller puede crear un episodio sobre un vehículo con el que NO tiene historial previo (lookup → check-in directo).
- NO se implementa "vehículos del taller" en esta iteración (D-019 PENDING; listado F-023).

### RF-5: Permisos
- Nuevo permiso `care_episode.create` (módulo `care-episode`, resource `care-episode`, action `create`) en seed.
- Roles taller: `owner` + `mechanic` lo tienen; `employee` NO.
- El controller usa `WorkshopOnlyGuard` + `PermissionsGuard` + `@Permissions('care_episode.create')` (patrón maintenance).

### RF-6: Sin cambios en los writes existentes de maintenance
- `POST /service-records`, `POST /work-orders`, etc. se mantienen como están (sin exigir `careEpisodeId` todavía). La vinculación a episodio abierto es **iteración posterior** (2-2 o F-021/F-022), junto con la decisión de cuándo un servicio cuelga de un episodio.

## 7. Contrato Backend (propuesta de diseño — sujeto a validación TL)

### Modelo Prisma (MIGRACIÓN — VALIDADA POR TL; ejecutar con Database)

```prisma
model CareEpisode {
  id                  String      @id @default(uuid()) @db.Uuid
  vehicleId           String      @map("vehicle_id") @db.Uuid
  workshopId          String      @map("workshop_id") @db.Uuid
  branchId            String      @map("branch_id") @db.Uuid
  appointmentId       String?     @map("appointment_id") @db.Uuid
  createdByMemberId   String      @map("created_by_member_id") @db.Uuid
  status              CareEpisodeStatus @default(open)
  mileageIn           Int?        @map("mileage_in")
  customerComplaint   String?     @map("customer_complaint") @db.VarChar(500)
  customerNotes       String?     @map("customer_notes") @db.VarChar(1000)
  internalNotes       String?     @map("internal_notes") @db.VarChar(1000) // opcional, solo taller
  checkedInAt         DateTime    @map("checked_in_at") @db.Timestamptz
  closedAt            DateTime?   @map("closed_at") @db.Timestamptz
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")
  vehicle             Vehicle     @relation(...) // onDelete: Restrict (histórico)
  workshop            Workshop    @relation(...) // onDelete: Restrict
  branch              WorkshopBranch @relation(...) // onDelete: Restrict
  appointment         Appointment? @relation(...) // onDelete: SetNull
  createdByMember     WorkshopMember @relation(...) // onDelete: Restrict
  serviceRecords      ServiceRecord[]
  workOrders          WorkOrder[]
  estimates           Estimate[]
  @@index([vehicleId, createdAt])
  @@index([workshopId, createdAt])
  @@index([status])
  @@map("care_episodes")
}

enum CareEpisodeStatus { open delivered cancelled }
```

- FK aditivas NULLABLE en `ServiceRecord.careEpisodeId`, `WorkOrder.careEpisodeId`, `Estimate.careEpisodeId` con **`onDelete: Restrict`** (corrección TL). ADR-005 T3 clasifica CareEpisode/ServiceRecord/WorkOrder/Estimate como categoría histórica: NO delete físico; `SetNull` destruiría la trazabilidad si se borrara un episodio con hijos. Solo `Appointment` (del episodio) conserva `SetNull` (patrón `WorkOrder.appointmentId`). Sin migración de datos (columnas null al inicio).
- **Transitoriedad T4 (registrada):** ADR-005 T4 exige `careEpisodeId` requerido en ServiceRecord; esta iteración lo deja NULLABLE y RF-6 no obliga a vincular. T4 se satisface cuando F-021/F-022 defina el ciclo de vida (deuda registrada, no es error).
- NO se tocan los writes de maintenance en esta iteración.

### Endpoints nuevos
| Ruta | Guard | Permiso | Descripción |
|---|---|---|---|
| `POST /api/care-episodes` | Jwt + Context + WorkshopOnly + Permissions | `care_episode.create` | Crea episode (check-in). Body: vehicleId, branchId, appointmentId?, mileageIn?, customerComplaint?, customerNotes?, internalNotes? |
| `GET /api/care-episodes/lookup?plate=` | Jwt + Context + WorkshopOnly + Throttler | (sin permiso granular; membership validada por resolver) | Busca vehículo por placa exacta para el taller. Devuelve datos mínimos sin PII. `@Throttle` 30/60s. |

> Ubicación (decisión TL): módulo nuevo `src/modules/care-episodes/` (controller + handlers + dto + event; sin repository — handler usa `PrismaService`, patrón maintenance). El lookup NO va en vehicles (foot-gun `:id` + semántica PERSONAL-strict). Guard order en el POST: `JwtAuthGuard` + `ContextGuard` (clase), `WorkshopOnlyGuard` + `PermissionsGuard` (método) — WorkshopOnly va ANTES de Permissions (evita bypass de super_admin). El evento `CareEpisodeCreated` extiende `BaseEvent` (`super('care-episode.created')`).

### DTOs (propuesta)
```typescript
CreateCareEpisodeDto {
  @IsUUID() vehicleId!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsInt() @Min(0) mileageIn?: number;
  @IsOptional() @IsString() @MaxLength(500) customerComplaint?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNotes?: string;
  @IsOptional() @IsString() @MaxLength(1000) internalNotes?: string;
}
```

### Validación de branchId
- El branch debe pertenecer al `workshopId` del contexto (query por id + workshopId).

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Migración Prisma `CareEpisode` + FKs nullable (validada y ejecutada por Database).
- `POST /care-episodes` + handler + DTO + evento `CareEpisodeCreated` + tests. **El handler valida existencia del vehículo con `findUnique` (404 si no), SIN pasar por `VehicleAccessService.assertVehicleAccess` full mode** (que exigiría asociación taller↔vehículo previa y rompería P2-3 — decisión deliberada de ampliación de superficie, cubierta en AC).
- `GET /care-episodes/lookup?plate=` + handler + tests (en módulo care-episodes — foot-gun `:id` evitado por diseño).
- Permiso `care_episode.create` + seed (owner/mechanic).
- Frontend: selector de contexto (dropdown header) + página "Nueva atención" (lookup por placa + form check-in + POST).
- Tests frontend (selector + página + api).

### Fuera (siguientes iteraciones)
- Editar CareEpisode (F-021), cerrar (F-022), listado episodios del taller (F-023), timeline con episodios (F-024).
- Propietario registra servicios propios (`source=owner`; amendar D-024 A2 parcialmente) — iteración 2-2.
- Vincular ServiceRecord/WorkOrder/Estimate a episodio abierto (cuando F-021/F-022 defina el ciclo de vida).
- Trust Profile / nivel de confianza (P2-5).
- Persistencia del contexto entre refreshes / route-driven (D-021).
- UI de taller completa (Fase 4: F-040..F-045).

## 9. Criterios de Aceptación

- [ ] Dado un miembro de taller (owner/mechanic) con contexto WORKSHOP activo, cuando crea un CareEpisode con vehicleId+branchId válidos, entonces el sistema responde 201 con el episodio `open`, `workshopId` = contexto y `createdByMemberId` = miembro.
- [ ] Dado el mismo miembro en contexto PERSONAL (sin headers), cuando intenta crear un CareEpisode, entonces responde 403 (D-024 A2).
- [ ] Dado un miembro con rol employee, cuando intenta crear un CareEpisode, entonces responde 403 PERMISSION_DENIED.
- [ ] Dado el lookup con placa exacta existente, cuando el taller lo consulta en contexto WORKSHOP, entonces devuelve datos mínimos del vehículo sin PII del propietario.
- [ ] Dado el lookup con placa inexistente, entonces responde 404 con mensaje controlado.
- [ ] Dado un branchId que no pertenece al taller del contexto, entonces responde 403/404.
- [ ] Dado un vehículo inexistente, entonces responde 404 (handler valida existencia por `findUnique`, SIN `assertVehicleAccess` full mode — P2-3: primer contacto no requiere asociación previa).
- [ ] Dado el alta exitosa, entonces se emite `CareEpisodeCreated` con `{ careEpisodeId, vehicleId, workshopId, createdByMemberId }`.
- [ ] Automatizado: el lookup vive en `GET /api/care-episodes/lookup?plate=...` y NO existe ruta `/api/vehicles/lookup` (foot-gun F-012 evitado por diseño). Regresión: `GET /api/vehicles/:id` intacto.
- [ ] Frontend: el selector de taller cambia el contexto (headers) y permite volver a Personal.
- [ ] Frontend: las llamadas `auth/*` NUNCA llevan headers de contexto; `logout` resetea el contexto a `null` (próximo login en PERSONAL limpio).
- [ ] Frontend: la página "Nueva atención" permite buscar por placa, ver el vehículo encontrado y crear el check-in con feedback de éxito/error.
- [ ] Regresión: los journeys PERSONAL (F-010..F-014) no se ven afectados por el selector de contexto (mismo comportamiento sin taller seleccionado).

### Build / Calidad
- [ ] Backend: `npm test` verde + build OK (sin romper 26 suites/247 tests).
- [ ] Frontend: `npm test` verde + build OK (sin romper 9 files/98 tests).
- [ ] Migración aplicada en dev (sin datos de producción).
- [ ] Seed actualizado (permiso `care_episode.create` + roles owner/mechanic).
- [ ] Sin dependencias nuevas (salvo decisión explícita del TL).

## 10. Dependencias

- D-020 A1 (contexto por headers, ACCEPTED), D-024 A2 (writes workshop-only, ACCEPTED), D-035 (vehículos en PERSONAL).
- D-005 (CareEpisode — se resuelve parcialmente con esta iteración; el schema completo/lifecycle se definirá en F-021/F-022).
- Backend workshops + maintenance existentes (reutilizar guards, permisos, patrón).
- `/auth/me` ya expone `workshopMemberships` (fuente del selector).
- F-012 patrón para el foot-gun de rutas `:id` (evitado: lookup en módulo nuevo).
- ADR-005 T3 (CareEpisode = categoría histórica, FKs Restrict) y T4 (careEpisodeId requerido a futuro — transitorio en F-020).
- `@nestjs/throttler` existente (ThrottlerModule add-on por endpoint, NO global; decisión TL: 30/60s en lookup).

## 11. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Migración aditiva sobre BD con datos (FKs nullable) | Media | Migración validada por Database; no eliminar/renombrar nada; columnas null al inicio. |
| Foot-gun `@Get(':id')` con ruta lookup | Eliminado | El lookup vive en el módulo care-episodes (sin `:id` previo); vehicles.controller intacto (PERSONAL-strict). |
| Lookup por placa desprotegido (enumeración/abuso) | Media | WorkshopOnly + ThrottlerGuard `@Throttle` 30/60s (mecanismo existente) + auditoría vía `createdByMemberId`. |
| Contexto stale en frontend (headers en `auth/*` o heredados tras logout) | Alta | Inyector excluye rutas `auth/*`; `clearSession()` resetea contexto; tests de api para PERSONAL/WORKSHOP/auth. |
| Primer contacto taller↔vehículo sin historial (P2-3) amplía la superficie de acceso | Media | Episodios siempre expuestos al propietario (F-024); auditoría; rate-limit del lookup. |
| Selector de contexto en frontend: headers en TODAS las llamadas puede romper llamadas PERSONAL si el estado se descompensa | Alta | Estado único y testeado: PERSONAL = sin headers; solo taller seleccionado → headers. Tests de api para ambos estados. |
| D-005 incompleto (lifecycle) | Media | Esta iteración solo crea `open`; F-021/F-022 define el lifecycle (no bloquear ahora). |

---

*Fin de la especificación F-020 (borrador).*