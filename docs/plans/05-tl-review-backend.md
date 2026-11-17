# 05 — Revisión técnica del Tech Lead (backend)
**Fecha:** 2026-11-12
**Estado:** GO CON CONDICIONES

> Alcance revisado: §3 (contrato), §4 (D-TZ-1..8), §5 (B-TZ-1..8), §8/§9 en lo backend.
> §6 (frontend) **no evaluado**; el contrato se ratifica solo desde el lado backend.
> Verificación hecha contra el repo `api-follow-app` en `e3c5926` (2026-11-12).

---

## 1. Veredicto global

El diagnóstico es correcto y la solución de fase 1 (date-only en el wire + normalización en el write path, sin migración) es la evolución adecuada del sistema actual. El diseño no introduce patrones nuevos, no toca autorización, no toca eventos y es reversible.

**GO CON CONDICIONES.** No hay bloqueos arquitectónicos, pero el plan **no puede implementarse tal cual**: contiene una premisa de datos falsa (seed), una query de gate incorrecta y subestima el impacto en tests existentes. Las condiciones están en §8.

No se aprueba `get-vehicle-history` como excepción implícita: debe quedar escrito en el contrato o el contrato de §3 queda contradictorio.

---

## 2. Validación de supuestos contra el código

| # | Supuesto del plan | Resultado | Evidencia |
|---|---|---|---|
| 1 | `CareEpisode.serviceDate` solo lo escribe el flujo owner | **PARCIAL** | En `src/` la única escritura es `create-owner-care-episode.handler.ts:171`. Pero `prisma/seed.ts:4692` escribe 30 episodios, y también les pone `serviceDate` a los `source='workshop'` (ej. `prisma/seed.ts:4224`). El seed contradice el invariante documentado en `docs/specs/owner-service-records-verification-flow.md:214` ("workshop → no serviceDate"). |
| 2 | "Todas las filas existentes con `serviceDate` son medianoche UTC" | **REFUTADO** | Los 30 care episodes del seed usan `T09:00:00.000Z` (`prisma/seed.ts:4215-4582`; p. ej. `:4224`, `:4565`, `:4577`). Una DB seedeada tiene 30 filas no-medianoche. En producción puede ser cierto, pero es una hipótesis a validar con G1, no un hecho. |
| 3 | Los episodios de taller dejan `serviceDate` en `null` | **CONFIRMADO en runtime / REFUTADO en seed** | `check-in.handler.ts:377-398` y `create-care-episode.handler.ts:64-79` no setean `serviceDate`. El seed sí (`prisma/seed.ts:4692`). |
| 4 | No hay interceptor/serializador global que deforme la fecha | **CONFIRMADO** | `main.ts:33-42` solo registra `AllExceptionsFilter` y `ValidationPipe`. No hay `APP_INTERCEPTOR` ni `useGlobalInterceptors` (grep sin coincidencias). `D-TZ-4` es válida. |
| 5 | `get-vehicle-history` devuelve el objeto Prisma crudo | **CONFIRMADO** | `get-vehicle-history.handler.ts:78-108` hace `select` y solo ordena en JS (`:106`, `:120-137`); no mapea `serviceDate`. El spec incluso bloquea el `select` (`get-vehicle-history.handler.spec.ts:274-293`). |
| 6 | No existe un helper de fechas reutilizable en `src/common/` | **CONFIRMADO para date-only** | No existe `src/common/dates/` ni helper de parseo/formato date-only. Sí existe `src/modules/dashboard/utils/timezone.ts:47-58` (`getWorkshopDayRange`), pero es TZ-aware y module-scoped; no cubre este caso y no debe fusionarse. No hay duplicación real. |
| 7 | `list-verifications` devuelve `serviceDate` como `Date \| null` | **CONFIRMADO** | No hay DTO: el tipo es inferido en `list-verifications.handler.ts:70-87`; el spec afirma `Date` en `list-verifications.handler.spec.ts:78`. |
| 8 | Cambiar `CareEpisodeDetailResponse.serviceDate` no rompe otros consumidores backend | **CONFIRMADO** | Solo se usa en `get-care-episode.handler.ts:11,45`. El controller devuelve el handler sin mapear (`care-episodes.controller.ts:313-326`). Ningún spec del controller afirma `serviceDate`. |
| 9 | Hay eventos/jobs que consumen `serviceDate` como instante | **REFUTADO / NINGUNO** | `CareEpisodeCreatedEvent` no incluye `serviceDate` (`care-episode-created.event.ts:12-22`). Grep en `src/modules/dashboard` y `src/modules/administration`: cero referencias a `careEpisode`/`serviceDate`. `vehicle-claims` solo usa `careEpisodeId`/`mileageIn` (`claim-state.service.ts:106-162`). |
| 10 | No existe PATCH de `serviceDate` | **CONFIRMADO** | Sin `@Patch`/`@Put` en `src/modules/care-episodes`. |
| 11 | Existe un spec de `list-care-episodes` para "actualizar" | **REFUTADO** | No existe `list-care-episodes.handler.spec.ts`. El listado D-070 hoy **no tiene test unitario**. |
| 12 | `CareEpisodeListItem` solo requiere cambios en `:157-186` | **REFUTADO** | La interfaz está en `list-care-episodes.handler.ts:24-40`; el mapeo en `:157-186`. B-TZ-7 debe tocar ambas. |
| 13 | El contrato §3 aplica a toda fecha calendario | **PARCIAL** | §5 excluye explícitamente `get-vehicle-history`, que seguirá devolviendo ISO. Es una excepción válida, pero debe quedar en §3; hoy el documento se contradice. |
| 14 | "El único cliente es web y ya manda `YYYY-MM-DD`" | **NO VERIFICABLE en este repo** | La evidencia citada (`api.test.ts:1196,1213`, `page.tsx:281`) está en `web-follow-app`. CORS (`main.ts:23-27`) no prueba que no existan clientes no-browser. |

