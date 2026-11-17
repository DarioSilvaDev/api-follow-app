# 05 — Veredicto consolidado de los Tech Leads (punto de entrada)

> **Fecha:** 2026-11-13
> **Estado:** **GO CON CONDICIONES** — ambos workstreams aprobados; arranca cuando se cumplan C1–C7.
> **Consolida:** `05-tl-review-backend.md` (GO CON CONDICIONES) y `05-tl-review-frontend.md` (GO CON CONDICIONES).
> **Documento de diseño:** `05-fecha-calendario-service-date.md` (**v2**, ya corregido con las observaciones de ambas revisiones).
> **Alcance:** dictamen técnico y condiciones de arranque. No repite el plan: dice **qué quedó aprobado, qué se corrigió, en qué orden se ejecuta y qué bloquea el merge**.
> **Fuera de alcance:** reabrir el diagnóstico, escribir código, migraciones o decisiones de producto.

**Nota de trazabilidad:** las dos revisiones se hicieron sobre el plan **v1**. La v2 incorpora todas las correcciones de la §5 de cada revisión; el changelog v1→v2 está en el encabezado del plan. Si hay divergencia entre una revisión y la v2, **manda la v2**.

---

## 1. Veredicto global

No hay bloqueos arquitectónicos. El diagnóstico es correcto en ambos lados y la solución de fase 1 (date-only en el wire + normalización en el write path, sin migración) es la evolución adecuada del sistema. Ningún TL pidió rediseñar: ambos pidieron **precisión**.

| Workstream | Veredicto | Por qué no es GO limpio |
|---|---|---|
| **Backend** | GO CON CONDICIONES | Premisa de datos falsa (el seed escribe 30 `serviceDate` a `09:00Z`), query de gate incorrecta (`::time` depende del TimeZone de sesión) y subestimación del impacto en tests (`makeDto` rompe todo el archivo, no un test) |
| **Frontend** | GO CON CONDICIONES | `formatDateOnly` sin contrato de entrada podía truncar instantes reales; eliminar la heurística sin preservar instantes hacía aparecer `00:00`; las expectativas de test eran literalmente falsas en el ICU del repo; y la suite **no está verde de base** |

**Ambos coinciden en el punto que decide la implementación:** el fix es *formatear por semántica*, no *adivinar por el string*. Y **backend-first no corrige el síntoma** hasta que el front formatee date-only.

---

## 2. Contrato congelado

Regla única: **fecha calendario → `YYYY-MM-DD`; instante → ISO-8601 con `Z`.**

| Campo | Request | Response | Nota |
|---|---|---|---|
| `CareEpisode.serviceDate` | `YYYY-MM-DD` | `YYYY-MM-DD` | DTO estricto; persistencia `timestamptz` @ 00:00Z en fase 1 |
| `checkedInAt` / `closedAt` / `createdAt` | — | ISO `...Z` | sin cambios |
| `canonicalDate` (listado) | — | ISO `...Z` | **no cambia**: es la clave de orden D-070 |
| `canonicalDateOnly` (listado) | — | `YYYY-MM-DD \| null` | **nuevo, aditivo**; `null` sii `serviceDate` es `null` |

**Tres excepciones explícitas** (sin ellas el contrato se contradice a sí mismo):

1. `GET /api/vehicles/:id/history` mantiene `serviceDate` en ISO en fase 1; el front deriva el día del entry.
2. `POST /care-episodes` y `POST /care-episodes/check-in` devuelven el episodio crudo pero nunca setean `serviceDate`.
3. `maintenance` completo (input, response y GET) queda para fase 2, para mover el contrato entero de una vez.

**Corolario que evita la regresión más grave:** `dateKind` decide **zona horaria**, no si se muestra la hora. Una fecha calendario se formatea en UTC; un instante se formatea en hora local y conserva su criterio de presentación actual.

---

## 3. Correcciones que cambiaron el plan

Las 12 correcciones están aplicadas en la v2. Las cuatro que más movieron el diseño:

