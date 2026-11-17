# Plan 05 — Corrección del corrimiento de un día en `serviceDate` (fecha calendario vs instante)

> **Fecha:** 2026-11-12
> **Versión:** **v2 — corregida según revisión de TLs** (v1 revisada en `05-tl-review-backend.md` y `05-tl-review-frontend.md`).
> **Estado:** **APROBADO CON CONDICIONES** — GO de ambos TLs, sujeto a las condiciones de `05-tech-lead-review.md`.
> **Repos afectados:** `api-follow-app` (backend) y `web-follow-app` (frontend)
> **Basado en:** análisis de código real de ambos repos (`archivo:línea` citados).

**Cambios de v1 → v2 (todos por corrección de los TLs):**

| # | Qué cambió |
|---|---|
| 1 | §0 ya no afirma que todas las filas están a medianoche UTC: el seed escribe 30 episodios a `09:00Z`. **G1 es la fuente de verdad.** |
| 2 | §3 marca `ServiceRecord` como fase 2 y declara **explícitamente** la excepción de `GET /vehicles/:id/history`. |
| 3 | `B-TZ-8` **eliminado** del plan (movido a §10). |
| 4 | `formatDateOnly` pasa a tener contrato de entrada, guard de `Invalid Date` y firma nullable. |
| 5 | `B-TZ-3` reconoce que el fixture `makeDto` rompe **todo** el archivo de spec, no solo el test de frontera. |
| 6 | `B-TZ-7` incluye `CareEpisodeListItem` y la **creación** de un spec que hoy no existe. |
| 7 | `B-TZ-2` suma spec de DTO con `ValidationPipe` real. |
| 8 | Frontend: `formatDateOnly` con tolerancia **estrecha** (solo `00:00:00Z`); `slice(0,10)` ciego eliminado. |
| 9 | Frontend: `dateKind` decide **zona**, no visibilidad de hora (`R1`). |
| 10 | `toDateInputValue` y F-TZ-10 descartados (sin consumidor / un solo call site). |
| 11 | §8 tests corregidos: ICU real `"11 de nov de 2026"`, aserciones por componentes, guarda de TZ. |
| 12 | §9: G1 con `AT TIME ZONE 'UTC'` y contra DB target; G3 con baseline (`603 passed / 4 failed`). |

---

## 0. Resumen ejecutivo

1. **El formulario no tiene el bug.** El `<input type="date">` produce `"2026-11-11"` y el front lo envía sin conversión (`servicios/nueva/page.tsx:281`, `lib/api.ts:1022`).
2. **El backend no "convierte mal":** `new Date("2026-11-11")` produce, por especificación ECMAScript, **medianoche UTC** (`2026-11-11T00:00:00.000Z`). Eso es lo que se ve en la DB: `2026-11-11 00:00:00+00`.
3. **El bug es de modelo + render:** una *fecha calendario* se persiste como `timestamptz` (`schema.prisma:1002`) y se renderiza con `new Date(iso).toLocaleDateString("es-AR")` (`lib/format-date.ts:9-18`), que aplica UTC-3 → `10/11/2026`.
4. **Corregir solo el backend NO arregla el síntoma** (el JSON seguiría siendo un instante). **Corregir solo el front sí lo arregla** para las fechas guardadas a medianoche UTC, y es la pieza imprescindible.
5. **Plan propuesto:** contrato `serviceDate` = `"YYYY-MM-DD"` (date-only) + frontend que formatea fechas calendario en UTC. **Sin migración de schema en fase 1.** Migrar la columna a `@db.Date` queda como deuda de fase 2.

### Hallazgo de datos (corregido en v2)

- **En runtime**, `CareEpisode.serviceDate` solo lo escribe el flujo owner (`create-owner-care-episode.handler.ts:171`). Los flujos de taller no lo setean (`check-in.handler.ts:377-398`, `create-care-episode.handler.ts:64-79`).
- **Pero `prisma/seed.ts:4692` sí lo escribe**: 30 episodios con `T09:00:00.000Z`, **incluidos episodios `source='workshop'`**. Eso contradice el invariante documentado en `docs/specs/owner-service-records-verification-flow.md:214`.
- **Consecuencia:** la premisa "100 % de las filas están a medianoche UTC" **es falsa en cualquier DB seedeada**. El gate **G1** (§9) es la fuente de verdad, no esta hipótesis. El TL frontend ya contempla el caso: si un valor no es `YYYY-MM-DD` ni medianoche UTC, el helper cae a `instant` y **nunca trunca**.