---

## 3. Ratificación de decisiones

| ID | Estado | Motivo |
|---|---|---|
| **D-TZ-1** | **APROBADA** | `serviceDate` es fecha declarada por el usuario; el modelo actual (`schema.prisma:1002`, `timestamptz`) es el error de origen. La semántica date-only es la correcta. |
| **D-TZ-2** | **APROBADA CON CORRECCIÓN** | Fase 1 sin migración es la opción de menor riesgo. Pero la justificación "100 % de filas a medianoche UTC" es falsa por seed; la fuente de verdad debe ser G1, no la premisa. |
| **D-TZ-3** | **APROBADA CON CORRECCIÓN** | Estricto `YYYY-MM-DD` es correcto: elimina el parseo no determinista de date-time sin offset. Falta test a nivel DTO con `ValidationPipe` real y mensaje de error explícito. |
| **D-TZ-4** | **APROBADA** | Verificado que no hay interceptor global. El mapeo por handler es la única opción que preserva instantes. Corrección menor: `formatDateOnly` debe aceptar `null` y fechas inválidas. |
| **D-TZ-5** | **APROBADA** | La comparación contra fin de día UTC sigue siendo determinista; la ventana 21:00–24:00 local UTC-3 documentada es exacta una vez normalizado el input a medianoche. |
| **D-TZ-6** | **APROBADA (solo contrato)** | No evalúo la implementación frontend (§6 fuera de alcance). Desde backend, el contrato date-only es compatible con formatear en UTC. |
| **D-TZ-7** | **APROBADA CON CORRECCIÓN** | El rollout tolerante es correcto, pero "sin ventana de fechas rotas" debe leerse como "sin roturas nuevas": backend-first **no corrige** el síntoma hasta que el front formatee date-only. Debe decirse explícitamente. |
| **D-TZ-8** | **APROBADA** | `User` no tiene timezone; `Workshop.timezone` existe (`schema.prisma:19`) pero no aplica al flujo owner (PERSONAL). No introducir TZ por usuario en el MVP. |
| **B-TZ-1** | **APROBADA CON CORRECCIÓN** | Ubicación y responsabilidad correctas. Faltan: firma `formatDateOnly(date: Date \| null): string \| null`, guard de `Invalid Date` (hoy `toISOString()` lanzaría `RangeError` → 500) y rechazo de años < 100 (JS mapea 0–99 a 1900+). |
| **B-TZ-2** | **APROBADA CON CORRECCIÓN** | `@Matches` es la herramienta correcta. Falta spec de DTO siguiendo el patrón existente (`register-vehicle.dto.spec.ts:13-27`) y mensaje de validación. |
| **B-TZ-3** | **APROBADA CON CORRECCIÓN** | Cambio correcto, pero el impacto en tests es mucho mayor que `:159-174`: el fixture `makeDto` usa `serviceDate: '2026-09-10T10:00:00.000Z'` (`create-owner-care-episode.handler.spec.ts:42`), por lo que **casi todos los tests del archivo** fallarían con 400. |
| **B-TZ-4** | **APROBADA** | El override post-spread es correcto. Requiere test nuevo de shape (hoy no existe assert de la respuesta de creación). |
| **B-TZ-5** | **APROBADA** | Alcance y tipo correctos; `CareEpisodeDetailResponse` no tiene otros consumidores backend. Agregar caso `serviceDate: null`. |
| **B-TZ-6** | **APROBADA CON CORRECCIÓN** | Correcto, pero hay que actualizar la aserción existente `list-verifications.handler.spec.ts:78` (hoy espera `Date`). Conviene tipar el retorno con una interfaz para evitar drift. |
| **B-TZ-7** | **APROBADA CON CORRECCIÓN** | Campo aditivo correcto. Faltan: (a) la interfaz `CareEpisodeListItem` en `:24-40`, (b) **crear** el spec de `list-care-episodes` (no existe), (c) documentar `canonicalDateOnly` en el diseño de F-023. |
| **B-TZ-8** | **RECHAZADA (para este plan)** | No es necesario para el bug y es un cambio de wire en un endpoint existente (`maintenance.controller.ts:170`) con consumidores no verificables. Peor: solo cambia la respuesta; el input sigue con `@IsDateString` (`create-service-record.dto.ts:33-34`) + `new Date(...)` (`create-service-record.handler.ts:19`), y el GET de historial sigue devolviendo `Date` crudo (`maintenance.controller.ts:406`, `get-vehicle-service-history.handler.ts:44`). Queda un contrato incoherente. Mover a fase 2 con write path + GET incluidos. |

