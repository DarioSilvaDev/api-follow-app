# 05 — Revisión técnica del Tech Lead (frontend)
**Fecha:** 2026-11-12
**Estado:** **GO CON CONDICIONES**
**Alcance revisado:** §3 (contrato), §4 (D-TZ-6/7/8), §6 (F-TZ-1..11), §8/§9 en lo que refiere a frontend.
**Fuera de alcance (revisa el TL backend):** §5 completo, B-TZ-1..8, decisiones D-TZ-1..5.
**Método:** lectura completa del plan + verificación en `web-follow-app` con `archivo:línea`, ejecución real de la suite (`npm test` → 603 passed / 4 failed preexistentes) y prueba empírica de comportamiento de `TZ` en vitest sobre Node 24.14.1 / Windows.

---

## 1. Veredicto global

El diagnóstico es correcto y el enfoque (formatear por semántica en UTC + `dateKind` explícito) es el adecuado. **El plan no puede arrancar hoy tal cual**: tiene 3 defectos que producirían código correcto-pero-frágil o tests que pasan en falso, y 1 supuesto de gate (G3) que hoy es inalcanzable porque la suite **no está verde de base**.

- **No es un NO-GO de arquitectura.** No hay violación de dominio, no hay overengineering, no se toca `formatDate`/`formatDateTime` y no se agregan dependencias.
- **Es un GO con condiciones** porque: (a) `formatDateOnly` tal como está especificado (`slice(0,10)` + ISO completo) no tiene contrato de entrada y puede truncar un instante real; (b) F-TZ-7/8 eliminan la heurística sin preservar el comportamiento de los **instantes** (riesgo de que todo `createdAt` de medianoche empiece a mostrar `00:00`); (c) las expectativas de test de §8 son literalmente incorrectas en el ICU que usa el repo; (d) F-TZ-2 asume un `TZ` por suite que `vitest.config.ts` no soporta.

Sin las correcciones de §5 (tabla de correcciones) y de §8 (condiciones), el implementador va a escribir un helper que compila, pasa los tests que vos escribiste, y deja un agujero silencioso.

---

## 2. Validación de supuestos contra el código

