# Especificación: F-023 — Listado de Atenciones del taller (CareEpisodes)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-10-18
> **Estado:** Decisiones de producto D-F023-1..4 **confirmadas por el usuario el 2026-10-18**. Lista para diseño técnico (Tech Lead).
> **Basado en:** ADR-005 (Vehicle Care Lifecycle), F-020 (crear desde taller), iteración 2-2 (cola de verificaciones), iteración 2-3 (D-069..D-075, timeline del propietario), diseño UX conjunto PM + UX/UI + Frontend Tech Lead (2026-10-18).
> **Restricción explícita del usuario (2026-10-18):** **NO se implementa testing en esta iteración** (deuda aceptada, ver §11).

---

## 1. Problema

Un miembro de taller (`owner`/`mechanic`) logueado y con contexto WORKSHOP activo **no tiene forma de visualizar las atenciones (CareEpisodes) que su taller registró**:

- Solo existen: crear (`/atenciones/nueva`), cola de verificaciones (`/atenciones/verificaciones`) y detalle por vehículo (`/vehicles/:id/servicios/:servicioId`).
- Backend: no existe endpoint de listado de episodios por taller (F-023 estaba solo planificado en `docs/features.md`).
- El journey de lectura del lado del taller queda roto a mitad de camino: puede crear y verificar, pero no puede ver lo que su taller registró.

## 2. Objetivo

Completar el journey end-to-end de **lectura** del taller: dashboard → "Atenciones" (nav, contexto WORKSHOP) → listado de las atenciones de **su taller activo** → detalle de una atención.

La vista es la cara de lectura del lado del taller del mismo concepto que el timeline del propietario: **unidad = CareEpisode (Atención)**, no órdenes ni presupuestos (ADR-005).

## 3. Actores

| Actor | Acceso |
|---|---|
| Miembro de taller `owner` / `mechanic` con contexto WORKSHOP activo | Ve el listado de las atenciones de SU taller (workshopId del contexto). |
| Miembro con rol `employee` | Fuera del alcance MVP del journey definido (create/verify están asignados a owner/mechanic). Escalar a Tech Lead + Security si se desea incluir. |
| Propietario (contexto PERSONAL) | No accede: la entrada de nav no se muestra; por URL directa ve estado controlado. |
| super_admin | Comportamiento a definir por Tech Lead (bypass de PermissionsGuard existente). |

## 4. Decisiones de producto (confirmadas 2026-10-18)

### D-F023-1 — Sin filtros en el MVP

- El listado no lleva filtros (ni por estado, ni por vehículo, ni por rango de fechas).
- Justificación: sobrealcance (AGENTS.md §6); scope ya estrecho (un taller activo), volumen inicial bajo, orden desc resuelve "ver recientes".
- Candidato futuro (no MVP): filtro por estado (Abierto/Entregado/Cancelado).

### D-F023-2 — Sin nombre del propietario por fila (solo placa)

- Cada fila identifica el vehículo por **placa + catálogo (marca/modelo/año)**; no se expone el nombre del dueño en el listado.
- Justificación: minimiza superficie de PII en una vista de historial multi-vehículo (screen sharing, fotos). La cola de Verificaciones mantiene el nombre porque exige identificar al cliente para confirmar (comportamiento distinto y correcto).
- Cualquier inclusión de nombre en el futuro requiere PM + Security.

### D-F023-3 — Paginación mínima (page-based, page size ~20)

- Paginación tipo admin: "Página X de Y · Z en total" + Anterior/Siguiente (reutilizar patrón/copy de `AdminTablePagination`).
- Page size propuesto: **20** (el Tech Lead confirma en el contrato).
- Alternativas descartadas: "cargar más" (patrón inexistente en el repo); cap fijo sin paginación (viable solo como decisión técnica del TL si aporta simplicidad real).

### D-F023-4 — Sin quick-action en el dashboard en esta iteración

- El acceso es la entrada de nav "Atenciones" (contexto WORKSHOP). No se agrega link en `/dashboard` en MVP.
- Se reevalúa con datos de uso.