---

## 4. Respuestas a las preguntas abiertas (§11)

**1. D-TZ-3 — ¿breaking change o tolerar ISO por un release?**
**Estricto ahora.** Tolerar ISO conserva exactamente la ambigüedad que causa el bug (date-time sin offset). El costo es acotado: el flujo web manda `YYYY-MM-DD`; cualquier cliente roto recibe 400 con mensaje claro. Condición: test DTO con `ValidationPipe` real y release note. Si apareciera un cliente no inventariado, se resuelve con un release de compatibilidad explícito (aceptar ISO **solo con offset**), no abriendo el DTO desde el día 1.

**2. B-TZ-7 — ¿`canonicalDateOnly` aditivo o exponer `serviceDate` en el listado?**
**`canonicalDateOnly` aditivo.** El contrato de F-023 excluye deliberadamente los timestamps crudos (`docs/designs/care-episode-list-technical-design.md:138`). Exponer `serviceDate` reabre la ambigüedad fecha/instante en la superficie que más consume el front. Aditivo, `null` si y solo si `serviceDate` es `null`, y actualizar el doc de diseño.

**3. F-TZ-6/7 — ¿`dateKind` explícito o heurística `00:00:00`?**
Fuera de mi alcance (§6). Desde el contrato: `dateKind` explícito es lo correcto; la heurística se rompe con instantes reales a medianoche. Nota de coordinación: `get-vehicle-history` seguirá devolviendo ISO en fase 1, por lo que el front **debe** seguir aceptando ISO en ese endpoint (`slice(0,10)`).