| # | Supuesto del plan | Resultado | Evidencia |
|---|---|---|---|
| S1 | §6 lista **todas** las superficies que renderizan `serviceDate` | **CIERTO** (6 superficies, ninguna falta). Ver §6 de este documento para el inventario completo | grep `serviceDate` en `src/` (55 matches; 12 en producción) |
| S2 | El listado de `serviceDate` en producción se reduce a §6 | **CIERTO**, salvo dos detalles de tipado: `types/care-episode.ts:211` (`CareEpisodeVerificationItem`) debe pasar a `string \| null` y `types/care-episode.ts:165` **no** se toca (es el request) | `care-episode.ts:161-170`, `:208-225` |
| S3 | `traceability-summary-card.tsx` consume `serviceDate` vía `VehicleHistoryResponse` | **PARCIALMENTE CIERTO**: no consume el response; recibe `careEpisodes?: VehicleCareEpisode[]` (`:34`), que el dashboard deriva de `historyQuery.data.careEpisodes` (`dashboard/page.tsx:251-255`). Mismo origen, distinta firma | `traceability-summary-card.tsx:21,34`; `dashboard/page.tsx:235-239,251-255` |
| S4 | `vehicle-timeline-card.tsx` consume `serviceDate` vía `VehicleHistoryResponse` | **CIERTO** (`:53`, `:63-68`) | `vehicle-timeline-card.tsx:37-40,49-59` |
| S5 | `VehicleHistoryResponse` / `VehicleCareEpisode` se pueden extender sin romper consumidores | **CIERTO**: consumidores son `api.ts:82,732` (solo parseo), `vehicle-history.ts:16,95`, `history-section.tsx:36,71`, `vehicle-timeline-card.tsx:39,53`, `traceability-summary-card.tsx:21,34`, `vehicle-hero-card.tsx:32,49,90` (solo deriva estado) y tests con `Partial<>` | grep `VehicleHistoryResponse\|VehicleCareEpisode` (47 matches) |
| S6 | `dateKind`/`dateOnly` deben ir en el **entry** del historial | **CIERTO**, y el lugar es `TimelineEntry` en `lib/vehicle-history.ts:21-47` (no `types/vehicle.ts`) | `vehicle-history.ts:185-194` |
| S7 | `history-section.tsx` y `vehicle-timeline-card.tsx` comparten shape de entry | **CIERTO**: ambos consumen `TimelineEntry` producido por `mergeHistory` | `history-section.tsx:31-35,79,115`; `vehicle-timeline-card.tsx:32-36,169-171` |
| S8 | La heurística `00:00:00` existe en 2 lugares (history-section y "equivalentes") | **FALSO**: existe en **un solo** lugar de producción: `history-section.tsx:50-52`. El timeline **no** tiene heurística: siempre `formatDate` (fecha local, sin hora) | `history-section.tsx:45-67`; `vehicle-timeline-card.tsx:120` |
| S9 | `slice(0,10)` es seguro para todos los valores actuales | **FALSO sin guardas**: `null`/`undefined`/`""` y strings no-ISO requieren manejo explícito; truncar un instante real (p. ej. `2026-11-11T23:00:00-03:00` = 12/11 UTC) da el día equivocado. Solo es seguro bajo el invariante G1 + entradas `YYYY-MM-DD` o `00:00:00Z` | `format-date.ts:9-18` (patrón actual de guardas); §9 G1 del plan |
| S10 | Hay tests existentes que se rompen por el cambio de formato esperado | **NO** hay ninguno que asevere el texto renderizado de una fecha de estas superficies. Sí hay fixtures con ISO medianoche (`vehicle-timeline-card.test.tsx:41,221`; `verifications-page.test.tsx:74`; `vehicle-history-section.test.tsx:167-226`; `care-episode-detail-page.test.tsx:156`) y aserciones sobre `entry.date` que **deben** seguir pasando | ver §7 |
| S11 | `vehicle-history.test.ts` se rompe por agregar campos al entry | **FALSO**: usa `toMatchObject` (`:253`) y `expect(entries[0].date)` (`:354,368,382`). Agregar campos es seguro | `vehicle-history.test.ts:253-261,341-383` |
| S12 | `vitest.config.ts` permite fijar `TZ` por suite | **FALSO como está escrito**: la config solo expone `test.env` (global) y `environmentOptions.jsdom`. No existe TZ por archivo | `vitest.config.ts:4-14`; `src/__test__/setup.ts:1-13` |
| S13 | Un dev en UTC podría ver el test pasar en falso | **CIERTO y grave.** `formatDate("2026-11-11T22:00:00Z")` en UTC devuelve `11 de nov`, en UTC-3 `10 de nov`. Sin guarda, el test "pasa" distinto según la máquina | empírico: ver S14 |
| S14 | `process.env.TZ` en runtime funciona en Windows | **CIERTO en este entorno (Node 24.14.1 / Windows)**, incluso dentro de un worker de vitest: probé `TZ=UTC` al arrancar y `process.env.TZ='America/Argentina/Buenos_Aires'` en el test → `Intl` pasó de `UTC` a `America/Buenos_Aires` y el render de `00:00:00Z` pasó de `11/11/2026` a `10/11/2026`. **No es portable a Node viejos**: no confiar sin guarda | prueba ejecutada y borrada (`tz-probe.test.ts`); `node -v` = v24.14.1 |
| S15 | El formato esperado es `"11 nov 2026"` | **FALSO en el ICU del repo**: Node/happy-dom producen `"11 de nov de 2026"`. El repo ya lo sabe y lo documenta | `admin-status.test.ts:174-182` (`"22 de sept de 2026"`); verificado con `node -e` |
| S16 | La suite frontend está verde | **FALSO**: 4 fallos preexistentes, ajenos a fechas: `vehicle-register-form.test.tsx` (cascade `versionId`, D-038) y `vehicle-edit-form.test.tsx` ×3 (label `Versión`) | `npm test` → `Tests 4 failed | 603 passed (607)`; `Test Files 2 failed | 51 passed (53)` |
| S17 | `formatDate`/`formatDateTime` no necesitan cambios | **CIERTO** y es la decisión correcta | `format-date.ts:9-32` |
| S18 | No hay edición de `serviceDate` (no hay PATCH) | **CIERTO**: no existe flujo de edición ni precarga | grep `serviceDate` en `src/app` → solo `servicios/nueva` |
| S19 | Las superficies afectadas son client components (sin riesgo de hidratación) | **CIERTO**: las 7 piezas afectadas declaran `"use client"` en línea 1 | `history-section.tsx:1`, `vehicle-timeline-card.tsx:1`, `traceability-summary-card.tsx:1`, `vehicle-hero-card.tsx:1`, `servicios/[servicioId]/page.tsx:1`, `atenciones/page.tsx:1`, `verificaciones/page.tsx:1` |
| S20 | `formatDateOnly` no se usa hoy en ningún lado (helper nuevo) | **CIERTO**: no existe `format-date.test.ts` ni test de formato de fecha compartido | `glob *format-date*` → solo `src/lib/format-date.ts` |

