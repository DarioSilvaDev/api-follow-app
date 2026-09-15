# Especificación: Iteración 2-3 — CareEpisodes en el Timeline del Vehículo

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-15
> **Estado:** Borrador para validación técnica (Tech Lead) — decisiones de producto D-069..D-075 **confirmadas por el usuario el 2026-09-15**
> **Basado en:** F-014 (D-050..D-055), F-020, iteración 2-2 (D-062..D-068), deuda F-014 §1
> **Código afectado:** `GET /api/vehicles/:id/history`, sección "Historial" de `/vehicles/[id]`, modal de confirmación en `servicios/nueva`

---

## 1. Problema

El propietario registra servicios (`CareEpisode`, source=owner) y los talleres registran atenciones (source=workshop), pero **ninguno aparece en la sección "Historial" del vehículo**:

- `GET /api/vehicles/:id/history` retorna solo `{ transfers, mileages, ownerships }` (D-050: "Timeline vacío").
- Reporte verificado en producción (2026-09-15): el vehículo `AB029JW` tiene 2 episodios `source=owner` bien registrados en base, pero la UI solo muestra "Inicio de propiedad".
- El valor central del producto (historia clínica del vehículo) queda incompleto: los servicios son justamente el dato más valioso.

Fue alcance decidido en F-014 y quedó como deuda explícita ("se consumirá cuando lleguen los CareEpisodes"). Los CareEpisodes ya llegaron (F-020 + 2-2). Es hora de cerrar la deuda.

## 2. Objetivo

Mostrar los **CareEpisodes del vehículo** (tanto `source=owner` como `source=workshop`) dentro de la sección "Historial" del detalle, integrados al merge cronológico existente (D-052), con su estado de verificación visible ("Registrado por el propietario → pendiente/verificado", "Atención de taller").

Sin cambios de navegación: sigue siendo la quinta Card del detalle (D-051).

## 3. Actores

| Actor | Acceso |
|---|---|
| Owner activo | Ve la sección Historial completa, incluyendo los episodios del vehículo. |
| Usuario con acceso compartido | Ve la misma sección (el control de PII existente del history se mantiene; los episodios no exponen emails). |
| Backend | `GET /api/vehicles/:id/history` se amplía (cambio aditivo). |
| Taller | No se ve afectado aquí: su journey de verificación vive en la iteración 2-2 (cola). El propietario ve el resultado (`verification`) en el timeline. |

## 4. Decisiones de producto (propuestas — **confirmadas 2026-09-15**)

### D-069 — Incluir CareEpisodes en el timeline del vehículo (ambos sources)

- La "historia clínica" del vehículo incluye **todos** los episodios: los que registró el propietario (`source=owner`) y los que registraron talleres (`source=workshop`). Un vehículo con atención de taller registrada debe mostrar esa atención en su historial.
- Fuente: `GET /api/vehicles/:id/history` se amplía con un 4º array `careEpisodes` (opción A — aprobada por TL). El endpoint de maintenance (`GET /maintenance/vehicles/:id/history`) **NO se toca**: está pensado para service records / work orders / estimates (F-021+), otra capa.

### D-070 — Timestamp canónico del episodio para ordenar (merge)

- `serviceDate` cuando existe (owner, y taller cuando ya tenga servicio). Workshop sin `serviceDate` (nace `open` en check-in) → `checkedInAt ?? createdAt`.
- El resto del merge no cambia (D-052): transfers `createdAt`, mileages `recordedAt`, ownerships `startsAt`.
- **Implementación validada:** sort en JS post-query con clave `serviceDate ?? checkedInAt ?? createdAt` desc + tiebreak `createdAt` desc (el `orderBy` compuesto de Prisma NO equivale al coalesce — rechazado por TL).

### D-071 — Título y actor del episodio en el timeline (fallbacks definidos)

- **Contrato:** `title: string | null` (el schema es nullable; NO se normaliza en el handler).
- **Fallback de UI (decisión PM, TL pendiente §4.1 resuelta):**
  - `title` presente → se usa.
  - `title` null + `source=workshop` → "Atención de taller".
  - `title` null + `source=owner` → "Servicio registrado" (caso borde; el form de 2-2 exige título).