**4. B-TZ-8 — ¿incluir `ServiceRecordResponseDto` ahora?**
**No.** Rechazada en este plan (§3). Es un cambio breaking sin beneficio para el bug, sobre un endpoint con consumidores no verificables desde este repo, y deja tres contratos incoherentes (POST response, POST input, GET history). Fase 2: DTO estricto de entrada + normalización + `formatDateOnly` en response y en `get-vehicle-service-history`.

**5. G4 — ¿quién ejecuta el E2E manual y con qué datos?**
QA (o el TL frontend) ejecutando, con el TL backend revisando la DB. Condiciones: máquina en `America/Argentina/Buenos_Aires`, DB seedeada, **crear un episodio nuevo** por API (no reutilizar los del seed, que están a `09:00Z`). Casos: (a) owner `11/11/2026` → DB `2026-11-11 00:00:00+00` → detalle/verificaciones/atenciones/timeline muestran `11/11`; (b) check-in de taller a las 22:00 local → sigue mostrando el día local correcto. G1 se corre aparte contra la DB target antes del deploy.

---

## 5. Correcciones al plan

| Ubicación | Dice | Debe decir |
|---|---|---|
| §0, párrafo "Hallazgo" | "solo lo escribe el flujo owner… todas las filas existentes son medianoche UTC" | "En runtime solo lo escribe el flujo owner; `prisma/seed.ts:4692` también escribe 30 filas, a las `09:00Z`, incluyendo episodios `workshop`. La hipótesis de medianoche UTC se valida con G1, no se asume." |
| §0 / §4 D-TZ-2 | "100 % de las filas históricas ya está a medianoche UTC" | "En producción se espera que sí; en DB seedeada hay 30 filas a `09:00Z`. G1 es la fuente de verdad." |
| §3, fila `ServiceRecord.serviceDate` | Incluye request/response `YYYY-MM-DD` | Marcar "fase 2" o eliminar la fila: B-TZ-8 queda fuera de este plan. |
| §3, párrafo final | "`canonicalDateOnly` es `null` cuando el episodio no tiene `serviceDate` (episodios de taller)" | "`canonicalDateOnly` es `null` si y solo si `serviceDate` es `null`. No usar 'episodio de taller' como sinónimo: el seed tiene episodios workshop con `serviceDate`." |
| §3 (contrato) vs §5 | Contrato "toda fecha calendario viaja `YYYY-MM-DD`" y `get-vehicle-history` excluido | Agregar excepción explícita en §3: "`GET /vehicles/:id/history` mantiene `serviceDate` ISO en fase 1; el front deriva `slice(0,10)`. Deuda fase 2." |
| §5 B-TZ-1 | `formatDateOnly(date)` | `formatDateOnly(date: Date \| null): string \| null`; guard de `Invalid Date`; rango de año razonable (o `setUTCFullYear`). |
| §5 B-TZ-2 | Tests: `—` | Agregar `create-owner-care-episode.dto.spec.ts` con `ValidationPipe` real (patrón `register-vehicle.dto.spec.ts:13-27`): acepta `2026-11-11`, rechaza `2026-11-11T00:00:00Z`, `2026-11-11T00:00:00` y `11/11/2026`. |
| §5 B-TZ-3 | "ajustar `handler.spec.ts:159-174`" | "Cambiar el fixture `makeDto` en `:42` a `'2026-09-10'`; reescribir el test de frontera `:159-174`; agregar 'date-time → 400'. El resto del archivo depende del fixture." |
| §5 B-TZ-6 | Tests genéricos | Actualizar la aserción existente en `list-verifications.handler.spec.ts:78`. |
| §5 B-TZ-7 | `list-care-episodes.handler.ts:157-186` | Agregar `:24-40` (`CareEpisodeListItem`) y "crear `list-care-episodes.handler.spec.ts` (no existe) con orden D-070 y `canonicalDateOnly` null/no-null". |
| §5 B-TZ-8 | Incluir ahora | Mover a fase 2 (ver §3 y §4). Si el orquestador decide incluirlo, debe sumar `create-service-record.dto.ts`, `create-service-record.handler.ts:19` y `get-vehicle-service-history.handler.ts:44`. |
| §8 test 3 | "`get-care-episode` / `list-verifications` / `list-care-episodes`: assert…" | `list-care-episodes` no tiene spec: hay que crearlo. Además agregar assert de que `checkedInAt`/`createdAt` siguen siendo ISO con `T`/`Z`. |
| §9 G1 | `service_date::time <> '00:00:00'` | El cast `timestamptz::time` usa el TimeZone de la sesión (falsos positivos con sesión UTC-3). Usar `(service_date AT TIME ZONE 'UTC')::time <> '00:00:00'`. Además: correr contra la DB target de producción, no contra una seedeada. |
| §9 G1 | "debe ser 0" | "Debe ser 0 en producción. En DB con seed se esperan 30 filas conocidas (`prisma/seed.ts:4215-4582`); auditarlas o normalizar el seed antes de correr el gate." |