## 5. User Journey

```
Actor: Miembro de taller (owner/mechanic) logueado
  ↓
Contexto: Personal → activa su taller en el selector del header (X-Context-Type: WORKSHOP)
  ↓
Nav WORKSHOP muestra: Atenciones · Nueva atención · Verificaciones · Mi taller
  ↓
Clic "Atenciones" → GET listado del workshopId del contexto (paginado)
  ↓
Loading (spinner, role="status") → lista de cards ordenada más reciente primero
  ↓
Clic en una card → /vehicles/{vehicleId}/servicios/{servicioId} (detalle existente, proyección por actor S1)
```

### Flujo alternativo: taller sin atenciones
- Empty state: "Todavía no hay atenciones registradas" + CTA "Registrar atención" → `/atenciones/nueva`.

### Flujo alternativo: error de red/5xx
- `role="alert"` + botón "Reintentar" (refetch sin recargar).

### Flujo alternativo: URL directa sin contexto WORKSHOP
- Guard temprano (`workshopId === null`), sin query: mensaje "Para ver las atenciones de tu taller necesitás operar en el contexto de un taller. Seleccioná un taller en el selector del header y volvé a intentar." (espejo de verificaciones). Nunca pantalla en blanco ni lista de otro taller.

### Flujo alternativo: episodio cancelled
- Visible, con sufijo "(cancelada)" en el título y badge "Cancelado" (D-071; misma lógica que el timeline: no se ocultan eventos).

### Flujo alternativo: episodio source=owner
- Badge de origen: "Registrado por el propietario" (unverified) o "Verificado" (verified). **Sin** botón "Confirmar" (esa acción vive solo en Verificaciones).

## 6. Reglas de negocio / requisitos funcionales

### RF-1: Alcance del listado (scope por contexto)
- El listado muestra **exclusivamente** los CareEpisodes cuyo `workshopId` = workshopId del contexto WORKSHOP activo.
- Operación sensible al contexto (WorkshopOnlyGuard / patrón de `GET /care-episodes/verifications`).

### RF-2: Orden canónico (regla de producto — ADR-005 / D-070)
- Más reciente primero: `serviceDate ?? checkedInAt ?? createdAt` **desc**.
- El timestamp canónico de D-070 es regla de producto (consistente con el timeline del vehículo); la realización técnica (sort JS post-query vs. otra) la define el Tech Lead.

### RF-3: Título y fallback (D-071)
- `title` presente → se usa.
- `title` null + `source=workshop` → "Atención de taller".
- `title` null + `source=owner` → "Servicio registrado".
- `status=cancelled` → sufijo " (cancelada)".

