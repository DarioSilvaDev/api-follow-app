# Especificación: F-012 — Buscar Vehículo (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-11
> **Estado:** Borrador para validación técnica (Tech Lead)
> **Basado en:** features.md Fase 1 (F-012), D-035..D-043, F-010/F-011 (spec + QA), patrón `search-users`

---

## 1. Problema

El listado "Mis vehículos" (`/vehicles`) muestra todos los vehículos del owner con paginación fija (page 1, limit 20) **pero no permite encontrar uno específico**:

- Un owner con varios vehículos debe recorrer la lista hasta encontrar el que busca.
- No existe ningún parámetro de búsqueda en `GET /api/vehicles` (solo `page` y `limit`).
- No existe matching parcial/texto en el módulo de vehículos (el precedente `contains`/`mode: 'insensitive'` solo existe en `search-users`).

## 2. Objetivo

Permitir al propietario encontrar un vehículo dentro de su lista escribiendo parte de la placa:

1. Escribe en una barra de búsqueda (ej. "SMK").
2. El sistema filtra su lista de vehículos por placa que contenga ese texto (case-insensitive).
3. Ve el resultado actualizado sin recargar la página.
4. Puede limpiar la búsqueda y volver a la lista completa.

## 3. Actores

| Actor | Descripción |
|---|---|
| **Propietario autenticado** | Usuario con sesión activa (cookies HttpOnly D-001), context PERSONAL, owner de al menos un vehículo. |

> **Fuera de alcance (MVP):** búsqueda global de vehículos de terceros; búsqueda por VIN/número de motor; filtros por marca/modelo/año; búsqueda admin (existe `admin.vehicles.list` para un futuro) ; búsqueda semántica/full-text; paginación UI (la paginación backend ya existe, la UI se mantiene page 1 / limit 20 como hoy).

## 4. Decisiones de producto (propuestas — pendientes de confirmación)

| ID | Decisión propuesta | Detalle |
|---|---|---|
| **D-044** | Búsqueda por placa parcial en la lista del propietario | `GET /api/vehicles?q=` filtra por `licensePlate` con `contains` + `mode: 'insensitive'`. Mínimo de 2 caracteres para disparar la búsqueda (evita resultados inútiles y ruido); con menos caracteres se muestra la lista sin filtrar. |
| **D-045** | Sin filtros de catálogo en el MVP de F-012 | Marca/modelo/año quedan post-MVP: el valor para el owner es encontrar por placa (dato que ya conoce). Los endpoints de catálogo y la cascada existentes no se tocan. |

> Se registran en `DECISION-REGISTER.md` al cierre (D-044..D-045). Ver validación técnica (§9) para el diseño final.

## 5. Contrato Backend

### GET /api/vehicles (MODIFICAR — aditivo)

```text
Auth: cookie access_token (JwtAuthGuard) + ContextGuard (default PERSONAL, D-020 A1) — SIN permiso nuevo
Query params (HOY): page?, limit?
Query params (NUEVO): q?  — texto libre de búsqueda por placa (case-insensitive)
  - Si q está presente y tiene >= 2 caracteres tras trim → where AND { licensePlate: { contains: q, mode: 'insensitive' } }
  - Si q está ausente o < 2 caracteres → comportamiento actual (sin filtro)
  - El OR de búsqueda se combina con el scope de ownership existente (AND)
  - Se excluye lo soft-deleted cuando el ticket follow-up de soft-delete filtering se implemente (ver §12)
Response: 200 → { data: VehicleResponseDto[], meta: { total, page, limit, totalPages } } (shape actual, sin cambios)
Errores: 401 (sin sesión) — sin casos 4xx nuevos (q no válida = se ignora)
```

### Sin cambios
- `GET /api/vehicles/:id`, POST, PATCH, DELETE (F-010/F-011).
- Catálogo (`GET /api/vehicle-*`), DTO de item (`VehicleResponseDto`), estados del frontend.

## 6. User Journey