---

## 6. Huecos detectados

Superficies backend que exponen `serviceDate` y el plan no cubre:

1. **`GET /api/maintenance/vehicles/:vehicleId/history`** (`maintenance.controller.ts:406-417` → `get-vehicle-service-history.handler.ts:44`) devuelve `serviceRecords` crudos con `serviceDate: Date`. Si B-TZ-8 se implementa, el mismo campo tendrá dos formatos en el módulo maintenance (POST date-only, GET ISO). Hoy no es un bug de CareEpisode, pero es un hueco de contrato.
2. **Input de `POST /api/maintenance/service-records`** (`create-service-record.dto.ts:33-34`, `create-service-record.handler.ts:19`): `@IsDateString` + `new Date(...)` sobre `@db.Date` permite corrimiento si llega un timestamp con offset. Es la misma familia de bug, no cubierta.
3. **Seed de datos** (`prisma/seed.ts:4692,4698`): 30 episodios con `serviceDate` a `09:00Z` y episodios workshop con `serviceDate` no-null. El plan no lo menciona y afecta G1 y el invariante que dice sostener.
4. **Documentación de contrato**: `docs/designs/care-episode-list-technical-design.md:135-138` define el contrato de F-023 sin `canonicalDateOnly`; hay que actualizarlo. Igual que `docs/specs/care-episode-list-flow.md`.
5. **Tipo de retorno de `list-verifications`**: inferido, sin interfaz. No es un hueco funcional, pero sí de contrato: el cambio puede driftear sin que TypeScript lo detecte.

**No hay huecos** en: `POST /care-episodes/owner` (B-TZ-4), `GET /care-episodes/:id` (B-TZ-5), `GET /care-episodes/verifications` (B-TZ-6), `GET /care-episodes` (B-TZ-7). `POST /care-episodes` y `POST /care-episodes/check-in` devuelven el episodio crudo, pero **nunca** setean `serviceDate` (`create-care-episode.handler.ts:64-79`, `check-in.handler.ts:377-398`), así que no hay exposición. No existen endpoints de export/CSV ni agregaciones de dashboard/administration que usen `serviceDate` (grep sin coincidencias).

---

## 7. Riesgos de regresión y focos de code review

**Riesgos que el plan no menciona:**

1. **Seed vs G1**: una DB de desarrollo/staging seedeada bloquea G1 con 30 filas. Si se "arregla" bajando el umbral del gate, se pierde la auditoría. Decisión: normalizar el seed o excluirlo explícitamente por ids.
2. **`formatDateOnly` sobre `Invalid Date`**: `toISOString()` lanza `RangeError`; un dato corrupto hoy devolvería un ISO inválido, después un 500. Agregar guard.
3. **Doble formato del mismo campo**: `CareEpisode.serviceDate` será date-only en 4 endpoints e ISO en `get-vehicle-history`. Cualquier consumer que asuma un único formato se rompe. Debe quedar documentado y el front debe manejar ambos.
4. **`canonicalDateOnly` en episodios workshop seedeados**: con el seed actual, `canonicalDateOnly` **no** será `null` para esos episodios, a diferencia de lo que asume §3. La UI de atenciones cambiará la fuente de render para esas filas (de `canonicalDate` local a slice UTC). Con `09:00Z` el día coincide, pero es un cambio de comportamiento no previsto.
5. **Clientes desconocidos**: el breaking change del DTO no está inventariado fuera de `web-follow-app`. Un 400 silencioso en producción se detecta tarde. Mitigación: mensaje de error explícito + log/monitoreo del 400 en el release.
6. **Tests con TZ**: los tests actuales pasan en UTC; el bug solo se manifiesta en UTC-3. G2 debe correr `npm test` también con `TZ=America/Argentina/Buenos_Aires` (y documentar la limitación en Windows si aplica).
7. **`canonicalDate` (D-070)**: el plan acierta en no tocarlo, pero cualquier refactor accidental del coalesce rompe el orden del listado y del historial. El spec de `get-vehicle-history` protege el `select` (`:274-293`), no el orden; el listado no tiene spec.
8. **Fase 2 (`@db.Date`)**: si algún día se migra, los valores de fase 1 ya en medianoche UTC permiten `USING (service_date AT TIME ZONE 'UTC')::date` sin pérdida. Debe quedar escrito para no improvisar un cast dependiente del TimeZone de sesión.