### RF-4: Campos por fila (contrato mínimo de producto)
- **Incluidos:** `id`, `vehicleId` (requerido para el deep-link), `title`, `status`, `source`, `verification`, fecha canónica, `mileageIn` (si existe), vehículo: `licensePlate` + catálogo (marca, modelo, año).
- **Excluidos (PII / información interna):** nombre/email del propietario, `internalNotes`, `customerComplaint`, `customerNotes`, y cualquier otro campo no listado arriba. El backend usa `select` explícito (patrón defensa en profundidad de 2-3 / Security Review #13).

### RF-5: Estados en UI (copy existente, reutilizado)
- `open` → badge "Abierto" (info); `delivered` → "Entregado" (success); `cancelled` → "Cancelado" (destructive). Textos ya implementados en el detalle (`servicios/[servicioId]`).

### RF-6: Navegación
- Ítem "Atenciones" en `NAV_ITEMS_WORKSHOP` (`/atenciones`), visible **solo** con contexto WORKSHOP activo.
- Orden de nav: Atenciones → Nueva atención → Verificaciones → Mi taller.
- Fix de `isActive`: "Atenciones" se activa solo en `/atenciones` exacto (evitar highlight triple con `startsWith` sobre `/atenciones/nueva` y `/atenciones/verificaciones`).
- Destino del clic: `/vehicles/{vehicleId}/servicios/{servicioId}` (detalle existente; no se crea un segundo detalle).

### RF-7: No duplicar Verificaciones
- La cola `GET /care-episodes/verificaciones` y su UI no se tocan. El listado es historial de lectura; Verificaciones es cola de acción.

## 7. UX (resumen del diseño aprobado 2026-10-18)

- Ruta: `/atenciones` → `src/app/(dashboard)/atenciones/page.tsx` (patrón espejo de `verificaciones/page.tsx`: guard temprano + query `enabled` con workshopId).
- UI: **cards** (lenguaje visual del módulo taller; NO tabla admin). Toda la card es link.
- Estados: loading (Card + spinner, `role="status"`), empty (EmptyState + CTA), error (`role="alert"` + Reintentar), sin contexto (Card `role="status"`).
- Copy clave:
  - H1: "Atenciones"; subtítulo: "Atenciones registradas por {workshopName}" (nombre desde sesión, patrón verificaciones).
  - Empty: "Todavía no hay atenciones registradas" / "Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá." / CTA "Registrar atención".
  - Loading: "Cargando atenciones…". Error: "No se pudieron cargar las atenciones." + "Reintentar".
- Formatos: fecha `es-AR` (`day: 2-digit, month: short, year: numeric`); km `toLocaleString("es-AR")`.
- Mobile: hereda el ítem del drawer existente; cards responsive sin scroll horizontal.

## 8. Alcance (dentro / fuera)

### Dentro (F-023)
- Backend: endpoint de listado workshop-scoped (ruta/guards/permiso a definir en diseño técnico — §10), con `select` explícito PII-excluido y orden RF-2.
- Frontend: página `/atenciones`, entrada nav + fix `isActive`, tipos + función api, estados de UI, navegación al detalle.
- Copy y estados según §7.

### Fuera
- Filtros (D-F023-1), nombre del propietario por fila (D-F023-2), quick-action en dashboard (D-F023-4).
- Edición/cancelación de episodios (D-075, iteración candidate 2-5).
- Listado "vehículos del taller" (D-019, F-043 futuro).
- Integración de service records / work orders / estimates (F-021/F-022+).
- **Testing: FUERA por decisión explícita del usuario (2026-10-18) — ver §11.**

## 9. Criterios de aceptación

- [ ] Dado un miembro de taller con contexto WORKSHOP activo, cuando hace clic en "Atenciones" del nav (desktop o drawer móvil), entonces llega a `/atenciones` y ve el listado de episodios de **su** taller activo, ordenado por fecha canónica desc (RF-2).
- [ ] Dado que la lista está cargando, entonces se muestra estado de carga con spinner y texto `role="status"` (nunca lista vacía flash).
- [ ] Dado que el taller no tiene atenciones, entonces se ve empty state con CTA "Registrar atención" hacia `/atenciones/nueva`.
- [ ] Dado un error de red/5xx, entonces se muestra mensaje `role="alert"` y "Reintentar" refetchea sin recargar.
- [ ] Dado un usuario en contexto PERSONAL que accede por URL directa a `/atenciones`, entonces ve el estado controlado de "seleccioná un taller" (nunca pantalla en blanco ni datos de otro taller).
- [ ] Dado el listado con filas, cuando el usuario hace clic en una card, entonces navega a `/vehicles/{vehicleId}/servicios/{servicioId}`.
- [ ] Dado un episodio `status=cancelled`, entonces aparece con sufijo "(cancelada)" y badge "Cancelado" (no se oculta).
- [ ] Dado un episodio `source=owner`, entonces lleva badge de origen ("Registrado por el propietario" o "Verificado") y **no** ofrece acción "Confirmar".
- [ ] Dado un episodio `source=workshop` con `title=null`, entonces su título es "Atención de taller" (RF-3).
- [ ] Dado que el payload del listado, entonces **no** contiene nombre/email del propietario, `internalNotes` ni `customerComplaint` (RF-4).
- [ ] Dado que el usuario no tiene contexto WORKSHOP, entonces la entrada "Atenciones" no aparece en el nav.
- [ ] Dado que hay más episodios que el page size, entonces se muestran total y controles Anterior/Siguiente (si totalPages > 1).
- [ ] Regresión: "Nueva atención", "Verificaciones", timeline del vehículo y detalle de atención siguen funcionando; el highlight de nav no marca "Atenciones" activa dentro de sus subrutas.

### Build / Calidad
- [ ] `npm run build` (backend y frontend) sin errores.
- [ ] Suite existente: ver §11 (testing diferido por decisión del usuario).

## 10. Decisiones técnicas pendientes (Tech Lead)

1. **Ruta del endpoint** — recomendación en discusión: `GET /api/care-episodes` (raíz, declarada **antes** de `@Get(':id')` para evitar el foot-gun F-012) vs. ruta nominal (`/care-episodes/workshop`). El TL decide y documenta.
2. **Permiso de lectura** — hoy solo existen `care-episode.create / verify / attach` (seed). Opciones: sin `PermissionsGuard` (precedente `GET /maintenance/*`), permiso nuevo `care-episode.list` con seed, o reutilización. Requiere Tech Lead + Security. Restricción de producto: el listado es del taller del contexto; membership activa es mínimo absoluto.
3. **Realización del orden RF-2** — sort JS post-query (patrón validado en 2-3) u otra técnica; el TL valida factibilidad e impacto con paginación.
4. **Shape de paginación** — `{data, meta}` con page/limit/total (patrón admin) y page size 20 (D-F023-3).
5. **Fix de `isActive`** en `web-follow-app/src/app/(dashboard)/layout.tsx`.
6. **Reutilización de `AdminTablePagination`** — ¿mover a `ui/`, importar desde admin, o duplicar copy local? (decisión de Frontend Tech Lead).
7. **Super_admin** — comportamiento del bypass en este endpoint.
8. **Rol `employee`** — si Security/TL escalan su inclusión, requiere decisión de producto del PM (por ahora fuera de alcance, §3).

## 11. Testing — diferido (decisión explícita del usuario, 2026-10-18)

**El usuario decidió NO implementar testing por ahora para esta funcionalidad.**

- No se escriben tests nuevos (unitarios, de integración ni e2e) en esta iteración.
- Se registra como **deuda técnica aceptada**: los AC de §9 se verifican **manualmente** (checklist del Tech Lead/QA al momento de la revisión).
- Riesgo aceptado: regresiones silenciosas en contratos (orden, PII, nav) — mitigación parcial: el `select` explícito del backend y la revisión de build.
- Si un cambio necesario **rompe un test existente** (p.ej. `dashboard-layout.test.tsx` por el ítem de nav nuevo), el Tech Lead lo evaluará: corregir un test roto por el cambio es mantenimiento de regresión mínima, no "implementar testing"; ante duda, escalar al usuario.

## 12. Dependencias

- F-020 (modelo CareEpisode, WorkshopOnlyGuard, patrón del módulo).
- Iteración 2-2 (cola de verificaciones — patrón de query workshop-scoped y UI gemela).
- Iteración 2-3 (D-070 orden canónico, D-071 fallback de título, patrón `select` explícito PII).
- ADR-005 (episodio como unidad de historia; estados open/delivered/cancelled; interfaz "Atención").
- `GET /care-episodes/:id` (S1) como destino del detalle.
- Frontend: `useActiveContext`, `workshopMemberships` de sesión (workshopName), design system `ui/` (Card, Badge, EmptyState, Button).

---

## DECISIONES DE PRODUCTO (confirmadas 2026-10-18)

1. **D-F023-1:** sin filtros en el MVP.
2. **D-F023-2:** sin nombre del propietario por fila (solo placa + catálogo).
3. **D-F023-3:** paginación mínima page-based, page size ~20.
4. **D-F023-4:** sin quick-action en el dashboard; acceso por nav "Atenciones" (solo contexto WORKSHOP).
5. **(Restricción del usuario)** Sin implementación de testing en esta iteración (§11).

---

*Fin de la especificación F-023 — lista para diseño técnico del Tech Lead.*