---

## 3. Ratificación de decisiones

| ID | Estado | Motivo |
|---|---|---|
| **D-TZ-6** | **APROBADA CON CORRECCIÓN** | Correcta en el fondo (formatear por semántica, no por heurística). Falta **contrato de entrada**: `formatDateOnly(value?: string \| null)` debe devolver `"—"` para `null/undefined/""/no-ISO`, validar `/^\d{4}-\d{2}-\d{2}$/` y parsear explícito (`new Date(\`${d}T00:00:00Z\`)`), no confiar en el parseo implícito de `new Date("YYYY-MM-DD")` ni en `slice` ciego. `formatDate`/`formatDateTime` intactos ✓ |
| **D-TZ-7** | **APROBADA CON CORRECCIÓN** | La tolerancia de rollout es correcta, pero debe ser **estrecha**: aceptar `YYYY-MM-DD` y `YYYY-MM-DDThh:mm:ss(.sss)?Z` **solo si** `hh:mm:ss === "00:00:00"`; cualquier otro instante → tratar como instante (`dateKind='instant'`), nunca truncar. Tal como está redactado ("toma `slice(0,10)`") un instante real se corrompe en silencio. El fallback correcto es `canonicalDateOnly != null ? formatDateOnly(canonicalDateOnly) : formatDate(canonicalDate)` |
| **D-TZ-8** | **APROBADA** | Sin timezone por usuario. `timeZone: "UTC"` para fechas calendario y hora local para instantes es exactamente el modelo correcto para el MVP. No introducir dependencias de fecha |
| **F-TZ-1** | **APROBADA CON CORRECCIÓN** | Los helpers son correctos, pero: (a) `toDateInputValue()` **no tiene ningún consumidor** (no hay PATCH de `serviceDate`, ver S18) → no crearlo (abstracción prematura, §7.4); (b) `todayDateOnly()` tiene 1 solo call site (ver F-TZ-10) → ver ahí; (c) `formatDateOnly` debe documentar que asume `date-only`/medianoche UTC (invariante G1), no un ISO cualquiera |
| **F-TZ-2** | **RECHAZADA (tal como está)** | `vitest.config.ts` no permite `TZ` por suite: solo `test.env` global. Además la expectativa `"11 nov 2026"` es incorrecta en Node/happy-dom (`"11 de nov de 2026"`). Reescribir: pin global de TZ en config **+** guarda de entorno en el archivo TZ-dependiente **+** aserciones por componentes (día/mes), no por string literal. Detalle en §4 y §8 |
| **F-TZ-3** | **APROBADA** | El `formatDate` local de `servicios/[servicioId]/page.tsx:64-73` tiene **un solo** uso (`:254`) → borrarlo y usar `formatDateOnly(detail.serviceDate)` es seguro. Mantener el `"—"` para `null` |
| **F-TZ-4** | **APROBADA CON CORRECCIÓN** | Correcto, pero **falta el cambio de tipo**: `CareEpisodeVerificationItem.serviceDate` es `string` (`types/care-episode.ts:211`) y el plan backend lo expone `string \| null`. El `formatDate(value: string)` local (`verificaciones/page.tsx:47-55`) no maneja `null` (`new Date(null)` → `01 ene 1970`). F-TZ-11 debe incluirlo y F-TZ-4 debe borrar la copia local |
| **F-TZ-5** | **APROBADA CON CORRECCIÓN** | La idea es correcta, la redacción induce a error: hoy `episodeDate()` devuelve un **ISO** y el call site lo formatea (`:238 formatDate(episodeDate(item))`). Después del cambio debe devolver un **string ya formateado** y `:238` debe ser `{episodeDate(item)}` (sin `formatDate`), o mejor: dos helpers (`episodeDateOnly` + `episodeInstant`). Además agregar `canonicalDateOnly?: string \| null` a `CareEpisodeListItem` (`types/care-episode.ts:353-372`) |
| **F-TZ-6** | **APROBADA CON CORRECCIÓN** | `dateKind: 'date' \| 'instant'` es la decisión correcta. Condiciones: `date` **no cambia** (sigue siendo el ISO de orden D-070 y el `dateTime` de `<time>`); `dateOnly: string \| null`; `dateKind='date'` **sii** `serviceDate != null` **y** `toDateOnly(serviceDate)` valida; en cualquier otro caso `dateKind='instant'` y `dateOnly=null` (defensivo, nunca inventar un día) |
| **F-TZ-7** | **APROBADA CON CORRECCIÓN** | Reemplazar la heurística por `dateKind` es correcto, pero **`dateKind` debe decidir solo la zona horaria, no si se muestra la hora**. Si se elimina la heurística sin más, todo instante de medianoche (`createdAt` de un fixture, `startsAt`, transferencias) empieza a mostrar `00:00` → regresión visual en el historial. Regla: `date` → `formatDateOnly(dateOnly)` en UTC; `instant` → **misma función actual** (`formatTimelineDate` con su detección de hora). Ref. de línea corregida: la función arranca en `:46`, no en `:44` |
| **F-TZ-8** | **APROBADA CON CORRECCIÓN** | El timeline hoy **nunca** muestra hora (`formatDate`, `:120`). Cambiar a "render por `dateKind`" no debe introducir hora para instantes: `date` → `formatDateOnly(dateOnly)`; `instant` → `formatDate(entry.date)` (comportamiento actual). No unificar con el historial: son dos lenguajes visuales distintos y el plan dice "sin cambios de UI" |
| **F-TZ-9** | **APROBADA CON CORRECCIÓN** | `:129-133` **no es un solo `formatDate`**: es `formatDate(serviceDate ?? checkedInAt ?? createdAt)`. Reemplazo correcto: `latestCare.serviceDate ? formatDateOnly(latestCare.serviceDate) : formatDate(latestCare.checkedInAt ?? latestCare.createdAt)`. Si se aplica `formatDateOnly` a todo, los episodios de taller (sin `serviceDate`) mostrarían medianoche UTC → día anterior. `expiresAt` (`:173`) **no** se toca ✓ |
| **F-TZ-10** | **RECHAZADA (innecesaria)** | `todayISOLocal()` tiene **un** consumidor (`nueva/page.tsx:63` y `:461`). Moverla a `lib/format-date.ts` agrega superficie y mete una función dependiente del reloj en un módulo de formatters puros, sin beneficio. Dejar local (o, si se insiste, `lib/date-only.ts`, espejo del backend). No es bloqueante: si el TL backend prefiere espejo de nombres, se acepta como opcional |
| **F-TZ-11** | **APROBADA CON CORRECCIÓN** | El mapeo de líneas es impreciso y una entrada es errónea: `care-episode.ts:165` es `CreateOwnerCareEpisodeInput.serviceDate` (**request**, debe seguir `string`); `:195` (`CareEpisode`) y `:317` (`CareEpisodeDetail`) ya son `string \| null`; falta `:211` (verification item → `string \| null`); falta `canonicalDateOnly` en `:360-364`; y `dateKind`/`dateOnly` van en `TimelineEntry` (`lib/vehicle-history.ts:21-47`), **no** en `types/vehicle.ts` (donde `:341` ya es `string \| null`) |