| # | Hallazgo | Efecto |
|---|---|---|
| 1 | `prisma/seed.ts:4692` escribe 30 episodios a `09:00Z`, **incluidos workshop** | Cae la premisa "todas las filas a medianoche UTC". **G1 pasa a ser la fuente de verdad**, no la hipótesis |
| 2 | `vitest.config.ts` no soporta TZ por suite; un dev en UTC ve el test en verde | Se exige pin de TZ **+ guarda de entorno** + aserciones por componentes |
| 3 | `formatDateOnly` con `slice(0,10)` ciego trunca instantes reales | Tolerancia **estrecha**: solo `YYYY-MM-DD` o `00:00:00Z`. Cualquier otro instante → `dateKind='instant'`, nunca se trunca |
| 4 | `list-care-episodes` **no tiene spec**; `CareEpisodeListItem` no estaba en el alcance | Se agrega la creación del spec y la interfaz al alcance de B-TZ-7 |

También se **quitó `B-TZ-8`** (ServiceRecord) del plan: cambiaba solo la respuesta de un endpoint, dejaba el input y el GET con otro contrato, y no aportaba al bug. Pasa a fase 2 completa.

---

## 4. Condiciones de arranque (C1–C7)

Ninguna es opcional. Todas son verificables.

| # | Condición | Dueño | Verificación |
|---|---|---|---|
| **C1** | Contrato de §2 congelado en ambos repos, con las 3 excepciones escritas | Orquestador | Este documento |
| **C2** | **G1 ejecutado contra la DB target** y en 0 filas; si hay anomalías, auditadas por id y documentadas | Backend TL | Query de §6 |
| **C3** | Correcciones de §3 aplicadas **en el plan**, no en un comentario de PR | Orquestador | Plan v2 ✔ |
| **C4** | Estrategia de TZ de tests definida y verificable (pin global o `process.env.TZ` por archivo **+ guarda**) | Frontend TL | Test con guarda |
| **C5** | Baseline de tests acordada: frontend **603 passed / 4 failed** preexistentes (cascade de catálogo, ajenos a fechas) | Ambos TLs | `npm test` |
| **C6** | Un solo dueño de `src/lib/format-date.ts` y de `src/types/**` **antes** de tocar páginas | Frontend TL | Orden de PRs |
| **C7** | `formatDateOnly` con contrato de entrada, guard de `Invalid Date` y firma nullable en ambos lados | Ambos TLs | Code review |

**C5 es la que evita el merge en rojo:** "suite verde" es inalcanzable hoy en el frontend. El gate real es **delta 0 respecto de la baseline**.

---

## 5. Orden de ejecución

```
G0  contrato congelado (este doc)
 │
 ├── G1  preflight SQL contra la DB target   ← bloquea ambos workstreams
 │
 ├── Workstream B (backend)                 ─┐
 │    B-TZ-1 → B-TZ-2/3 → B-TZ-4/5/6/7       │  repos distintos
 │                                           │  archivos disjuntos
 ├── Workstream F (frontend)                ─┘
 │    F-TZ-1/2 → F-TZ-6/11 → F-TZ-3/4/5/7/8/9
 │    (F-TZ-10 descartada)
 │
 ├── G2  backend: test en UTC-3 + build
 ├── G3  frontend: test sin fallos nuevos + build
 └── G4  E2E manual UTC-3 (+ pase en UTC)
```

**Independencia de despliegue verificada por ambos TLs:** el front puede mergear antes (el listado de atenciones degrada a `formatDate` hasta que exista `canonicalDateOnly`); el back puede mergear antes (el front solo trunca medianoches UTC válidas). El bug se cierra cuando **los dos** están en producción.

**Paralelismo:** sí, sin restricciones entre repos. Dentro de cada repo, secuencial según el orden de arriba.

---

## 6. Gates: comandos y verificación

**G1 — preflight (contra la DB target, no la seedeada):**

```sql
SELECT count(*) FROM care_episodes
WHERE service_date IS NOT NULL
  AND (service_date AT TIME ZONE 'UTC')::time <> '00:00:00';
```

- `service_date::time` a secas usa el **TimeZone de sesión** → falsos positivos. La forma correcta es con `AT TIME ZONE 'UTC'`.
- Esperado en producción: **0**. En DB seedeada: **30 filas conocidas** (`prisma/seed.ts:4215-4582`) que se auditan, no se ignoran.