---

## 1. Síntoma y reproducción

| Paso | Resultado observado |
|---|---|
| Dueño registra servicio con fecha `11/11/2026` | — |
| Fila en `care_episodes.service_date` | `2026-11-11 00:00:00+00` |
| Detalle del servicio (`/vehicles/:id/servicios/:servicioId`) | `10/11/2026` |
| Timeline / historial / atenciones | `10/11/2026` |

Se reproduce en cualquier zona con offset negativo (UTC-3 Argentina). En UTC o en zonas positivas el corrimiento es invisible, lo que explica por qué no se detectó antes.

---

## 2. Causa raíz

### 2.1 Cadena completa

| # | Dónde | Qué pasa |
|---|---|---|
| 1 | `<input type="date">` (`servicios/nueva/page.tsx:459-467`) | entrega `"2026-11-11"` (día calendario local, sin hora) |
| 2 | `submitOwnerService` (`page.tsx:281`) | `serviceDate: data.serviceDate` — **sin conversión** |
| 3 | `lib/api.ts:929` (JSON) y `lib/api.ts:1022` (multipart) | se envía el string tal cual |
| 4 | `create-owner-care-episode.handler.ts:84` | `new Date("2026-11-11")` → `2026-11-11T00:00:00.000Z` |
| 5 | Prisma → `@db.Timestamptz(6)` (`schema.prisma:1002`) | `2026-11-11 00:00:00+00` |
| 6 | `get-care-episode.handler.ts:183` / `list-verifications.handler.ts:73` / `list-care-episodes.handler.ts:165` | se serializa como instante ISO (`JSON.stringify(Date)`) |
| 7 | `lib/format-date.ts:9-18` | `new Date(iso).toLocaleDateString("es-AR")` en UTC-3 → `10/11/2026` |

### 2.2 Amplificadores (no causas, pero hay que tratarlos)

- **`@IsDateString()` es ambiguo** (`create-owner-care-episode.dto.ts:35-36`): acepta `"2026-11-11"`, `"2026-11-11T00:00:00Z"` y `"2026-11-11T00:00:00"` (sin offset → se interpreta en TZ del **servidor**: dev UTC-3 vs prod UTC = comportamiento no determinista).
- **`canonicalDate` mezcla dos semánticas** (`list-care-episodes.handler.ts:189-196`): `serviceDate` (calendario) `??` `checkedInAt`/`createdAt` (instantes reales).
- **Heurística frágil, en un solo lugar**: `history-section.tsx:50-52` decide "¿tiene hora?" con `iso.slice(11,19) !== "00:00:00"`. **El timeline del dashboard no tiene heurística** (`vehicle-timeline-card.tsx:120` usa `formatDate`).
- **4 copias de `formatDate`**: `lib/format-date.ts:9-18`, `servicios/[servicioId]/page.tsx:64-73`, `atenciones/verificaciones/page.tsx:47-55`, `atenciones/page.tsx:44-52` (+ otras 8 en admin/perfil/transferencias/reclamos que **no** son de fecha calendario).
- **El test consagra el comportamiento actual**: `create-owner-care-episode.handler.spec.ts:159-174` ("accepts a serviceDate set to the end of the current UTC day").

### 2.3 Lo que NO es el problema

- **No** se está guardando mal el string: la DB tiene el día correcto a medianoche UTC.
- **No** hay conversión explícita de zona en ningún lado.
- **No** hay interceptor/serializador global (`main.ts:33-42` solo registra `AllExceptionsFilter` y `ValidationPipe`).
- **No** hay edición de `serviceDate` (no existe PATCH), así que **no hay off-by-one inverso al precargar** hoy.
- **No** hay eventos ni jobs que consuman `serviceDate` como instante: `CareEpisodeCreatedEvent` no lo incluye (`care-episode-created.event.ts:12-22`), y `dashboard`/`administration` no lo referencian.

---

## 3. Contrato objetivo (congelado)

Regla única: **una fecha calendario viaja como `YYYY-MM-DD`; un instante viaja como ISO-8601 con `Z`.** Nunca se mezclan.