---

## 4. Respuestas a las preguntas abiertas (§11)

### P3 — ¿`dateKind` explícito o mantener la heurística `00:00:00`? → **`dateKind` explícito. Aprobado.**

1. **La heurística no modela el dominio, lo adivina.** `history-section.tsx:50-52` infiere "¿es fecha calendario?" mirando si la hora es medianoche. Eso se rompe con un instante legítimo a las 00:00:00 (check-in nocturno real, import, job) y con cualquier ISO con offset no-UTC (`+00:00` ok, `-03:00` no).
2. **La semántica ya la conoce el productor.** `serviceDate` es calendario por contrato (§3); `checkedInAt`/`createdAt`/`startsAt`/`recordedAt` son instantes. Pasar esa información por el merge (`mergeHistory`) es gratis: es una unión discriminada en memoria, no un contrato nuevo.
3. **Costo cero de contrato**: `TimelineEntry` solo lo construye `mergeHistory` (`vehicle-history.ts:96`); ningún test ni consumidor instancia el tipo (S6/S11). Es un cambio puramente local.
4. **La heurística sobrevive donde sí corresponde**: dentro de los instantes, para decidir si mostrar hora (`00:00` exacto → sin hora) se puede conservar el mismo criterio, porque ahí sí es una decisión de presentación, no de semántica. Esa distinción es la que hoy falta en el plan y es la corrección de F-TZ-7.