- Owner: título = regla de fallback anterior; actor = "Registrado por el propietario"; badge **solo si `verification === "verified"`** → "Verificado por {nombre del taller}".
- Fuente del nombre del taller (definida por TL, 4.4): **`workshop?.name ?? workshopName`** (relación viva con fallback al snapshot de texto libre). El gate del badge es `verification === "verified"` — **nunca** por presencia de `workshop` (un episodio owner pre-verificación ya tiene taller asignado sin haber verificado).
- Workshop: título = regla de fallback anterior; actor = "Taller {workshop?.name ?? workshopName}"; sin badge de verificación (los episodios de taller son confiables por su origen, D-064).
- Se muestran **todos** los estados (`open/delivered/cancelled`), consistente con D-054 (transfers muestran todos los estados). Episodio `cancelled` → título con sufijo "(cancelada)".
- **Copy de la Card Historial (aprobada):** "Atenciones, transferencias, kilometraje y cambios de propiedad." (TL pendiente §4.2 resuelto).

### D-072 — PII y acceso compartido

- El historial ya controla emails (Security Review #13). Los episodios solo exhiben: título, fechas, km, estado, taller (nombre), notas del cliente — no agregan exposición nueva.
- Un usuario con acceso compartido ve los episodios (consistente con D-046: el historial es parte de la vista del vehículo). Sin cambios de guard en `assertVehicleAccess`.

### D-073 — Sin paginación ni filtros en MVP

- Igual que el resto del timeline (D-053): el volumen esperado por vehículo es bajo. Los episodios se traen completos (`orderBy` por su timestamp desc).

### D-074 — Modal de confirmación al crear servicio (owner) — *confirmada 2026-09-15*

- Al confirmar el registro de un servicio desde el form del propietario, se muestra un modal de confirmación antes de enviar.
- Texto: **"No podrás editar ni cancelar este registro desde tu cuenta. Solo el taller asignado podrá gestionarlo. ¿Confirmás el registro?"** (Opción A aprobada).
- Al `cancelar` el modal → el form vuelve a editable (la acción no se ejecuta).
- Al `confirmar` → se envía `POST /api/care-episodes/owner` como hoy.
- **Sin cambios backend**: la regla "el propietario no edita" ya es real (no existe endpoint de edición). El modal es pura UX de transparencia.
- Este modal pertenece al form `servicios/nueva` (ya creado en 2-2) y se integra en **2-3** porque es de costo bajo y refuerza la comunicación de la regla de confianza.

### D-075 — Edición y cancelación de episodios: solo el taller asignado — *regla capturada, fuera de 2-3*

- **Regla de producto confirmada (2026-09-15):** la edición y cancelación de un care-episode es una operación exclusiva del taller asignado (`workshopId` del episodio), ejecutada desde el contexto del taller (WorkshopGuard). El propietario **nunca** puede editar ni cancelar sus propios registros.
- **No se implementa en 2-3.** Requiere una iteración dedicada (2-5 candidate) porque implica:
  - Nuevo endpoint: `PATCH /api/care-episodes/:id` (update selecto de campos) o `POST /api/care-episodes/:id/cancel`.
  - Decisiones: ¿qué campos puede cambiar el taller? (propuesta: title, serviceDate, mileageIn, customerNotes — nunca source/verification/workshopId).
  - Decisiones: si el episodio fue verificado y el taller lo edita, ¿la verificación se invalida? (propuesta: se invalida automáticamente, el taller debe re-verificar).
  - Auditoría: quién cambió qué y cuándo ( AuditLog ).
  - Seed: permisos `care-episode.update` / `care-episode.cancel`.
  - Security review de la operación.

### D-076 — Vehículos anteriores (ex-propietarios): corte por propiedad — *Opción B, fuera de 2-3*

- **Regla confirmada (2026-09-15, Opción B):** un ex-propietario puede acceder a la ficha e historial de un vehículo que ya no posee, pero **solo ve los eventos hasta el final de su ownership** (no ve atenciones futuras del nuevo dueño, manteniendo su privacidad).
- **No se implementa en 2-3.** Requiere iteración dedicada (2-4 candidate) porque implica:
  - Cambio en `assertVehicleAccess` / `VehicleAccessService` para permitir lectura al ex-propietario.
  - Regla de filtrado: ex-propietario solo ve ownerships/transfers/mileages/episodios con fecha **≤** el `endsAt` de su último ownership.
  - Vista en el listado: sección/tab "Vehículos anteriores" con los vehículos donde fue owner (y ya no lo es).
  - UI: acciones bloqueadas (no registrar servicio, no transferir, no grant access) en vehículos anteriores.
  - Security review antes de implementar.

## 5. Contrato Backend (aditivo — **validado por Tech Lead 2026-09-15**, luz verde)

### Request

- `GET /api/vehicles/:id/history` — **sin cambios** de signature (mismo guard `assertVehicleAccess`, D-046 + super_admin). Aprobada la **Opción A** (ampliar el endpoint existente; descartado endpoint paralelo).

### Response (ampliado)

```jsonc
{
  "transfers": [...],   // sin cambios
  "mileages": [...],    // sin cambios
  "ownerships": [...],  // sin cambios
  "careEpisodes": [     // NUEVO
    {
      "id": "...",
      "title": "Mantenimiento de frenos",   // string | null — ver D-071 fallback UI
      "serviceDate": "2025-05-28T00:00:00.000Z", // DateTime? | null
      "status": "delivered",                // open | delivered | cancelled
      "source": "owner",                    // owner | workshop
      "verification": "unverified",         // unverified | verified
      "mileageIn": 68500,                   // Int? | null
      "customerNotes": "...",               // string | null
      "checkedInAt": null,                  // DateTime? | null
      "createdAt": "...",
      "workshop": { "id": "...", "name": "Taller Integral" } | null,
      "workshopName": null                  // string | null (taller externo)
    }
  ]
}
```

### Query (handler existente `get-vehicle-history.handler.ts`) — **validado por TL**

- Agregar al `Promise.all` un `careEpisode.findMany`:
  - `where: { vehicleId }` — **sin filtro por status**: `open`, `delivered` y `cancelled` van todos (D-071/D-054; confirmado por TL §4.3).
  - **`select` explícito** (defensa en profundidad, patrón de Security Review #13 y `list-verifications.handler.ts`):
    ```
    id, title, serviceDate, status, source, verification, mileageIn,
    customerNotes, checkedInAt, createdAt, workshopName,
    workshop: { select: { id, name } }
    ```
  - **Excluidos deliberadamente:** `internalNotes` (PII taller, NUNCA en payload), `customerComplaint`, `closedAt`, `updatedAt`, `createdByUserId`, `createdByMemberId`, `verifiedByMemberId`, `verifiedAt`, `branchId`, `appointmentId`, `vehicleId`.
  - **Sin `orderBy` en Prisma** — el array se ordena en JS post-query por la clave D-070 (`serviceDate ?? checkedInAt ?? createdAt`) desc; **tiebreak `createdAt` desc** (determinismo y tests estables). El `orderBy` compuesto de Prisma quedó **rechazado por TL**: no equivale al coalesce cuando `serviceDate` es null pero `checkedInAt` está seteado.
- **Regla de PII (aditiva):** con `select` explícito, `internalNotes` y `customerComplaint` ni siquiera entran al objeto de retorno (no dependen de mapper). El control `shouldExposeEmails` existente se conserva tal cual para ownerships.

### DTO / sanitización

- **Sin mapper**: el `select` de Prisma elimina los campos sensibles en la frontera de la query. Los arrays existentes quedan byte-compatibles (validado: los specs del handler hacen property-checks, no `toEqual` del objeto completo).

## 6. User Journey

```
Actor: Propietario autenticado
  ↓
Contexto: Detalle del vehículo /vehicles/:id → hace scroll a "Historial"
  ↓
4a. GET /api/vehicles/:id → data base + últimos 5 km (sin cambios)
4b. GET /api/vehicles/:id/history → { transfers, mileages, ownerships, careEpisodes }
  ↓
Sistema: merge cronológico de las 4 fuentes → orden desc → renderiza
  ↓
Vista (con los datos del reporte AB029JW):
  [Historial — Card]
  ┌────────────────────────────────────────────────────┐
  │ 🔧 Service, cambio de aceite — 20/11/2025          │
  │    Registrado por el propietario · Pendiente de    │
  │    verificación                                    │
  │ 🔧 Mantenimiento de frenos — 28/05/2025            │
  │    Registrado por el propietario · Taller Integral │
  │ 🚗 Inicio de propiedad — 12/09/2026                │
  └────────────────────────────────────────────────────┘
  ↓
Resultado: el propietario reconstruye la historia del vehículo incluyendo servicios
```

### Flujo alternativo: episodio workshop (creado por taller en F-020)
```
  ↓
Entry: "Atención de taller" (o su title futuro) · actor "Taller {name}"
  ↓
Resultado: sin badge de verificación (origen confiable, D-064)
```

### Flujo alternativo: episodio cancelado
```
  ↓
Título con sufijo "(cancelada)" y estado visible al tocar/expandir
  ↓
Resultado: no se ocultan eventos (D-054 misma lógica que transfers)
```

### Flujo alternativo: vehículo sin episodios
```
  ↓
Se muestra el timeline previo sin entries de episodio; si no hay ningún
evento de ningún tipo → empty state actual "Sin eventos registrados"
```

### Flujo alternativo (nuevo, D-074): confirmación al registrar un servicio
```
Actor: Propietario — form "servicios/nueva" (ya de 2-2)
  ↓
Completa el formulario y presiona "Registrar"
  ↓
Sistema: muestra modal "No podrás editar ni cancelar este registro desde tu
cuenta. Solo el taller asignado podrá gestionarlo. ¿Confirmás el registro?"
  ↓
[Cancelar] → el form vuelve a editable; NO se envía nada.
[Confirmar] → se envía POST /api/care-episodes/owner como hoy.
  ↓
Resultado: transparencia sobre la inmutabilidad del registro antes de crearlo
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Backend — ampliar GET /vehicles/:id/history (aditivo)
- Agregar `careEpisodes` al response; el array existente de transfers/mileages/ownerships queda byte-compatible (tests existentes no rompen).
- Orden del array: timestamp canónico D-070 desc (`serviceDate ?? checkedInAt ?? createdAt`).
- Excluir `internalNotes` del payload (PII/información interna del taller no expuesta al propietario ni a shared).

### RF-2: Frontend — tipos y merge
- `VehicleHistoryResponse` gana `careEpisodes: VehicleCareEpisode[]` (nuevo interface ligero en `types/vehicle.ts` — **NO** reutilizar el modelo `CareEpisode` del crear; es más estrecho y el `title` es `string | null`).
- `TimelineEntryType` gana `"care"`; el merge usa el timestamp D-070 (`serviceDate ?? checkedInAt ?? createdAt`).
- Inserción de cares en `mergeHistory` **después** de ownerships (orden de inserción define empates; sort estable desc existente).
- Icono de episodio: 🔧 (distinto de 🔄/📊/🚗). `TIMELINE_TYPE_ICONS` es `Record<TimelineEntry["type"], string>` → el compilador fuerza el caso.
- **Actualizar el factory `makeHistory()` del test unitario** para devolver `careEpisodes: []` por defecto (si no, los 153 tests frontend rompen en compile).

### RF-3: Render del episodio en la Card Historial
- Título: `title ?? "Atención de taller" | "Servicio registrado"` según D-071 (fallback por source).
- Owner no verificado: título + actor "Registrado por el propietario" + leyenda "Pendiente de verificación".
- Owner **verificado** (`verification === "verified"`): idem + "Verificado por {taller}" — fuente del taller **`workshop?.name ?? workshopName`**; el badge **nunca** se gatilla por presencia de `workshop` (pre-verificación el taller ya está asignado, TL §3.3).
- Workshop: actor "Taller {workshop?.name ?? workshopName}", sin badge.
- `status=cancelled` → sufijo "(cancelada)".
- Notas: `customerNotes` si existe (mostrar como las notas de otros entries).
- **Copy de la Card Historial:** "Atenciones, transferencias, kilometraje y cambios de propiedad."

### RF-4: Regresión
- El resto del timeline (transfers/mileages/ownerships) y sus tests no cambian.
- El journey del taller (F-020: crear atención, lookup; 2-2: cola, verify) no se toca.
- El historial de maintenance (work orders/service records) sigue fuera (F-021+).

### RF-5: Modal de confirmación (D-074)
- El form `servicios/nueva` muestra un modal antes de enviar `POST /api/care-episodes/owner`.
- Texto exacto: **"No podrás editar ni cancelar este registro desde tu cuenta. Solo el taller asignado podrá gestionarlo. ¿Confirmás el registro?"**
- Botones: "Cancelar" (vuelve al form editable, no envía) y "Confirmar" (envía el POST).
- **No hay cambio backend** para esto; solo frontend.

## 8. Alcance (Dentro / Fuera)

### Dentro (iteración 2-3)
- Backend: ampliar `get-vehicle-history.handler.ts` (+tests del handler y del controller si corresponde).
- Frontend: tipos, merge (`vehicle-history.ts`), render en `HistorySection` (página detalle), icono, tests.
- Frontend: modal de confirmación en `servicios/nueva` (D-074) + tests.
- Sin migración de base de datos (los datos ya existen).

### Fuera (próximas iteraciones)
- Filtros por tipo / rango / estado de verificación (post-MVP, D-053).
- Paginación del timeline.
- Integración de service records / work orders / estimates (F-021/F-022).
- **Vehículos anteriores** (ex-propietarios, D-076 — iteración candidate 2-4): no se toca `assertVehicleAccess` ni el listado en 2-3.
- **Edición/cancelación por el taller** (D-075 — iteración candidate 2-5): no se agrega endpoint en 2-3.
- Agrupar visualmente "episodios" vs "eventos" (si el feedback lo pide).

## 9. Criterios de Aceptación

- [ ] Dado un vehículo con episodios `source=owner` (`unverified` y `verified`) y `source=workshop`, cuando el propietario abre el detalle, entonces la sección "Historial" los muestra entre los eventos cronológicos, ordenados por su timestamp canónico desc (D-070).
- [ ] Dado un episodio owner sin verificar, entonces muestra título, "Registrado por el propietario" y "Pendiente de verificación".
- [ ] Dado un episodio owner verificado, entonces muestra "Verificado por {nombre del taller}" (del `workshopId` o del `workshopName`).
- [ ] Dado un episodio de taller, entonces muestra actor "Taller {nombre}" sin badge de verificación.
- [ ] Dado un episodio `status=cancelled`, entonces el título muestra el sufijo "(cancelada)".
- [ ] Dado un episodio con `title` null y `source=workshop`, entonces el título muestra "Atención de taller".
- [ ] Dado un episodio con `title` null y `source=owner`, entonces el título muestra "Servicio registrado".
- [ ] Dado un episodio owner **sin** verificar pero con taller asignado, entonces NO muestra "Verificado por {taller}" (gate exclusivo `verification === "verified"`).
- [ ] Dado el detalle de un vehículo, entonces la copy de la Card Historial es "Atenciones, transferencias, kilometraje y cambios de propiedad.".
- [ ] Dado un vehículo sin ningún evento de ningún tipo, entonces se mantiene el empty state "Sin eventos registrados".
- [ ] Dado un usuario con acceso compartido, entonces ve los episodios sin emails y sin `internalNotes` (nunca presentes en el payload).
- [ ] Dado un propietario completando el form `servicios/nueva`, cuando presiona "Registrar", entonces aparece el modal con el texto exacto de D-074 y dos botones ("Cancelar" / "Confirmar").
- [ ] Dado el modal de confirmación abierto, cuando el propietario presiona "Cancelar", entonces el form permanece editable y NO se ejecuta ninguna llamada de red.
- [ ] Dado el modal de confirmación abierto, cuando el propietario presiona "Confirmar", entonces se envía `POST /api/care-episodes/owner` con los datos del form.
- [ ] Regresión: transfers/mileages/ownerships, ficha/fotos/documentos/km, listado y journeys de taller (F-020/2-2) siguen verdes.

### Build / Calidad
- [ ] `npm test` (backend) verde con las suites previas (35 suites / 306 tests) + nuevas.
- [ ] `npm test` (frontend) verde (16 files / 153 tests) + nuevas.
- [ ] `npm run build` (backend y frontend) sin errores.
- [ ] Sin dependencias nuevas. Sin migración.

## 10. Dependencias

- F-014 (D-050..D-055): merge, tipado y empty state existentes del timeline.
- F-020 / 2-2 (D-056..D-068): modelo `CareEpisode` persistido con `source`/`verification`/`title`/`serviceDate`/`workshopId`/`workshopName`.
- PII: patrón `shouldExposeEmails` existente (Security Review #13).

---

## DECISIONES DE PRODUCTO (confirmadas 2026-09-15)

1. **Editar/cancelar episodios = solo el taller asignado (D-075).** El propietario nunca edita ni cancela sus registros; la regla se comunica con el modal de confirmación (D-074). Implementación de la edición/cancelación → iteración candidate **2-5** (requiere auditoría, invalidez de verificación, permisos y Security review). **No se toca en 2-3.**
2. **Ex-propietarios: Opción B — corte por propiedad (D-076).** El ex-propietario puede volver a un vehículo anterior y ver su historia **solo hasta el fin de su ownership** (privacidad del nuevo dueño). Implementación → iteración candidate **2-4** (cambia `assertVehicleAccess`, listado y UI; Security review). **No se toca en 2-3.**
3. **Confirmado que el timeline de 2-3 muestra TODOS los episodios del vehículo que el caller puede ver (owner actual o shared)** — D-069 no filtra por ownership del caller; el filtrado por propiedad es exclusivo de la iteración 2-4 para ex-propietarios.

## 11. Validación técnica — veredicto del Tech Lead (2026-09-15)

**Resultado: LUZ VERDE** (condicional resuelto con las decisiones de la §4/§5).

| # | Decisión técnica | Veredicto |
|---|---|---|
| 1 | **Opción A:** ampliar `GET /vehicles/:id/history` (aditivo, mismo guard) | **Aprobada.** No rompe spec existente (property-checks, no `toEqual` completo). Un solo round-trip, un solo merge. |
| 2 | **Sort de careEpisodes** | **Aprobada con ajuste:** sort en **JS post-query** por `serviceDate ?? checkedInAt ?? createdAt` desc + tiebreak `createdAt` desc. **Rechazado** el `orderBy` compuesto de Prisma: no equivale al coalesce cuando `serviceDate` null y `checkedInAt` seteado. |
| 3 | **Select vs mapper para PII** | **Aprobada con ajuste:** `select` **explícito** en Prisma (defensa en profundidad; patrón Security Review #13 / `list-verifications`). Excluye `internalNotes`, `customerComplaint`, `closedAt`, `updatedAt`, IDs de auditoría, `branchId`, `appointmentId`, `vehicleId`. Sin mapper. |
| 4 | **Frontend merge** | **Aprobada con ajuste:** mismo patrón (4º loop tras ownerships + sort global estable). `TimelineEntryType` suma `"care"`; el compilador exige el icono (`TIMELINE_TYPE_ICONS` es `Record<TimelineEntry["type"], string>`). **Obligatorio:** factory `makeHistory()` con `careEpisodes: []`. |
| 5 | **Modal D-074** | **Confirmada:** frontend-only, sin implicación backend. `workshopId`/`workshopName` del history son para el timeline, no para el modal (el modal usa la data del form). |
| 6 | **Tests requeridos** | Backend: extender `prismaMock` con `careEpisode.findMany` + stub `[]` en los 4 tests existentes (si no, crashean en runtime); nuevos: sort D-070 con nulls mixtos + tiebreak; select sin keys sensibles; shape `workshop { id, name }`; episodio `cancelled` incluido. Frontend: factory + mapping D-071 (owner unverified/verified, workshop, cancelled), date D-070, merge global desc, tie estable. |

**Riesgos detectados por TL (adicionales):**
1. Si alguien implementa el `orderBy` compuesto creyendo que equivale a D-070 → timeline mal ordenado sin que tests "campos poblados" lo detecten. Mitigación: test de nulls mixtos no-negociable.
2. Cambio de mock y handler en el **mismo commit** (si van separados, los 4 tests existentes rompen).
3. Gate del badge "Verificado por {taller}" = `verification === "verified"` (TL §3.3).
4. `title` nullable → fallback UI (resuelto en D-071).

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Timestamp heterogéneo: `serviceDate` date-only (medianoche UTC) vs timestamptz del resto | Baja | Orden determinstica por D-070 + tiebreak `createdAt`; el format ya maneja date-only (`formatTimelineDate`). Empates exactos: orden estable del merge. |
| Sort en JS no equivalente a Prisma (riesgo TL §3.1) | Media | sort JS + test de nulls mixtos (`serviceDate` null con `checkedInAt` seteado) no-negociable. |
| `internalNotes` expuesta por error (PII taller) | Alta | `select` explícito que la excluye + test que lo verifica (patrón del test PII existente del history). |
| Badge "Verificado" falso en episodios owner pre-verificación (TL §3.3) | Media | Gate `verification === "verified"` + test; nunca por presencia de `workshop`. |
| El propietario confunde "Pendiente de verificación" con un error | Media | Leyenda clara en la UI + modal de confirmación D-074 (comunica que el taller gestiona el registro). |
| Volumen alto de episodios futuros | Baja | Sin paginación en MVP (D-053); revisar cuando crezca (TL: si escala, paginar el timeline completo, no un endpoint paralelo). |
| El modal agrega fricción al registro de servicios | Baja | Es una sola confirmación (no se repite); el texto comunica una imposibilidad real (no existe edición). Medible vía feedback si se vuelve molesto. |

---

*Fin de la especificación iteración 2-3 (aprobada para implementación).*