**Focos de code review (backend):**

- No debe quedar ningún `new Date(serviceDate)` en el flujo owner (`create-owner-care-episode.handler.ts:84`).
- No debe quedar `@IsDateString` en `CreateOwnerCareEpisodeDto`; el mensaje de error debe nombrar el formato.
- El JSON de respuesta debe tener `serviceDate` con exactamente 10 chars y `checkedInAt`/`createdAt` con `T`/`Z` en el mismo payload.
- `canonicalDate` debe seguir siendo ISO completo y el orden D-070 idéntico (comparar con `get-vehicle-history.handler.spec.ts:173-216`).
- `canonicalDateOnly` debe ser `null` solo cuando `serviceDate` es `null`.
- No debe haber cambios en el `select` de `get-vehicle-history` (`:78-103`) ni en `sortCareEpisodes`.
- El evento `care-episode.created` debe seguir emitiéndose post-commit y sin `serviceDate` en el payload.
- No debe haber migraciones, cambios de permisos ni de guards.
- Verificar que `list-care-episodes` conserve el contrato exhaustivo de F-023 (solo el campo aditivo).

---

## 8. Condiciones para el GO

1. **Corregir §0/§4/G1** según §5: eliminar la premisa "100 % medianoche UTC", documentar el seed y usar la query con `AT TIME ZONE 'UTC'`.
2. **Definir `formatDateOnly(date: Date | null): string | null`** con guard de fecha inválida; `parseDateOnly` puro (sin dependencia de Nest) que rechace round-trip inválido y años no representables.
3. **Ampliar B-TZ-3**: cambiar el fixture `create-owner-care-episode.handler.spec.ts:42` y reescribir `:159-174`; el plan debe reconocer que afecta a todo el archivo.
4. **Ampliar B-TZ-7**: incluir `CareEpisodeListItem` (`:24-40`) y **crear** `list-care-episodes.handler.spec.ts` (orden D-070 + `canonicalDateOnly` null/no-null).
5. **Agregar test DTO** para B-TZ-2 con `ValidationPipe` real (patrón `register-vehicle.dto.spec.ts`).
6. **Quitar B-TZ-8** de este plan (o, si el orquestador lo mantiene, incluir input DTO + `get-vehicle-service-history` y asumir el breaking change; mi recomendación es diferirlo).
7. **Escribir la excepción de `get-vehicle-history` en §3** y actualizar `docs/designs/care-episode-list-technical-design.md` y `docs/specs/care-episode-list-flow.md` con `canonicalDateOnly`.
8. **G1 contra la DB target de producción** con la query corregida; si hay filas no-medianoche, auditarlas por id y documentar la decisión antes de mergear.
9. **G2/G3 en verde** con `npm test` corrido además con `TZ=America/Argentina/Buenos_Aires`, y `npm run build`.
10. **Contrato congelado con el TL frontend**: `serviceDate` request/response = `YYYY-MM-DD`; `canonicalDateOnly: string \| null`; `get-vehicle-history` sigue ISO en fase 1; backend-first no corrige el síntoma hasta el deploy del front.