**Regla vinculante:** `dateKind` decide **zona horaria** (`date` → UTC vía `formatDateOnly`; `instant` → local). La decisión de mostrar hora sigue siendo local a cada superficie.

### P5 (parcial) — G4 / E2E manual
Para el front, G4 exige una máquina en **UTC-3** y un fixture con `serviceDate` medianoche UTC. Recomiendo además un segundo pase corto con `TZ=UTC` en el navegador (devtools → sensors/emulación no aplica; usar SO o contenedor) para confirmar que el render no depende de la TZ del cliente: `formatDateOnly` en UTC debe dar el **mismo** día en UTC-3 y en UTC+9. Si eso falla, el helper está mal.

### P1/P2/P4
Fuera de mi alcance (backend). Solo impacto frontend: P2 (`canonicalDateOnly` aditivo) es **preferible** y es lo que asume F-TZ-5/F-TZ-11; si el backend expone `serviceDate` en el listado en lugar de `canonicalDateOnly`, el front necesita el mismo helper y una rama más. P1 (DTO estricto) no rompe al cliente web: `api.test.ts:1196,1213` ya envía `YYYY-MM-DD` y `owner-service-form.test.tsx:191-198` lo confirma.

---

## 5. Correcciones al plan

| Ubicación | Dice | Debe decir |
|---|---|---|
| §8 Frontend test 1 (`:200`) | `formatDateOnly(...)` → `"11 nov 2026"` | El ICU del repo renderiza `"11 de nov de 2026"` (`admin-status.test.ts:174-182`). Aseverar por partes: `/\b11\b/`, `/\bnov\b/i`, y **no** `/\b10\b/`. Nunca string literal de `Intl` |
| §8 Frontend test 2 (`:201`) | `formatDate('2026-11-11T22:00:00.000Z')` → `"10 nov 2026"` | Es TZ-dependiente: en UTC da `11 de nov`. Requiere pin de TZ **+** guarda `expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Argentina/Buenos_Aires")` para que un dev en UTC vea un fallo explícito ("entorno no fijado") en vez de un falso verde |
| §6 F-TZ-2 (`:156`) | "`src/lib/format-date.ts` + `vitest.config.ts` — test nuevo con `TZ=...`" | `vitest.config.ts` no soporta TZ por suite. Opciones válidas: (a) `test.env.TZ` global en config (una línea, determinista para toda la suite) o (b) `process.env.TZ = "..."` al tope del archivo de test, antes de cualquier formateo (verificado OK en Node 24.14.1/Windows). En ambos casos, guarda de entorno + no asumir que funciona en Node < 16 |
| §6 F-TZ-7 (`:161`) | `history-section.tsx:44-67,90` | `:46-67,90` (la función arranca en 46; 90 es el call site) |
| §6 F-TZ-9 (`:163`) | `traceability-summary-card.tsx:127-136,173` | `:129-133,173`; y la corrección semántica: `serviceDate ? formatDateOnly : formatDate(instante)` |
| §6 F-TZ-5 (`:159`) | `atenciones/page.tsx:44-52,61-70,238` | `:44-52,59-72,238`; y aclarar que `:238` deja de envolver con `formatDate` (el helper devuelve string formateado) |
| §6 F-TZ-6 (`:160`) | `dateOnly = care.serviceDate?.slice(0,10) ?? null` | `dateOnly = toDateOnly(care.serviceDate)` (valida regex/medianoche); si no valida → `null` y `dateKind='instant'`. `date` intacto (orden D-070 + `dateTime`) |
| §6 F-TZ-11 (`:165`) | `care-episode.ts:165,195,211,317,360-364` y `vehicle.ts:340-341` por igual | `:165` **no se toca** (request `string`); `:211` → `string \| null`; `:360-364` → agregar `canonicalDateOnly?: string \| null`; `dateKind`/`dateOnly` van en `lib/vehicle-history.ts:21-47` |
| §2.2 (`:54`) | "heurística frágil en `history-section.tsx:44-55` **y equivalentes**" | Solo existe en `history-section.tsx:50-52`. El timeline no tiene heurística (`vehicle-timeline-card.tsx:120` usa `formatDate`) |
| §8 Frontend test 3 (`:202`) | "render `11/11`" en detalle, verificaciones, atenciones, timeline y hero | Formatos distintos: detalle/verificaciones/atenciones → `dd mmm yyyy`; historial/timeline → `dd/mm/yyyy`; **hero no renderiza `serviceDate`** (`vehicle-hero-card.tsx:143-149` solo km + `recordedAt`). Aseverar el **día 11** en cada superficie con su formato |
| §9 G3 (`:215`) | "Frontend en verde (`npm test`, `npm run build`)" | Hoy `npm test` = **4 failed / 603 passed** (cascade de catálogo, ajeno a fechas). G3 debe ser "sin fallos nuevos respecto de la línea base" o arreglar esos 4 antes. Si no, el gate es inalcanzable y se va a mergear con rojo |
| §2.1 (`:42`) | `servicios/nueva/page.tsx:460` | `:459-467` (id 459, `register("serviceDate")` 463) — cosmético |