| Campo | Semántica | Wire (request) | Wire (response) | Persistencia |
|---|---|---|---|---|
| `CareEpisode.serviceDate` | fecha calendario | `YYYY-MM-DD` | `YYYY-MM-DD` | `timestamptz` @ 00:00:00Z (fase 1) → `@db.Date` (fase 2) |
| `CareEpisode.checkedInAt` / `closedAt` / `createdAt` | instante | — | ISO `...Z` | `timestamptz` (sin cambios) |
| `CareEpisodeListItem.canonicalDate` | instante (orden, D-070) | — | ISO `...Z` (sin cambios) | — |
| `CareEpisodeListItem.canonicalDateOnly` | fecha calendario para mostrar | — | `YYYY-MM-DD \| null` (**nuevo, aditivo**) | derivado de `serviceDate` |
| `ServiceRecord.serviceDate` | fecha calendario | — | **fase 2** (fuera de este plan) | `@db.Date` (sin cambios) |

### Excepciones explícitas del contrato (fase 1)

1. **`GET /api/vehicles/:id/history` mantiene `serviceDate` como ISO.** El handler no mapea (`get-vehicle-history.handler.ts:78-108`) y el front deriva el día desde el `serviceDate` del entry. Se documenta porque el contrato general diría lo contrario. Deuda de fase 2.
2. **`POST /api/care-episodes` y `POST /api/care-episodes/check-in`** devuelven el episodio crudo, pero **nunca** setean `serviceDate` → no hay exposición.
3. **`maintenance` completo** (input, response y GET de historial) queda en fase 2 para mover el contrato entero de una vez, no a medias.

### Semántica de `canonicalDateOnly`

- Es `null` **si y solo si** `serviceDate` es `null`. **No** usar "episodio de taller" como sinónimo: el seed tiene episodios workshop **con** `serviceDate` (`prisma/seed.ts:4692`).
- Cuando es `null`, el front sigue mostrando `canonicalDate` como instante en hora local (comportamiento actual, sin regresión).

---

## 4. Decisiones (ratificadas por los TLs)

### D-TZ-1 — `serviceDate` es fecha calendario, no instante — **APROBADA**
**Decisión:** tratarlo como `YYYY-MM-DD` de punta a punta.
**Justificación:** es un dato declarado por el usuario ("cuándo hizo el servicio"), no un evento observado. No tiene hora real; inventar 00:00 UTC es la fuente del bug.
**Alternativa descartada:** guardar mediodía UTC (±12 h). Falla en UTC+13, es un parche.

### D-TZ-2 — Fase 1 sin migración; normalizar en el write path — **APROBADA CON CORRECCIÓN**
**Decisión:** mantener `timestamptz`, pero reemplazar `new Date(serviceDate)` por parseo explícito de `YYYY-MM-DD` → `Date.UTC(y, m-1, d)`.
**Justificación corregida:** cero riesgo de migración y cero downtime. **La invariante de medianoche UTC NO se asume**: se valida con G1. Si G1 devuelve filas anómalas, se auditan antes del merge.
**Riesgo:** el tipo de columna sigue admitiendo horas. Mitigado por DTO estricto (D-TZ-3) + test de invariante + G1.

### D-TZ-3 — DTO estricto: solo `YYYY-MM-DD` — **APROBADA CON CORRECCIÓN**
**Decisión:** en `CreateOwnerCareEpisodeDto`, reemplazar `@IsDateString()` por `@Matches(/^\d{4}-\d{2}-\d{2}$/)` + round-trip en el handler.
**Corrección exigida:** test de DTO con **`ValidationPipe` real** (patrón `register-vehicle.dto.spec.ts:13-27`) y **mensaje de error que nombre el formato**.
**Impacto de compatibilidad:** rompe clientes que manden ISO completo. El flujo web manda `YYYY-MM-DD` (`api.test.ts:1196,1213`). Si apareciera un cliente no inventariado, se resuelve con un release de compatibilidad explícito (aceptar ISO **solo con offset**), no abriendo el DTO desde el día 1.

### D-TZ-4 — Serialización explícita en handlers, no en interceptor global — **APROBADA CON CORRECCIÓN**
**Decisión:** helper compartido `formatDateOnly()` usado en cada respuesta que expone `serviceDate`.
**Justificación:** un interceptor global no distingue fecha calendario de instante.
**Corrección exigida:** `formatDateOnly(date: Date | null): string | null` con guard de `Invalid Date` (`toISOString()` lanza `RangeError` → 500).
**Ubicación:** `src/common/dates/date-only.ts` (no existe helper previo; `dashboard/utils/timezone.ts:47-58` es TZ-aware y module-scoped, no se fusiona).