```
Actor: Propietario autenticado (owner)
  ↓
Contexto: En "Mis vehículos" (/vehicles)
  ↓
Acción: Escribe "SMK" en la barra de búsqueda
  ↓
Sistema:
  1. (Debounce ~300ms)
  2. GET /api/vehicles?q=SMK&page=1&limit=20 (credentials: include)
  3. Filtra por placa contains 'smk' (insensitive), scope ownership activa
  4. Renderiza resultados; estado "sin resultados" si no coincide nada
  ↓
Acción: Limpia la barra (o borra hasta < 2 caracteres)
  ↓
Sistema: GET /api/vehicles (sin q) → lista completa
  ↓
Resultado: El owner encuentra su vehículo por placa y puede ir a Editar (F-011) / Detalle (F-013)
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Búsqueda por placa parcial (D-044)
- `q` se normaliza con `trim()` y se busca con `contains` + `mode: 'insensitive'` sobre `licensePlate`.
- El filtro se combina con el scope de ownership (`ownerships.some(userId, endsAt: null)`) con AND.
- `q` con menos de 2 caracteres tras trim → no filtra (comportamiento sin q).

### RF-2: El listado sin q sigue siendo idéntico al actual
- Sin regresión: `GET /api/vehicles?page=&limit=` sin `q` → mismo `{ data, meta }` que hoy (tests existentes deben pasar sin cambios).

### RF-3: Estados del frontend
- Con resultados → Cards (igual que hoy).
- Sin resultados con q → estado vacío con mensaje "No se encontraron vehículos con esa placa" + CTA limpiar búsqueda.
- Sin resultados sin q → estado vacío actual ("No tenés vehículos registrados" + CTA registrar).
- Error de red/5xx → estado de error actual con Reintentar.
- La búsqueda no rompe loading/error existentes.

### RF-4: Debounce y refetch
- El input dispara la búsqueda con debounce (~300ms, hook propio `useDebounce` en `frontend/src/hooks/`).
- El queryKey pasa de estático a dinámico incluyendo `q` (ej. `["vehicles", page, limit, effectiveQ]`).
- La query usa `placeholderData: keepPreviousData` (React Query v5) para que la lista NO flashee al cambiar `q` (sin esto, `isLoading` desmontaría la lista en cada tipeo).
- La invalidación de F-011 (`invalidateQueries(["vehicles"])`) sigue funcionando (queryKey base se mantiene).

### RF-5: Accesibilidad / UX
- La barra de búsqueda tiene placeholder claro ("Buscar por placa…"), label para screen readers, y botón/ícono de limpiar.
- Sin foco automático que interfiera; Enter no es necesario (búsqueda en vivo con debounce).

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Backend:
  - `list-vehicles.handler.ts`: param `q` opcional + filtro `licensePlate contains insensitive` (plantilla: `search-users.handler.ts`).
  - Tests handler: con q (match parcial, insensitive), sin q (sin regresión), q < 2 chars (sin filtrar), q con espacios (trim), q sin resultados (data vacía + meta total 0), combinación q + ownership.
- Frontend:
  - `vehicleApi.listVehicles`: acepta `q` opcional (searchParams).
  - Barra de búsqueda en `/vehicles` + hook `useDebounce` + queryKey dinámico.
  - Estado "sin resultados con q" + CTA limpiar.
  - Tests: página con búsqueda (escribe → refetch con q, sin resultados → mensaje, limpiar → lista completa), api.test (listVehicles con q).

### Fuera (próximas iteraciones / NO romper)
- Filtros por marca/modelo/año; búsqueda por VIN/engine; búsqueda admin.
- Paginación UI (backend ya soporta page/limit; la UI mantiene page 1 / limit 20).
- Filtro soft-deleted en listado (ticket follow-up sistémico de soft-delete filtering, DECISION-REGISTER.md Sección 18, ítem 2 — con decisiones de producto pendientes: archivo/retirados, reactivación, 404 vs 410).
- Búsqueda full-text/trigram (sin índice; no justificado para placa corta con índice existente `@@index([licensePlate])`).

## 9. Cambios Técnicos Sugeridos (para análisis del Tech Lead)

> El PM define QUÉ y POR QUÉ. El Tech Lead define CÓMO.

| Área | Sugerencia | Nota |
|---|---|---|
| Where de búsqueda | En `list-vehicles.handler.ts`, construir `qCondition = { licensePlate: { contains: q, mode: 'insensitive' } }` y combinarlo con el `where` de ownership con AND — `guard typeof query.q === 'string'` (queries repetidas `?q=a&q=b` entregan array → `.trim()` explotaría); normalizar en el handler: `trim()` + mínimo 2; opcional hardening `slice(0, 20)` | Validado por TL. No tocar `search-users`; es plantilla, no dependencia. |
| Validación de `q` | Mantener params crudos + interfaz interna (`q?: string` en `ListVehiclesQuery`). NO crear `ListVehiclesQueryDto` en F-012 (evita el primer query-DTO y casos 400 nuevos; el DTO coordina cuando lleguen filtros marca/modelo D-045 post-MVP). Deuda preexistente documentada: `?page=abc` hoy produce NaN → no se arregla en F-012 | Decisión TL. ValidationPipe global ya hace `enableImplicitConversion`. |
| URL de búsqueda | **Aditivo en `GET /api/vehicles?q=`** (no ruta `/vehicles/search`). Mojón técnico: `@Get(':id')` ya está registrado (L356); una ruta `/vehicles/search` mal ordenada sería capturada por `:id` → 404/400 inesperados | Decisión TL (coincide con PM). |
| Frontend | Hook `useDebounce` en `frontend/src/hooks/` (existe el directorio), queryKey dinámico 4-elementos `["vehicles", page, limit, effectiveQ]`, **`placeholderData: keepPreviousData` obligatorio** (sin él la lista flashea), input con label/limpiar, `maxLength={20}` (VarChar(20)), estados vacíos ramificados por `effectiveQ` | Requisito TL. Sin dependencias nuevas. |

## 10. Criterios de Aceptación

- [ ] Dado un owner con 3 vehículos ("SMK001", "QWE234", "ABC123"), cuando escribe "SMK" en la búsqueda, entonces ve solo "SMK001" (GET /api/vehicles?q=SMK).
- [ ] Dado el mismo owner, cuando escribe "smk" (minúsculas), entonces ve "SMK001" (case-insensitive).
- [ ] Dado el mismo owner, cuando escribe "AB" (con espacios alrededor) y tiene "ABC123", entonces el filtro funciona tras trim y busca por término "AB" (match).
- [ ] Dado el mismo owner, cuando escribe un solo carácter ("A"), entonces NO filtra (comportamiento sin q) — el listado completo permanece.
- [ ] Dado el mismo owner, cuando escribe "ZZZ" (sin match), entonces el frontend muestra "No se encontraron vehículos con esa placa" (data vacía + meta.total 0) y un CTA para limpiar.
- [ ] Dado un owner con vehículos, cuando borra la búsqueda (o baja de 2 caracteres), entonces vuelve la lista completa (refetch sin q).
- [ ] Regresión: `GET /api/vehicles` sin q → mismo `{ data, meta }` que hoy (tests existentes verdes).
- [ ] La búsqueda no rompe la invalidación existente tras editar (F-011) ni los estados de loading/error/vacío.

### Build / Calidad
- [ ] Backend: `npm test` verde (suites + tests nuevos) + `npm run build` sin errores.
- [ ] Frontend: `npm test` verde (tests nuevos) + `npm run build` sin errores.
- [ ] Sin secretos, sin dependencias nuevas, sin cambios de schema (la búsqueda por contiene sobre placa usa el índice existente; si el TL decide migración, registrarlo).

## 11. Dependencias

- D-001 (cookies HttpOnly), D-020/D-021 (Active Context PERSONAL).
- Backend existente: `GET /api/vehicles` (listado ownership-scoped, paginación `{ data, meta }`).
- Patrón `search-users.handler.ts` (contains/insensitive + paginación).
- F-010/F-011: `VehicleResponseDto`, queryKey `["vehicles"]` en frontend, invalidación post-edición.
- Sin permiso nuevo: el listado no es permission-gated (ownership-scoped).

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `contains` (`%q%`) no usa el índice B-tree (ni `@unique` ni `@@index([licensePlate])` ayudan; ese índice NO da soporte de búsqueda) | Baja (MVP con pocos vehículos por owner) | Alcance limitado a placa del owner; volumen post-ownership pequeño; si crece, evaluar trigram/full-text (decisión arquitectónica aparte). |
| El filtro de búsqueda convierte el `where` en `undefined` cuando no hay `q` y hay ownership — romper regresión | Baja | Mantener el branch actual sin q tal cual; tests de regresión. |
| Datos soft-deleted aparecen en el listado (bug preexistente, no de F-012) | Media (preexistente) | NO se resuelve en F-012; queda en el ticket follow-up sistémico de soft-delete filtering (DECISION-REGISTER.md Sección 18, ítem 2; ver también UNIFIED-BASELINE.md). La búsqueda no agrava el defecto, solo lo hace levemente más "descubrible"; documentado en el follow-up. |
| Lista flashea al cambiar `q` (queryKey dinámico sin caché previa) si NO se implementa `placeholderData: keepPreviousData` | Media → Alta si se omite | Requisito obligatorio en RF-4: `placeholderData: keepPreviousData` (React Query v5) — con esto `isLoading` queda false y el spinner no flashea. |
| Wildcards LIKE (`%`/`_`) en la entrada del usuario: `q="A_B"` matchea "AXB" | Baja | No es issue de seguridad (parametrizado), semántica inesperada acotada; documentado. `slice(0, 20)` opcional como hardening. |

---

*Fin de la especificación F-012 (borrador).*