---

## 6. Huecos detectados

**Superficies que renderizan `serviceDate` y el plan no cubre: NINGUNA.** Inventario completo verificado (grep `serviceDate`, 55 matches; descartando tests y el request):

| Superficie | Línea | Cubierta por |
|---|---|---|
| `servicios/[servicioId]/page.tsx` (detalle) | `:254` | F-TZ-3 |
| `atenciones/verificaciones/page.tsx` | `:230` | F-TZ-4 |
| `atenciones/page.tsx` (listado taller) | `:238` vía `episodeDate` `:59-72` | F-TZ-5 |
| `history-section.tsx` (historial del vehículo) | `:90` vía `:46-67` | F-TZ-7 |
| `vehicle-timeline-card.tsx` (dashboard) | `:120` | F-TZ-8 |
| `traceability-summary-card.tsx` (dashboard) | `:129-133` | F-TZ-9 |
| `api.ts:1022` (write multipart) | `:1022` | No requiere cambio (envía `YYYY-MM-DD`) |

**Huecos reales (no superficies, sí especificación):**

1. **Tipo no actualizado**: `CareEpisodeVerificationItem.serviceDate` (`types/care-episode.ts:211`) debe pasar a `string | null`. Sin esto, F-TZ-4 compila pero rompe en runtime con `null`.
2. **`canonicalDateOnly` sin tipo**: F-TZ-5 lo usa y F-TZ-11 lo menciona de pasada, pero no está en el contrato de `CareEpisodeListItem` (`:353-372`).
3. **`TimelineEntry` sin contrato explícito**: no se define si `dateKind`/`dateOnly` son obligatorios ni cómo se derivan ante valores anómalos (ver F-TZ-6).
4. **`toDateInputValue()` sin consumidor** (plan §2.3 lo confirma: no hay PATCH). Helper muerto desde el día 1.
5. **`episodeDate()` en `atenciones/page.tsx`** tiene un fallback defensivo a `raw.serviceDate` (`:67`). Tras B-TZ-7 el listado no expone `serviceDate`; si queda, es código muerto con un tipo que miente. Decidir: borrarlo o documentarlo.
6. **No hay test de las superficies**: el plan confía en que "el render sale bien" sin un test de página que capture el bug (hoy no existe ninguno, ver S10). Un solo test de `history-section` + uno de `traceability-summary-card` con `serviceDate: "…T00:00:00.000Z"` y aserción de día 11 cierra la regresión de verdad.