### D-TZ-5 — Validación "no futura" se mantiene — **APROBADA**
**Decisión:** conservar la comparación contra fin de día UTC (`handler.ts:88-92`).
**Justificación:** determinista y ya testeada; "hoy local" requiere TZ del usuario, que no existe.
**Deuda conocida:** en UTC-3, entre 21:00 y 24:00 locales se acepta el día siguiente. Documentado; no se corrige.

### D-TZ-6 — Frontend: formato por semántica — **APROBADA CON CORRECCIÓN**
**Decisión:** `formatDateOnly()` que **valida** `/^\d{4}-\d{2}-\d{2}$/`, parsea explícito `new Date(\`${v}T00:00:00Z\`)` y formatea con `timeZone: "UTC"`. Devuelve `"—"` para `null`/`undefined`/`""`/no-ISO. `formatDate()`/`formatDateTime()` quedan **intactos** para instantes.
**Corrección exigida:** nada de `slice(0,10)` ciego — truncar un instante real (`2026-11-11T23:00:00-03:00` = 12/11 UTC) da el día equivocado.

### D-TZ-7 — Rollout independiente y tolerante (estrecho) — **APROBADA CON CORRECCIÓN**
**Decisión:** `formatDateOnly` acepta `YYYY-MM-DD` y `YYYY-MM-DDThh:mm:ss(.sss)?Z` **solo si `hh:mm:ss === "00:00:00"`**. Cualquier otro instante → `dateKind='instant'`, nunca se trunca. Fallback: `canonicalDateOnly != null ? formatDateOnly(canonicalDateOnly) : formatDate(canonicalDate)`.
**Aclaración exigida:** "sin ventana de fechas rotas" significa **sin roturas nuevas**. **Backend-first no corrige el síntoma** hasta que el front formatee date-only.

### D-TZ-8 — Nada de timezone por usuario — **APROBADA**
**Descartado:** `user.timezone`. `Workshop.timezone` existe (`schema.prisma:19`) pero no aplica al flujo owner (PERSONAL).

---

## 5. Alcance backend (`api-follow-app`)

> Estimación total: **S/M**. Sin migración. Sin cambios de permisos ni de rutas.

| ID | Archivo | Cambio | Tests |
|---|---|---|---|
| **B-TZ-1** | `src/common/dates/date-only.ts` *(nuevo)* | `parseDateOnly(v): Date` (regex + round-trip + año representable); `formatDateOnly(date: Date \| null): string \| null` con guard de `Invalid Date`; `isDateOnly(v)` | `date-only.spec.ts` (nuevo) |
| **B-TZ-2** | `create-owner-care-episode.dto.ts:35-36` | `@IsDateString()` → `@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceDate must be YYYY-MM-DD' })` | **`create-owner-care-episode.dto.spec.ts`** con `ValidationPipe` real |
| **B-TZ-3** | `create-owner-care-episode.handler.ts:84` | `new Date(...)` → `parseDateOnly(...)`; 400 si inválida | **Cambiar el fixture `makeDto` en `handler.spec.ts:42`** (`'2026-09-10T10:00:00.000Z'` → `'2026-09-10'`) y reescribir `:159-174`. **Afecta a casi todo el archivo**, no solo al test de frontera |
| **B-TZ-4** | `create-owner-care-episode.handler.ts:235-239` | `...careEpisode` sobreescribe `serviceDate: formatDateOnly(...)` | test nuevo de shape (hoy no existe assert de la respuesta de creación) |
| **B-TZ-5** | `get-care-episode.handler.ts:183` + `care-episode-detail-response.dto.ts:66` | `serviceDate: formatDateOnly(...)`; tipo `string \| null` | agregar caso `serviceDate: null` |
| **B-TZ-6** | `list-verifications.handler.ts:73` | `serviceDate: formatDateOnly(...)`; tipar el retorno con interfaz (`string \| null`) para evitar drift | actualizar la aserción existente `list-verifications.handler.spec.ts:78` (hoy espera `Date`) |
| **B-TZ-7** | `list-care-episodes.handler.ts:24-40` (interfaz) **y** `:157-186` (mapeo) | **aditivo**: `canonicalDateOnly: formatDateOnly(episode.serviceDate)` (null sii `serviceDate` es null). `canonicalDate` **no cambia**. | **crear `list-care-episodes.handler.spec.ts`** (no existe): orden D-070 + `canonicalDateOnly` null/no-null. Actualizar `docs/designs/care-episode-list-technical-design.md:135-138` y `docs/specs/care-episode-list-flow.md` |
| ~~B-TZ-8~~ | — | **ELIMINADO del plan** (ver §10) | — |