**G2 — backend:** `npm test` (en UTC y con `TZ=America/Argentina/Buenos_Aires`) + `npm run build`.
**G3 — frontend:** `npm test` con **delta 0** vs `603 passed / 4 failed` + `npm run build`.
**G4 — E2E:** crear episodio **nuevo** por API (no reutilizar seed), recorrido completo, más un pase con el SO en UTC.

---

## 7. Riesgos que el code review debe bloquear

| # | Riesgo | Cómo se detecta |
|---|---|---|
| R1 | Instantes de medianoche empiezan a mostrar `00:00` en el historial | Test de `history-section` con transferencia a `…T00:00:00Z` |
| R2 | El timeline del dashboard gana hora | Mantener `formatDate` para `instant` en `vehicle-timeline-card.tsx:120` |
| R3 | `formatDateOnly` trunca un instante real | Test con `2026-09-12T15:30:00Z` → debe caer a `instant` |
| R4 | Test que pasa en falso en máquina UTC | Guarda `expect(resolvedOptions().timeZone).toBe(...)` |
| R5 | Se toca el orden D-070 | `get-vehicle-history.handler.spec.ts:173-216` y `vehicle-history.test.ts:341-383` pasan **sin editar** |
| R6 | `formatDateOnly` lanza 500 con dato corrupto | Guard de `Invalid Date` (hoy `toISOString()` lanza `RangeError`) |
| R7 | Cambio de comportamiento no previsto en atenciones seedeadas | `canonicalDateOnly` **no** será `null` para episodios workshop del seed |

---

## 8. Preguntas cerradas

| Pregunta | Ratificado |
|---|---|
| ¿DTO estricto o tolerar ISO? | **Estricto ahora.** Tolerar ISO conserva la ambigüedad que causó el bug. Si aparece un cliente no inventariado, se resuelve con un release que acepte ISO **solo con offset** |
| ¿`canonicalDateOnly` aditivo o exponer `serviceDate` en el listado? | **Aditivo.** El contrato de F-023 excluye timestamps crudos a propósito |
| ¿`dateKind` o heurística? | **`dateKind` explícito.** La heurística se rompe con un instante real a medianoche |
| ¿Incluir `ServiceRecordResponseDto`? | **No en este plan.** Fase 2 con input + response + GET juntos |
| ¿Quién hace el E2E? | QA o el TL frontend ejecutando; el TL backend revisando la DB. Con datos nuevos, no del seed |

---

## 9. Pendientes administrativos (no bloquean el arranque)

1. **Asentar `D-TZ-1..8` en `DECISION-REGISTER.md`** como `D-194..D-201` (último registrado: `D-193`).
2. **Actualizar `docs/designs/care-episode-list-technical-design.md:135-138`** y `docs/specs/care-episode-list-flow.md` con `canonicalDateOnly` (lo exige B-TZ-7).
3. **Ticket de normalización del seed** (§10.1 del plan): mientras `prisma/seed.ts:4692` escriba `09:00Z`, G1 nunca da 0 en una DB seedeada.
4. **Release note**: el DTO estricto devuelve 400 a cualquier cliente que envíe ISO completo. Monitorear esos 400 en el release.

---

## 10. Qué NO se toca (anti-alcance)

- `formatDate` / `formatDateTime` (instantes): sin diff; `format-date.ts` solo **agrega**.
- `canonicalDate`, `checkedInAt`, `closedAt`, `createdAt`, `expiresAt`, `recordedAt`.
- Algoritmo D-070 (coalesce + orden).
- `get-vehicle-history` (handler, `select` y orden).
- Schema Prisma, migraciones, permisos, guards, eventos.
- `maintenance` (fase 2), seed (ticket aparte), las 8 copias de `formatDate` de admin/perfil/transferencias/reclamos.
- Copy, layout y validaciones de UI existentes.

---

## 11. Siguiente paso

Con C1 y C3 ya cumplidas, el único bloqueo real es **C2 (G1 contra la DB target)**. Con eso:

1. Lanzar `backend-tech-lead-hcdv` sobre §5 (B-TZ-1..7) y `frontend-tech-lead` sobre §6 (F-TZ-1..9, 11) **en paralelo**.
2. Cada uno implementa contra el contrato de §2 sin reinterpretarlo; cualquier desvío vuelve acá antes de codificar.
3. Cierre en G2/G3/G4.