**No son huecos (verificado, fuera de alcance correcto):** `vehicle-hero-card.tsx:143-149` (km + `recordedAt`, instante), `dealership-exhibition-section.tsx:56-65` (`artsDate`), `documents-section`/`document-preview-dialog` (`expiresAt`), las copias de `formatDate` de admin/perfil/transferencias/reclamos/claim (`createdAt`, `joinedAt`, `requestedAt`, `lastLoginAt`, `emailVerifiedAt`).

---

## 7. Riesgos de regresión y focos de code review

### 7.1 Riesgos

| # | Riesgo | Severidad | Mitigación / verificación |
|---|---|---|---|
| R1 | **Instantes de medianoche empiezan a mostrar `00:00`** en el historial al eliminar la heurística (F-TZ-7). Afecta `createdAt` de transferencias, `startsAt`, `recordedAt`, y episodios de taller con `checkedInAt` a las 00:00 | **ALTA** | `dateKind` decide TZ, no visibilidad de hora. Test de `history-section` con un transfer a `…T00:00:00Z` que debe seguir mostrando solo fecha |
| R2 | **Timeline del dashboard gana hora** si se unifica con `history-section` | MEDIA | Mantener `formatDate` para `instant` en `vehicle-timeline-card.tsx:120` |
| R3 | **`formatDateOnly` trunca un instante real** (rollout con back viejo + dato no-medianoche) | MEDIA | Tolerancia estrecha (solo `00:00:00Z`) + G1. Test con `2026-09-12T15:30:00Z`: debe caer a `instant`, no a día 12 |
| R4 | **Test que pasa en falso en máquinas UTC** (S13) | ALTA (proceso) | Pin de TZ + guarda de entorno. Sin guarda, el verde no significa nada |
| R5 | **Aserción de string `Intl` frágil** entre Node (full-ICU) y navegador | MEDIA | Aseverar componentes (día/mes/año), no la cadena completa. Baseline ya depende de full-ICU (`admin-status.test.ts:180`) |
| R6 | **SSR/hidratación**: hoy todas las superficies son client (S19). Si alguien mueve `formatDate` (instante) a un Server Component, el HTML del server (TZ del server) no coincide con el cliente | BAJA hoy, MEDIA a futuro | `formatDateOnly` con `timeZone:"UTC"` es TZ-independiente → seguro incluso en server. `formatDate`/`formatDateTime` (hora local) **no** usar en Server Components |
| R7 | **Orden D-070**: si `date` deja de ser ISO instantánea, el sort (`vehicle-history.ts:197-199`) cambia de semántica | MEDIA | No tocar `date`; tests `:341-383` deben pasar **sin editar** |
| R8 | **`<time dateTime>` inválido** si se pone `dateOnly` en el atributo | BAJA | `dateTime={entry.date}` (ISO) se mantiene |
| R9 | **`new Date("YYYY-MM-DD")`**: el parseo UTC es por especificación, pero depende del engine; usar `new Date(\`${d}T00:00:00Z\`)` explícito | BAJA | Foco de review |
| R10 | **G3 inalcanzable**: confundir fallos preexistentes con regresiones del cambio | MEDIA (proceso) | Baseline documentada: `vehicle-register-form.test.tsx` (1) y `vehicle-edit-form.test.tsx` (3). Comparar delta |
| R11 | **Capas de query**: TanStack no persiste caché, así que no hay mezcla de shapes entre deploys; pero el orden de deploy importa: front primero es seguro (soporta ISO medianoche), back primero también (el front trunca). Verificar con el backend ya deployado en staging | BAJA | D-TZ-7 bien aplicado — por eso es importante no romperlo con `slice` ciego |

### 7.2 Focos de code review (checklist del PR frontend)