**`get-vehicle-history` NO se toca** (confirmado: `select` + solo orden en JS, sin mapping). Agregar un DTO ahí sería cirugía innecesaria sobre el UNION del historial; el front deriva el día desde el `serviceDate` del entry.

**Explícitamente fuera del alcance backend:**
- `checkedInAt`, `closedAt`, `createdAt`, `expiresAt`, `recordedAt`, `joinedAt` → **instantes**.
- Algoritmo D-070 (coalesce + orden) → **no se toca**.
- Schema Prisma y migraciones → **no se tocan** en fase 1.
- Seed → **no se toca** en este plan (ver §10.1).

---

## 6. Alcance frontend (`web-follow-app`)

> Estimación total: **M**. Sin cambios de UI/copy, solo semántica de formato.

| ID | Archivo | Cambio |
|---|---|---|
| **F-TZ-1** | `src/lib/format-date.ts` | agregar `formatDateOnly` (contrato de D-TZ-6/7) y un `toDateOnly()` interno que valide regex + medianoche. **No tocar** `formatDate`/`formatDateTime` |
| **F-TZ-2** | `src/lib/format-date.ts` + `vitest.config.ts` | test nuevo. **`vitest.config.ts` no soporta TZ por suite**: pin global `test.env.TZ` **+ guarda** `expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(...)`. Aserciones por componentes, no por string literal |
| **F-TZ-3** | `servicios/[servicioId]/page.tsx:64-73,254` | borrar `formatDate` local (1 solo uso); usar `formatDateOnly(detail.serviceDate)` |
| **F-TZ-4** | `atenciones/verificaciones/page.tsx:47-55,230` | borrar copia local; `formatDateOnly(item.serviceDate)` manejando `null` → `"—"` (el `formatDate` local hoy hace `new Date(null)` → `01 ene 1970`) |
| **F-TZ-5** | `atenciones/page.tsx:44-52,59-72,238` | `episodeDate()` debe devolver **string ya formateado** (`canonicalDateOnly ? formatDateOnly : formatDate(canonicalDate)`) y `:238` deja de envolver con `formatDate`. **Borrar el fallback muerto a `raw.serviceDate` (`:67`)** |
| **F-TZ-6** | `lib/vehicle-history.ts:21-47` (`TimelineEntry`) y `:187` | `dateOnly: string \| null`, `dateKind: 'date' \| 'instant'`. `date` **no cambia** (sigue siendo el ISO de orden D-070 y el `dateTime` del `<time>`). `dateKind='date'` sii `serviceDate != null` **y** `toDateOnly` valida |
| **F-TZ-7** | `history-section.tsx:46-67,90` | reemplazar la heurística `00:00:00` por `dateKind`. **`dateKind` decide zona, no visibilidad de hora**: `date` → `formatDateOnly`; `instant` → conservar `formatTimelineDate` con su detección de hora |
| **F-TZ-8** | `vehicle-timeline-card.tsx:120` | `date` → `formatDateOnly`; `instant` → `formatDate(entry.date)` (nunca mostró hora). No unificar con `history-section` |
| **F-TZ-9** | `traceability-summary-card.tsx:129-133` | **hoy es un coalesce**: `serviceDate ? formatDateOnly(serviceDate) : formatDate(checkedInAt ?? createdAt)`. `expiresAt` (`:173`) **no se toca** |
| **F-TZ-10** | — | **DESCARTADA** (era `todayISOLocal`): tiene un solo consumidor. Se deja local en `nueva/page.tsx` |
| **F-TZ-11** | tipos | `types/care-episode.ts:211` (`CareEpisodeVerificationItem.serviceDate`) → `string \| null`; `:360-364` → agregar `canonicalDateOnly?: string \| null`. **`:165` NO se toca** (es el request). `dateKind`/`dateOnly` van en `TimelineEntry`, **no** en `types/vehicle.ts` |