- [ ] `formatDateOnly` acepta `string | null | undefined`, valida `^\d{4}-\d{2}-\d{2}`, devuelve `"—"` para inválidos, usa `timeZone:"UTC"` y parseo explícito `T00:00:00Z`.
- [ ] Ninguna llamada a `formatDateOnly` recibe un instante no-medianoche (grep + test).
- [ ] `formatDate` y `formatDateTime` **sin diff** (`git diff src/lib/format-date.ts` solo agrega).
- [ ] `dateKind` derivado únicamente de `serviceDate` válido; `dateOnly` `null` en `instant`.
- [ ] `history-section` conserva la hora para instantes no-medianoche (comparar render antes/después con transfer a `T14:05:00Z`).
- [ ] `vehicle-timeline-card` no muestra hora (nunca la mostró).
- [ ] `traceability-summary-card`: rama `serviceDate` vs `checkedInAt/createdAt` separada; `expiresAt` intacto.
- [ ] `atenciones/page.tsx`: un solo formateo, sin doble `formatDate(formatDate(...))`.
- [ ] Tipos: `CareEpisodeVerificationItem.serviceDate: string | null`, `CareEpisodeListItem.canonicalDateOnly?: string | null`, `TimelineEntry.dateKind/dateOnly`.
- [ ] Tests: guarda de TZ, aserciones por componentes, y al menos un test de página (historial y trazabilidad) que capture el bug.
- [ ] Sin dependencias nuevas; sin `date-fns`/`dayjs`.
- [ ] `npm test` con delta 0 respecto de la baseline; `npm run build` verde.

---

## 8. Condiciones para el GO

El workstream frontend puede arrancar **cuando se cumplan C1–C6**. C7–C9 son de cierre (merge/E2E).

- **C1 — Contrato §3 congelado** con visto bueno del TL backend: `serviceDate` calendar-only, `canonicalDateOnly` aditivo, `get-vehicle-history` **sin cambios** (el front depende de que el historial siga devolviendo el ISO de orden en `date`).
- **C2 — G1 ejecutado y en 0 filas** (`service_date::time <> '00:00:00'`). Si hay filas anómalas, el front **no** puede asumir truncado: se documenta el caso y el helper cae a `instant`.
- **C3 — Correcciones de §5 aceptadas en el plan** (no en un comentario del PR): helper con contrato de entrada, reglas por superficie (F-TZ-7/8/9), tipos nullable (F-TZ-4/11), `toDateInputValue` eliminado, F-TZ-10 opcional/descartada.
- **C4 — Estrategia de TZ de tests definida y verificable**: pin global en `vitest.config.ts` (`test.env.TZ`) **o** `process.env.TZ` por archivo; en ambos casos **guarda de entorno** + aserciones por componentes. Un test que pasa en UTC y falla en UTC-3 (o viceversa) es un defecto, no un detalle.
- **C5 — Baseline de tests acordada**: `npm test` hoy = **603 passed / 4 failed** (`vehicles/new/__test__/vehicle-register-form.test.tsx`, `vehicles/[id]/edit/__test__/vehicle-edit-form.test.tsx` ×3, cascade de catálogo). G3 se redefine como "sin fallos nuevos" **o** se arreglan esos 4 antes de empezar. No se puede exigir "suite verde" sobre una base roja.
- **C6 — Orden de implementación y propiedad de archivos**: un solo agente toca `src/lib/format-date.ts` (F-TZ-1) y `src/types/**` + `src/lib/vehicle-history.ts` (F-TZ-6/11) **antes** de las 6 superficies. Sin dos agentes en el mismo archivo (el plan ya lo dice en §7: ratificado).

Condiciones de cierre:

- **C7 — G4 en UTC-3** con el recorrido completo (crear `11/11/2026` → detalle, verificaciones, atenciones, historial, timeline → `11`), **más** un pase en UTC/UTC+9 del render para probar independencia de TZ del cliente.
- **C8 — Rollback por revert**, sin migración ni backfill (de acuerdo con el plan).
- **C9 — Sin cambios de copy/layout** más allá de la fecha; si el diff visual muestra `00:00` en algún lado, es R1 y bloquea el merge.

**Nota de alcance:** el frontend **no** depende de que B-TZ-7 (`canonicalDateOnly`) esté deployado para corregir el bug principal (`serviceDate`). Puede mergearse antes y el listado de atenciones seguirá usando `canonicalDate` formateado como instante hasta que el backend lo exponga. Eso es exactamente D-TZ-7 bien aplicado; no lo rompan con `slice` ciego.