**Explícitamente fuera del alcance frontend:**
- Las 8 copias de `formatDate` de `admin/**`, `profile`, `transferencias`, `reclamos`, `claim-invite-panel`, `dealership-exhibition-section`: formatean **instantes**.
- `vehicle-hero-card.tsx:143-149`: muestra km + `recordedAt`, **no** `serviceDate`.
- `documents-section.tsx` / `document-preview-dialog.tsx`: `expiresAt` es otra familia de bug (§10.2).
- Copy, layout, validaciones de UI existentes.

---

## 7. Reparto en paralelo (sin solapamiento de archivos)

Dos workstreams independientes. Archivos disjuntos entre repos; el único acoplamiento es el contrato de §3, **congelado** por el documento consolidado.

| Workstream | Agente | Archivos propios | Depende de |
|---|---|---|---|
| **B** | `backend-tech-lead-hcdv` | `src/common/dates/**`, `src/modules/care-episodes/**` | contrato §3 |
| **F** | `frontend-tech-lead` | `src/lib/format-date.ts`, `src/lib/vehicle-history.ts`, `src/types/**`, 3 páginas + 3 componentes | contrato §3 |

**Serialización interna (para evitar dos agentes en el mismo archivo):**
- **Backend:** B-TZ-1 → B-TZ-2/3 → B-TZ-4/5/6/7.
- **Frontend:** F-TZ-1/2 → F-TZ-6/11 → F-TZ-3/4/5/7/8/9. Un solo dueño de `format-date.ts` y de `types/`.

**Independencia de despliegue:** el front puede mergear antes que el back (degrada a `formatDate` en el listado de atenciones); el back puede mergear antes que el front (el front trunca solo medianoches UTC válidas). El bug se cierra cuando **ambos** están en producción.

---

## 8. Tests

### Backend
1. `date-only.spec.ts`: `parseDateOnly('2026-11-11')` → `2026-11-11T00:00:00.000Z`; rechaza `'2026-02-30'`, `'2026-11-11T00:00:00Z'`, `'11/11/2026'`; `formatDateOnly(null)` → `null`; `formatDateOnly(new Date(NaN))` → `null` (sin `RangeError`).
2. `create-owner-care-episode.dto.spec.ts` (nuevo): con `ValidationPipe` real, acepta `2026-11-11`; rechaza `2026-11-11T00:00:00Z`, `2026-11-11T00:00:00`, `11/11/2026`.
3. `create-owner-care-episode.handler.spec.ts`: **cambiar el fixture `makeDto` en `:42`**; reescribir el test de frontera `:159-174` a comparación por día calendario; agregar "`2026-11-11` persiste `00:00:00.000Z`", "date-time → 400" y assert de shape en la respuesta de creación.
4. `get-care-episode` / `list-verifications`: assert `^\d{4}-\d{2}-\d{2}$`; caso `null`; **y que `checkedInAt`/`createdAt` sigan siendo ISO con `T`/`Z` en el mismo payload**.
5. **Crear `list-care-episodes.handler.spec.ts`**: orden D-070 intacto + `canonicalDateOnly` null/no-null.
6. **Regresión:** `get-vehicle-history.handler.spec.ts:173-216` debe pasar **sin editar** (orden y `select` protegidos).

### Frontend
1. `format-date.test.ts` con TZ fijada **y guarda de entorno**: `formatDateOnly('2026-11-11')` y `formatDateOnly('2026-11-11T00:00:00.000Z')` → mismo día. Aseverar `/11/`, `/nov/i` y **no** `/10/`. El ICU del repo rinde **`"11 de nov de 2026"`**, no `"11 nov 2026"` (`admin-status.test.ts:174-182`).
2. `formatDateOnly('2026-11-11T15:30:00.000Z')` → `"—"` (no trunca), y el entry correspondiente cae a `dateKind: 'instant'`.
3. `formatDate('2026-11-11T22:00:00.000Z')` → día **10** solo con TZ pinneada y guarda de entorno activa (en UTC da 11: es el falso verde que hay que bloquear).
4. `history-section`: transfer a `…T00:00:00Z` **sigue mostrando solo fecha** (sin `00:00`) — regresión `R1`.
5. `traceability-summary-card` y `vehicle-timeline-card`: episodio con `serviceDate` → día 11; episodio sin `serviceDate` → `checkedInAt`/`createdAt` en hora local.
6. `owner-service-form.test.tsx:191-198` sigue mandando `"2026-11-11"`.
7. `vehicle-history.test.ts` debe pasar **sin editar** las aserciones de `date` (`:341-383`).

---

## 9. Orden, gates y verificación

| Gate | Qué se valida | Bloquea |
|---|---|---|
| **G0** | Veredicto de ambos TLs + contrato §3 congelado (`05-tech-lead-review.md`) | todo |
| **G1 — preflight DB** | ```SELECT count(*) FROM care_episodes WHERE service_date IS NOT NULL AND (service_date AT TIME ZONE 'UTC')::time <> '00:00:00';``` **Contra la DB target de producción.** `service_date::time` a secas usa el TimeZone de sesión (falsos positivos). Debe ser **0**; en DB seedeada se esperan **30 filas conocidas** (`prisma/seed.ts:4215-4582`) que deben auditarse, no ignorarse | B y F |
| **G2** | Backend: `npm test` **en UTC-3 además de UTC** + `npm run build` | merge B |
| **G3** | Frontend: `npm test` **sin fallos nuevos** respecto de la baseline **`603 passed / 4 failed`** (`vehicle-register-form.test.tsx` ×1, `vehicle-edit-form.test.tsx` ×3, cascade de catálogo, ajenos a fechas) + `npm run build` | merge F |
| **G4** | **E2E manual** en `America/Argentina/Buenos_Aires`: crear episodio **nuevo** por API (no reutilizar seed) con `11/11/2026` → DB `2026-11-11 00:00:00+00` → detalle, verificaciones, atenciones, historial y timeline muestran **11**. Segundo caso: check-in de taller a las 22:00 local → sigue mostrando el día local correcto. Tercer pase corto con el SO en UTC para probar independencia de TZ del cliente | cierre |

Rollback: ambos cambios son reversibles por revert; no hay migración ni backfill.

---

## 10. Deuda posterior (NO entra en este plan)

1. **Normalizar el seed**: `prisma/seed.ts:4692` escribe 30 episodios a `09:00Z` y le pone `serviceDate` a episodios `workshop`, contradiciendo `docs/specs/owner-service-records-verification-flow.md:214`. Mientras exista, G1 nunca da 0 en una DB seedeada.
2. **Migrar `CareEpisode.serviceDate` a `@db.Date`** con `USING (service_date AT TIME ZONE 'UTC')::date`. Los valores de fase 1 (medianoche UTC) permiten el cast sin pérdida. Nunca usar `::date` a secas (depende del TimeZone de sesión).
3. **`maintenance` completo** (era `B-TZ-8`): input `@IsDateString` (`create-service-record.dto.ts:33-34`) + `new Date(...)` (`create-service-record.handler.ts:19`) + response (`service-record-response.dto.ts:11,25`) + GET de historial (`maintenance.controller.ts:406` → `get-vehicle-service-history.handler.ts:44`). Cambiar los cuatro juntos; cambiar solo la respuesta deja tres contratos incoherentes.
4. **`expiresAt`** (documentos, invites de reclamo, membresías, etc. — `schema.prisma:122,136,150,161,176,323,447,520,693,823,850,878,906,1485`): varias son semánticamente fechas calendario y todas son `DateTime`. Misma familia de bug.
5. **Unificar las ~12 copias de `formatDate`** en `lib/format-date.ts`.
6. **`D-070`**: revisar si el orden por instante para episodios owner (medianoche UTC) produce ordenamientos contraintuitivos frente a episodios de taller del mismo día.

---

## 11. Definición de terminado

- [ ] Contrato de §3 congelado y aplicado en ambos repos, incluidas sus 3 excepciones explícitas.
- [ ] `serviceDate` viaja como `YYYY-MM-DD` en request y response de todos los endpoints listados.
- [ ] `formatDateOnly` (back y front) es el único camino de render/parse para fechas calendario.
- [ ] `canonicalDate`, `checkedInAt`, `createdAt`, `expiresAt` mantienen su semántica de instante y sus renders actuales (sin `00:00` nuevos).
- [ ] G1 corrido contra la DB target, con las filas anómalas auditadas y documentadas.
- [ ] Suites backend y frontend sin fallos nuevos respecto de la baseline; tests nuevos de TZ con guarda de entorno.
- [ ] `docs/designs/care-episode-list-technical-design.md` y `docs/specs/care-episode-list-flow.md` actualizados con `canonicalDateOnly`.
- [ ] G4 verificado en UTC-3 y en UTC.
- [ ] Sin migraciones ni cambios de permisos en este release.
- [ ] Asentar `D-TZ-1..8` en `DECISION-REGISTER.md` como `D-194..D-201` (último registrado: D-193).
