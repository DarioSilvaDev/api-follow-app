# Diseño Técnico: Listado de Atenciones del taller (CareEpisodes) — F-023

> **Autor:** Frontend Tech Lead — HCDV
> **Fecha:** 2026-10-18
> **Basado en:** `docs/specs/care-episode-list-flow.md` (decisiones de producto D-F023-1..4 confirmadas por el usuario el 2026-10-18).
> **Estado:** PARA IMPLEMENTACIÓN. Decisiones técnicas cerradas (§1). Escalaciones pendientes etiquetadas en §6.
> **Restricción del usuario (2026-10-18):** SIN testing nuevo en esta iteración (deuda aceptada, spec §11). Los tests existentes que el cambio podría afectar se evalúan en §5.

---

## 0. Resumen ejecutivo

Feature de lectura del lado del taller: endpoint workshop-scoped + página `/atenciones` con cards paginadas. Sin filtros, sin PII del propietario, sin quick-action. Cierre del journey de lectura (crear → verificar → **ver**).

1. **Backend:** `GET /api/care-episodes` (raíz) con `WorkshopOnlyGuard + PermissionsGuard('care-episode.list')`, `select` explícito PII-excluido, orden canónico D-070 (sort JS) + paginación page-based (limit 20).
2. **Frontend:** página `/atenciones` (espejo de verificaciones), ítem "Atenciones" en `NAV_ITEMS_WORKSHOP`, fix de `isActive` para `/atenciones` exacto, tipos + función api.
3. **Seed:** permiso nuevo `care-episode.list` asignado a roles de taller `owner` y `mechanic` (no `employee`).
4. **Sin migración de schema.** Sin tests nuevos (restricción usuario).

---

## 1. Decisiones técnicas

Formato del proyecto. Cada decisión cierra un ítem de spec §10.

---

### D-TL-F023-1 — Ruta del endpoint: `GET /api/care-episodes` (raíz)

**Decisión:** `GET /api/care-episodes` en la raíz del recurso, declarada **antes** de `@Get(':id')` en `care-episodes.controller.ts`.

**Justificación:**
- **Sin foot-gun F-012 incluso si el orden se rompiera.** La raíz `/care-episodes` no tiene segmento extra, por lo que `@Get(':id')` (que matchea `/care-episodes/:id`) jamás la captura. La ruta nominal alternativa `/care-episodes/workshop` **sí** sería capturada por `:id` si se declara después — el foot-gun es real solo para esa opción. La raíz es inmune.
- **El `workshopId` viene del contexto, no de la URL.** El listado es del taller del contexto WORKSHOP activo (RF-1); nominar "workshop" en la ruta sugiere falsamente que el taller se elige por path.
- **Coherencia con el módulo:** `POST /api/care-episodes` (create) ya vive en la raíz. El listado es el GET gemelo del create.
- El orden de declaración se mantiene como buena práctica documental (espejo del comentario F-012 ya presente en el controller para `verifications`).

**Alternativa descartada:** `GET /care-episodes/workshop` — introduce el foot-gun F-012 real, no aporta información (el scope es del contexto) y rompe la simetría con el POST raíz.

---

### D-TL-F023-2 — Permiso de lectura: nuevo `care-episode.list` + `PermissionsGuard`

**Decisión:** Permiso nuevo `care-episode.list` (seed) + `WorkshopOnlyGuard` + `PermissionsGuard` con `@Permissions('care-episode.list')` en el método del controller.

**Justificación:**
- **Coherencia del módulo:** todos los endpoints `care-episode` con guard de método hoy (`create`, `verify`, `attach`) usan `PermissionsGuard` + permiso propio. El listado sin permiso sería el único outlier del módulo.
- **Consistencia con la vista gemela:** `GET /care-episodes/verificaciones` (la otra lectura del taller del módulo) sí usa `PermissionsGuard` (`care-episode.verify`). El listado debe alinearse con su gemelo, no con `maintenance` (módulo distinto, sin permisos de lectura por diseño propio).
- **Excluye `employee` a nivel API**, no solo de UI. La spec (§3) puso a `employee` fuera del alcance MVP; sin permiso, la API le respondería 403 y la exclusión no depende solo de ocultar la nav. El permiso se asigna a `owner` y `mechanic` en el seed.
- **Costo controlado:** 1 entrada en el array `permissions` + 2 códigos en las matrices `systemWorkshopRolePermissions.owner/mecanic` del seed. Upserts idempotentes; re-running seguro. Sin migración de schema (los permisos/roles son datos sembrados, no columnas).
- **Seguridad:** la lectura pasa por `ContextResolver` (membresía activa obligatoria → 403 `INVALID_CONTEXT` si no), `WorkshopOnlyGuard` (solo contexto WORKSHOP) y el permiso. `WorkshopOnlyGuard` corre ANTES de `PermissionsGuard` (anti-bypass D-024 A2, patrón verbatim del módulo).

**Precedente `GET /maintenance/*` descartado:** esos listados no usan `PermissionsGuard` porque son accesibles desde varios contextos (PERSONAL con `vehicleId`, WORKSHOP) con autorización en el handler — modelo distinto al de un listado WORKSHOP-only. No aplica aquí.

**Reutilización de permiso existente descartada:** no hay permiso de lectura de episodios. `care-episode.verify` es de escritura; `history.view` es de historial por vehículo (scope distinto). Reusarlos sería semánticamente incorrecto.

**Riesgo aceptado (ver §6):** roles de taller *custom* (creados con `workshop.roles.create`) no recibirán el permiso nuevo automáticamente → sus miembros obtendrían 403 hasta asignárselo. Se documenta y se eleva a Security (punto S-2).

---

### D-TL-F023-3 — Orden RF-2 + paginación: sort JS post-query + fetch detallado acotado a la página

**Decisión:** Orden canónico `serviceDate ?? checkedInAt ?? createdAt` **desc** implementado con **sort JS post-query** (patrón validado en iteración 2-3, `get-vehicle-history.handler.ts`), combinado con paginación page-based en dos fases:

1. `count({ where: { workshopId } })` → `total`.
2. `findMany({ where: { workshopId }, select: { id, serviceDate, checkedInAt, createdAt } })` → filas **ligeras** (4 columnas escalares, sin joins).
3. Sort JS D-070 (coalesce desc + tiebreak `createdAt` desc) sobre las filas ligeras — misma semántica exacta que el timeline.
4. Slice `[(page-1)*limit, page*limit]` → ≤20 IDs de la página.
5. `findMany({ where: { id: { in: ids } }, select: <select completo con join de catálogo> })` → detalles **solo de la página**.
6. Reordenar los ≤20 detalles según la posición del sort (el `in` de Prisma no preserva orden): map `id → índice` y sort por él.
7. Mapear a `CareEpisodeListItem` con `canonicalDate = serviceDate ?? checkedInAt ?? createdAt`.

**Justificación:**
- **Prisma `orderBy` compuesto NO equivale al coalesce** (rechazado en 2-3): con `serviceDate` null e `checkedInAt` seteado, el orderBy compuesto los trataría distinto que el coalesce. El sort JS es la única realización hoy verificada del D-070 exacto.
- **Escalabilidad aceptable para MVP:** la query ligera trae N filas × 4 columnas escalares (pocos KB incluso para miles de episodios de un taller); el sort JS de miles de items es instantáneo; el fetch detallado (con joins) queda acotado al page size (20). El volumen inicial es bajo por decisión de producto D-F023-1.
- **Prisma tipado:** se mantiene dentro de `PrismaService`; sin `$queryRaw` ni SQL crudo (evita superficie de error de SQL y pérdida de tipos en el MVP).

**Alternativa descartada:** `$queryRaw` con `COALESCE(service_date, checked_in_at, created_at) DESC` + `LIMIT/OFFSET`. Correcto y más escalable a gran volumen, pero sale de Prisma tipado, requiere joins manuales de catálogo en SQL y es propenso a errores — desproporcionado para el volumen inicial. Se registra como **evolución futura** si el volumen por taller lo justifica (deuda consciente, §5).

**Page size:** **20**. Coincide con `DEFAULT_PAGE_SIZE` de `src/common/constants/index.ts` (`DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`). Confirmado el ~20 propuesto en D-F023-3. Se reutiliza `MAX_PAGE_SIZE` (100) como clamp superior del param `limit`.

---

### D-TL-F023-4 — Shape del response y query params

**Decisión:** Envelope `{ data, meta }` idéntico al patrón admin/vehicles/maintenance existente.

**Query params:**
- `page` — opcional, default `1`, clamp `min 1`. `Math.max(1, page ?? 1)`.
- `limit` — opcional, default `20` (`DEFAULT_PAGE_SIZE`), clamp `1..100` (`MAX_PAGE_SIZE`).

**Response shape (JSON de ejemplo):**

```json
{
  "data": [
    {
      "id": "3f2b8c1e-9a4d-4e6b-8f21-0c5d7a9e3b44",
      "vehicleId": "7d1c4e2a-2b8f-4a5c-9e3d-1f6a8b0c2d55",
      "title": "Cambio de aceite y filtros",
      "status": "delivered",
      "source": "workshop",
      "verification": "unverified",
      "canonicalDate": "2026-10-10T14:00:00.000Z",
      "mileageIn": 45230,
      "vehicle": {
        "licensePlate": "ABC123",
        "brand": "Toyota",
        "model": "Corolla",
        "manufactureYear": 2020
      }
    },
    {
      "id": "9c5d7a9e-3b44-4f21-8c5e-7a0d2b6f8e11",
      "vehicleId": "7d1c4e2a-2b8f-4a5c-9e3d-1f6a8b0c2d55",
      "title": null,
      "status": "cancelled",
      "source": "owner",
      "verification": "verified",
      "canonicalDate": "2026-09-28T09:30:00.000Z",
      "mileageIn": null,
      "vehicle": {
        "licensePlate": "ABC123",
        "brand": "Toyota",
        "model": "Corolla",
        "manufactureYear": 2020
      }
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

**Notas de contrato:**
- `canonicalDate` es **siempre** un ISO string no-null (`createdAt` es NOT NULL en el schema, es el último fallback del coalesce). El backend lo pre-computa para que el frontend no reimplemente D-070 en esta vista y para que el sort del backend y el dato mostrado sean coherentes por construcción.
- `vehicle.version` **NO** se incluye: RF-4 es exhaustivo ("marca, modelo, año"); el `select` explícito excluye cualquier campo no listado (defensa en profundidad, patrón 2-3 / Security Review #13). La UI muestra "marca modelo · año".
- `status`, `source`, `verification` viajan como los enums Prisma crudos; los labels ("Abierto", "Cancelado", "Registrado por el propietario", "Verificado") los resuelve el frontend (RF-5, copy existente).
- Campos **excluidos** por contrato (PII / internos): nombre/email del propietario, `internalNotes`, `customerComplaint`, `customerNotes`, `workshopName`, `checkedInAt`/`serviceDate`/`createdAt` crudos (solo el canónico), y cualquier otro no listado.

---

### D-TL-F023-5 — Fix de `isActive` en `web-follow-app/src/app/(dashboard)/layout.tsx`

**Decisión:** Conjunto de `EXACT_MATCH_HREFS` para los hrefs que no deben usar `startsWith`.

**Propuesta concreta** (reemplaza el helper actual):

```ts
// Hrefs que se activan SOLO en match exacto del pathname (RF-6): evita que
// "Atenciones" (/atenciones) se marque activa dentro de /atenciones/nueva ni
// /atenciones/verificaciones. Mismo criterio que /dashboard.
const EXACT_MATCH_HREFS = new Set(["/dashboard", "/atenciones"]);

const isActive = (href: string) => {
  if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
  return pathname.startsWith(href);
};
```

**Justificación:**
- El helper actual especía `/dashboard` con un `if` dedicado; agregar `/atenciones` como segundo `if` duplicaría la lógica. Un `Set` es claro, extensible y sin duplicación.
- `startsWith` sigue siendo correcto para el resto (`/admin/*`, `/workshops/:id`); no se toca.
- El ítem "Atenciones" se agrega al inicio de `NAV_ITEMS_WORKSHOP` para respetar el orden de nav de RF-6 (Atenciones → Nueva atención → Verificaciones → Mi taller).

---

### D-TL-F023-6 — `AdminTablePagination`: importar desde `components/admin/` (sin mover)

**Decisión:** Importar `AdminTablePagination` desde `@/components/admin/admin-table-pagination` en la página de atenciones. **No** moverlo a `ui/` ni copiarlo. Registrar deuda técnica LOW: moverlo a `components/shared/` en un refactor dedicado.

**Justificación:**
- **El componente no tiene dependencias admin:** solo usa `Button` (ui) + iconos `lucide`. El acoplamiento es únicamente de *path/naming*, no de lógica ni de datos admin.
- **Costo de cambio vs. beneficio:** moverlo toca 3 páginas admin + 1 test (`admin-foundation.test.tsx`) que no tienen relación con F-023 — inflaría el diff de esta feature con cambios no cohesivos (AGENTS.md §36: cambios pequeños y cohesivos).
- **La spec pide "reutilizar patrón/copy"** (D-F023-3), y el componente entrega exactamente ese copy ("Página X de Y · Z en total" + Anterior/Siguiente). Reesbirlo local duplicaría copy y lógica de `canPrevious/canNext/disabled`.
- **No premature abstraction / incremental evolution:** el move a `shared/` es un refactor de estructura sin valor funcional inmediato; se diffiere hasta que haya un refactor dedicado o un 4º consumidor que justifique el churn.

**Nota:** el nombre "Admin" en un contexto de taller es cosméticamente imperfecto pero funcional; se acepta por pragmatismo MVP y se documenta la deuda.

---

### D-TL-F023-7 — Comportamiento de `super_admin`

**Decisión:** Sin casos especiales nuevos. El comportamiento es idéntico al resto del módulo care-episodes (`create`/`verify`/`attach`):

- **Contexto PERSONAL** (sin headers o `X-Context-Type: PERSONAL`): `WorkshopOnlyGuard` responde `403 Forbidden` ("This operation requires a WORKSHOP context") **antes** de que `PermissionsGuard` (y su bypass de super_admin) se evalúe. El bypass **no** se alcanza desde PERSONAL (anti-bypass D-024 A2, patrón verbatim).
- **Contexto WORKSHOP:** `ContextResolver` exige **membresía activa** del usuario en el taller (si no → `403 INVALID_CONTEXT`). Un super_admin solo puede tener contexto WORKSHOP si es miembro activo del taller. Si lo es, el bypass de `PermissionsGuard` lo deja pasar el `care-episode.list` — inocuo, porque ya es miembro y el `WorkshopOnlyGuard` ya lo validó.
- **Super_admin sin membresía activa en el taller:** no puede obtener contexto WORKSHOP de ese taller (el `ContextResolver` lo rechaza) → `403 INVALID_CONTEXT`. No existe un "bypass de super_admin" para leer talleres ajenos por este endpoint. Si en el futuro se necesita observación platform-wide de episodios, será un endpoint/admin con diseño propio (fuera de F-023).

**Razón:** no se introduce lógica nueva de super_admin; se hereda el modelo de seguridad ya auditado del módulo.

---

### D-TL-F023-8 — Rol `employee`: confirmada la exclusión

**Decisión:** `employee` queda **excluido** del listado a nivel API (no recibe `care-episode.list` en el seed) y su nav "Atenciones" se comporta igual que hoy "Verificaciones"/"Nueva atención": el nav WORKSHOP se renderiza para cualquier miembro con contexto activo (el nav no filtra por permiso), pero la API responde `403` al employee.

**Justificación:** la spec (§3) ya puso a `employee` fuera del alcance MVP del journey (create/verify están asignados a owner/mechanic). La exclusión por permiso es la materialización coherente de esa decisión de producto. **No se escala a PM** porque es la confirmación de una decisión ya tomada, no una nueva.

**Coherencia de UX:** el employee verá el ítem "Atenciones" en el nav y, al entrar, el estado de error (`403`) — exactamente el mismo comportamiento que hoy con "Verificaciones" y "Nueva atención" (cuya API también le responde 403 por falta de permiso). No se introduce un patrón nuevo de filtrado de nav.

**Escalación condicional:** si en el futuro el PM/Security desean dar lectura a `employee`, se agrega el código a la matriz del role en el seed (cambio de una línea) — el diseño lo anticipa sin rework. Ver punto S-1 (§6).

---

## 2. Contrato backend

### 2.1 Ruta y guards (orden exacto)

`GET /api/care-episodes`

| Orden | Guard | Nivel | Función | Error |
|---|---|---|---|---|
| 1 | `JwtAuthGuard` | clase | Autenticación (JWT cookie) | `401` |
| 2 | `ContextGuard` | clase | Resuelve `request.context` (WORKSHOP exige `X-Context-Id` + membresía activa) | `403 INVALID_CONTEXT` |
| 3 | `WorkshopOnlyGuard` | método | Contexto debe ser `WORKSHOP` | `403` "This operation requires a WORKSHOP context" |
| 4 | `PermissionsGuard` | método | `@Permissions('care-episode.list')` | `403` "Missing required permissions" |

`WorkshopOnlyGuard` corre **antes** de `PermissionsGuard` (anti-bypass D-024 A2, idéntico a `POST /`, `POST :id/verify`, `POST :id/attachments`).

### 2.2 Query params

| Param | Tipo | Default | Clamp | Notas |
|---|---|---|---|---|
| `page` | number | `1` | `min 1` | `Math.max(1, page ?? 1)` |
| `limit` | number | `20` (`DEFAULT_PAGE_SIZE`) | `1..100` (`MAX_PAGE_SIZE`) | `Math.min(Math.max(1, limit ?? 20), 100)` |

Sin otros params (D-F023-1: sin filtros).

### 2.3 Select de Prisma

**Query ligera (fase 2):**

```ts
select: {
  id: true,
  serviceDate: true,
  checkedInAt: true,
  createdAt: true,
}
```

**Query detallada (fase 5, página):**

```ts
select: {
  id: true,
  vehicleId: true,
  title: true,
  status: true,
  source: true,
  verification: true,
  serviceDate: true,
  mileageIn: true,
  checkedInAt: true,
  createdAt: true,
  vehicle: {
    select: {
      licensePlate: true,
      manufactureYear: true,
      version: {
        select: {
          name: true,
          model: {
            select: {
              name: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
    },
  },
}
```

Sin joins a `ownerships`/`user` (D-F023-2: sin PII del propietario). Sin `internalNotes`/`customerComplaint`/`customerNotes` (RF-4).

### 2.4 Estrategia de orden + paginación

Ver D-TL-F023-3 (§1). Resumen del flujo del handler:

```
count(workshopId) → total
findMany(light select, where workshopId) → N filas {id, serviceDate, checkedInAt, createdAt}
sort JS D-070 (coalesce desc, tiebreak createdAt desc)
slice [(page-1)*limit, page*limit) → ≤20 ids
findMany(full select, where id IN ids) → ≤20 detalles
reordenar por posición del sort (map id→índice)
map → CareEpisodeListItem (canonicalDate coalesce)
return { data, meta: { total, page, limit, totalPages: ceil(total/limit) } }
```

**Semántica de página fuera de rango:** `page > totalPages` → slice vacío → `data: []` con `meta` consistente. **No** es `404`; es `200` con lista vacía (mismo comportamiento que los listados admin/vehicles existentes). La UI muestra el empty state.

**Tiebreak determinista:** `createdAt` desc (idéntico a `get-vehicle-history.handler.ts:126`) — garantiza orden estable entre requests para tests y UX.

### 2.5 Manejo de errores

| Escenario | HTTP | Causa | Mensaje |
|---|---|---|---|
| Sin sesión / JWT inválido | `401` | `JwtAuthGuard` | (genérico) |
| Contexto WORKSHOP sin `X-Context-Id` o sin membresía activa | `403` | `ContextResolver`/`ContextGuard` | `INVALID_CONTEXT` |
| Contexto no-WORKSHOP (PERSONAL/DEALERSHIP/PLATFORM) | `403` | `WorkshopOnlyGuard` | "This operation requires a WORKSHOP context" |
| Miembro sin `care-episode.list` (p. ej. `employee`) | `403` | `PermissionsGuard` | "Missing required permissions" |
| Taller sin episodios o `page` fuera de rango | `200` | — | `{ data: [], meta }` |

### 2.6 Índices usados

- `@@index([workshopId, createdAt])` (schema línea 998): cubre el filtro `where: { workshopId }` (prefijo del índice) tanto en el `count` como en el `findMany` ligero y el detallado. El **orden** es JS (no usa el índice); aceptable para el volumen inicial (D-TL-F023-3).

---

## 3. Implementación backend (archivos)

**Sin tests nuevos** (restricción del usuario, spec §11).

### 3.1 Crear

| Archivo | Contenido |
|---|---|
| `src/modules/care-episodes/queries/list-care-episodes/list-care-episodes.handler.ts` | `ListCareEpisodesHandler` con `execute({ workshopId, page, limit })`. `PrismaService` directo (sin repository, patrón del módulo). Implementa D-TL-F023-3. Exporta `CANONICAL_SORT` (helper del coalesce) solo si se desea compartir — por ahora vive privado en el handler (espejo de `sortCareEpisodes` de `get-vehicle-history`). |

### 3.2 Modificar

| Archivo | Cambio |
|---|---|
| `src/modules/care-episodes/controllers/care-episodes.controller.ts` | Nuevo método `list` con `@Get()` **raíz**, declarado **antes** de `@Get(':id')` (y después de `@Get('verifications')`, con el comentario F-012 correspondiente). `@UseGuards(WorkshopOnlyGuard, PermissionsGuard)` + `@Permissions('care-episode.list')`. Inyecta `@ActiveContext() ctx` + `@Query('page')`/`@Query('limit')` como `string`, parsea a number (espejo de `listVerifications`). Check defensivo `ctx.type !== 'WORKSHOP'` → `ForbiddenException` (espejo de los otros métodos). Instancia `ListCareEpisodesHandler` en el constructor. |
| `src/modules/care-episodes/care-episodes.module.ts` | Agregar `ListCareEpisodesHandler` a `providers`. |
| `prisma/seed.ts` | (a) Agregar entrada `{ module: 'care-episode', resource: 'care-episode', action: 'list', code: 'care-episode.list', description: 'List care episodes of the active workshop' }` al array `permissions` (junto a los existentes ~línea 326). (b) Agregar `'care-episode.list'` a las matrices `systemWorkshopRolePermissions.owner` y `.mechanic` (líneas ~799 y ~817). **No** agregar a `.employee`. Re-running idempotente (upserts). |

### 3.3 No se toca

- `schema.prisma` (sin migración; los permisos son datos sembrados).
- Ningún handler/query existente. Ningún test existente (los specs de guards del controller usan reflection por método; agregar un método no afecta a los existentes).

---

## 4. Implementación frontend (archivos)

### 4.1 Crear

| Archivo | Contenido |
|---|---|
| `src/app/(dashboard)/atenciones/page.tsx` | Página cliente, espejo de `verificaciones/page.tsx`. Ver §4.3. |

### 4.2 Modificar

| Archivo | Cambio |
|---|---|
| `src/app/(dashboard)/layout.tsx` | (a) Agregar `{ href: "/atenciones", label: "Atenciones" }` al inicio de `NAV_ITEMS_WORKSHOP` (orden RF-6). (b) Aplicar fix `EXACT_MATCH_HREFS` de D-TL-F023-5. |
| `src/types/care-episode.ts` | Agregar tipos del contrato (§4.4). |
| `src/lib/api.ts` | Agregar `careEpisodeApi.listCareEpisodes` (§4.5). |

### 4.3 Página `/atenciones` (estructura)

- **Guard temprano:** `workshopId = activeContext?.type === "WORKSHOP" ? activeContext.workshopId : null`. Si `null` → Card con `role="status"`: "Para ver las atenciones de tu taller necesitás operar en el contexto de un taller. Seleccioná un taller en el selector del header y volvé a intentar." (espejo de verificaciones). Sin query.
- **Query:** `useQuery({ queryKey: ["care-episode-list", workshopId, page], queryFn: () => careEpisodeApi.listCareEpisodes({ page, limit: PAGE_SIZE }), enabled: workshopId !== null, retry: false })`. `PAGE_SIZE = 20`. Estado local `page` (`useState(1)`), reseteado al cambiar de taller (efecto sobre `workshopId`).
- **workshopName:** `user?.workshopMemberships.find(m => m.workshopId === workshopId)?.workshop.name` (espejo verificaciones). Subtítulo: `Atenciones registradas por {workshopName}`.
- **Heading:** H1 "Atenciones" + link "Volver al inicio" (ArrowLeft) — espejo verificaciones.
- **Estados:**
  - *Loading* (`isLoading`): Card + `Loader2` spinner + `role="status"` "Cargando atenciones…".
  - *Error* (`isError`): Card + `role="alert"` "No se pudieron cargar las atenciones." + Button outline "Reintentar" (`RotateCw`, `refetch`).
  - *Empty* (`data.data.length === 0`): `EmptyState` con title "Todavía no hay atenciones registradas", description "Cuando ingreses un vehículo o verifiques un servicio del propietario, vas a verlo acá.", action = Button link a `/atenciones/nueva` "Registrar atención".
  - *Listado:* `<ul>` de cards.
- **Card de atención** (toda la card es link, `Link` → `/vehicles/${item.vehicleId}/servicios/${item.id}`, Card envuelta con `group`/hover):
  - **Título (RF-3 / D-071):** helper local `displayTitle(item)` = `item.title ?? (item.source === "workshop" ? "Atención de taller" : "Servicio registrado")`; si `status === "cancelled"`, sufijo `" (cancelada)"`. (Copia local de la lógica de `vehicle-history.ts:164-169` — ver §4.6.)
  - **Badge status (RF-5):** mapa local `STATUS_LABELS` = `{ open: {label:"Abierto", variant:"info"}, delivered:{label:"Entregado", variant:"success"}, cancelled:{label:"Cancelado", variant:"destructive"} }` (copia del detalle `servicios/[servicioId]/page.tsx:54-58` — ver §4.6).
  - **Badge origen (solo `source === "owner"`):** `verification === "verified"` → "Verificado"; `"unverified"` → "Registrado por el propietario". **Sin** botón "Confirmar" (esa acción vive solo en Verificaciones, RF-7).
  - **Meta:** placa + `(marca modelo · año)` (helper `vehicleSummary` espejo de verificaciones, sin `version`), fecha `formatDate(canonicalDate)` (`es-AR`, `day:2-digit, month:short, year:numeric`), `mileageIn` `toLocaleString("es-AR") + " km"` si no-null.
- **Paginación:** `AdminTablePagination` importado de `@/components/admin/admin-table-pagination` (D-TL-F023-6), renderizado **solo** cuando `meta.totalPages > 1`, con `page`, `totalPages`, `total`, `isFetching`, `onPageChange: setPage`. Envuelto en Card o barra con `border-t` (el componente ya trae `border-t border-border px-4 py-3`).

### 4.4 Tipos (`src/types/care-episode.ts`)

```ts
/** GET /api/care-episodes — item del listado de atenciones del taller (F-023 RF-4). */
export interface CareEpisodeListItem {
  id: string;
  vehicleId: string;
  title: string | null;
  status: "open" | "delivered" | "cancelled";
  source: CareEpisodeSource;
  verification: CareEpisodeVerification;
  /** Fecha canónica D-070 pre-computada por el backend (serviceDate ?? checkedInAt ?? createdAt). Siempre ISO no-null. */
  canonicalDate: string;
  mileageIn: number | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
}

/** Envelope meta, idéntico al patrón admin/vehicles. */
export interface CareEpisodeListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** GET /api/care-episodes → { data, meta }. */
export interface CareEpisodeListResponse {
  data: CareEpisodeListItem[];
  meta: CareEpisodeListMeta;
}
```

Reutiliza los tipos existentes `CareEpisodeSource` y `CareEpisodeVerification`.

### 4.5 Función API (`src/lib/api.ts`)

Dentro de `careEpisodeApi` (junto a `getCareEpisodeVerifications`, estilo idéntico):

```ts
/** F-023 RF-1: GET /care-episodes → listado paginado del taller del contexto WORKSHOP (sin PII). */
listCareEpisodes: ({
  page = 1,
  limit = 20,
}: { page?: number; limit?: number } = {}) =>
  api
    .get("care-episodes", { searchParams: { page, limit } })
    .json<CareEpisodeListResponse>()
    .catch(toApiError),
```

Los headers de contexto (`X-Context-Type: WORKSHOP`, `X-Context-Id`) los inyecta el inyector existente (`injectActiveContextHeaders`), igual que para `verificaciones`. Sin cambios al inyector.

### 4.6 Helper D-071 y `STATUS_LABELS`: copia local, sin extraer

- **Helper D-071 (título fallback):** la lógica vive inline en `vehicle-history.ts:164-169` dentro del merge del timeline (no es una función exportada). Extraerla a un shared requeriría tocar `vehicle-history.ts` y su test (`vehicle-history.test.ts`) — riesgo de regresión del timeline (AC de regresión de F-023) por un beneficio de 2 consumidores. **Decisión:** copia local de las 3 líneas en la página. Deuda LOW registrada: extraer a `src/lib/care-episode-display.ts` cuando haya un 3er consumidor.
- **`STATUS_LABELS`:** copia local del mapa de 3 entradas (idéntico al detalle). Mismo criterio: no tocar el detalle por una copia trivial. Deuda LOW junto al punto anterior.

---

## 5. Puntos de atención / riesgos

### 5.1 Tests existentes evaluados (sin escritura nueva, restricción usuario)

| Test | Riesgo | Veredicto |
|---|---|---|
| `web-follow-app/src/app/(dashboard)/__test__/dashboard-layout.test.tsx` | El ítem "Atenciones" se agrega a `NAV_ITEMS_WORKSHOP`. | **No se rompe.** Verificado estáticamente: los tests assertean la *presencia* de links específicos ("Verificaciones", "Nueva atención", "Transferencias") y la *ausencia* en PERSONAL de "Verificaciones"/"Nueva atención"; ninguno cuenta links ni verifica orden ni ausencia de "Atenciones". El nav WORKSHOP condicional (isWorkshop) no cambia. |
| `web-follow-app/src/app/(dashboard)/atenciones/verificaciones/__test__/verificaciones-page.test.tsx` | Página gemela. | **No se rompe.** No se toca su componente ni su API. |
| `web-follow-app/src/lib/__test__/vehicle-history.test.ts` | Se copia (no extrae) la lógica D-071. | **No se rompe.** `vehicle-history.ts` no se modifica. |
| `web-follow-app/src/app/(dashboard)/vehicles/[id]/servicios/[servicioId]/__test__/care-episode-detail-page.test.tsx` | Se copia `STATUS_LABELS`. | **No se rompe.** El detalle no se modifica. |
| `api-follow-app` `care-episodes.controller.spec.ts` | Se agrega método `list` al controller. | **No se rompe.** Los specs usan reflection sobre guards de métodos *existentes* (`create`, `lookup`, `verify`…); agregar un método no altera los existentes ni el conteo de guards. |
| `api-follow-app` `list-verifications.handler.spec.ts` / `get-care-episode.handler.spec.ts` | Se agrega handler gemelo. | **No se rompe.** No se modifican. |

**Conclusión:** el cambio no rompe ningún test existente conocido. No se requiere corregir ninguno. (La regla de la spec §11 —"corregir un test roto por el cambio es mantenimiento, no implementar testing"— no se activa: no hay tests rotos.)

### 5.2 Riesgos reales identificados

1. **Roles de taller custom sin `care-episode.list` (D-TL-F023-2):** roles creados con `workshop.roles.create` no reciben el permiso nuevo por el upsert del seed (que solo toca roles `isSystem: true`). Sus miembros obtendrían `403` en el listado. *Mitigación:* documentado; elevado a Security (S-2, §6) para definir procedimiento de asignación (ops/seed extensivo o decisión de no soportar roles custom en MVP).
2. **Orden de declaración de rutas (F-012):** si `@Get()` raíz se declara después de `@Get(':id')`, Express igualmente no lo captura (raíz sin segmento), pero se declara antes por higiene y consistencia documental con el patrón del módulo. *Mitigación:* comentario F-012 en el código, espejo del existente.
3. **Volumen alto por taller (D-TL-F023-3):** la query ligera trae todas las filas del taller (aunque ligeras). Aceptado para el volumen inicial bajo (D-F023-1). *Evolución:* migrar a `$queryRaw` con `COALESCE` + `LIMIT/OFFSET` si el volumen lo justifica. Deuda consciente.
4. **`canonicalDate` pre-computado:** el backend lo resuelve; si en el futuro se exponen los campos crudos al frontend para otro consumo, habría que reconciliar (hoy solo lo consume esta vista).
5. **UX del `employee`:** verá "Atenciones" en el nav y recibirá `403` al entrar (estado de error). Consistente con "Verificaciones"/"Nueva atención" actuales; no es un patrón nuevo, pero QA debe verificar que el copy del estado de error sea comprensible (no un "acceso denied" crudo).

### 5.3 Verificación manual recomendada (checklist, spec §9 — sustituye tests diferidos)

- [ ] Miembro `owner` con contexto WORKSHOP → nav muestra "Atenciones" → clic → `/atenciones` lista episodios de **su** taller, ordenados por fecha canónica desc.
- [ ] Loading: spinner + `role="status"` "Cargando atenciones…" (sin lista vacía flash).
- [ ] Empty: "Todavía no hay atenciones registradas" + CTA "Registrar atención" → `/atenciones/nueva`.
- [ ] Error (5xx/red): `role="alert"` + "Reintentar" refetchea sin recargar.
- [ ] Contexto PERSONAL + URL directa a `/atenciones`: estado "seleccioná un taller" (nunca lista de otro taller ni blanco).
- [ ] Card click → `/vehicles/{vehicleId}/servicios/{servicioId}`.
- [ ] Episodio `cancelled`: título con "(cancelada)" + badge "Cancelado" (visible, no oculto).
- [ ] Episodio `source=owner`: badge "Registrado por el propietario"/"Verificado"; **sin** botón "Confirmar".
- [ ] Episodio `source=workshop` + `title=null`: título "Atención de taller".
- [ ] Payload de red (DevTools): **sin** nombre/email del propietario, `internalNotes`, `customerComplaint`.
- [ ] Nav sin contexto WORKSHOP: "Atenciones" no aparece.
- [ ] >20 episodios: total + Anterior/Siguiente (si `totalPages > 1`).
- [ ] Regresión: "Nueva atención", "Verificaciones", timeline del vehículo y detalle de atención operativos; highlight de nav **no** marca "Atenciones" dentro de `/atenciones/nueva` ni `/atenciones/verificaciones` (fix `isActive`).
- [ ] `npm run build` (backend y frontend) sin errores.
- [ ] Roles `owner`/`mechanic` pueden listar; `employee` recibe `403` (coherente con la exclusión de producto).

---

## 6. Abierto para Security / PM

Etiquetado explícito. Nada de esto bloquea el diseño; son confirmaciones/decisiones que corresponden a otros roles.

### Security

- **S-1 (confirmación):** ¿Confirmás que excluir `employee` del listado **a nivel API** (no solo de UI) es correcto? El diseño lo hace por permiso (`care-episode.list` solo en `owner`/`mechanic`), materializando la exclusión de producto de la spec §3. Si Security prefiere que `employee` lea (datos no-PII), se agrega el código a su matriz en el seed (cambio de 1 línea).
- **S-2 (procedimiento):** roles de taller **custom** (creados con `workshop.roles.create`) no recibirán `care-episode.list` automáticamente → 403 en el listado. ¿Procedimiento aceptable para MVP? Opciones: (a) aceptar y documentar (roles custom no soportan el listado en MVP); (b) instructivo ops para asignar el permiso; (c) extender el seed/upsert a roles custom con base en mechanic (más complejo). Recomendación del Tech Lead: (a) para MVP, con (b) como mitigación.
- **S-3 (confirmación):** el bypass de `super_admin` de `PermissionsGuard` queda acotado por `WorkshopOnlyGuard` (previo) + la exigencia de membresía activa del `ContextResolver` para tener contexto WORKSHOP. Un super_admin sin membresía en el taller no puede leerlo por este endpoint. ¿Confirmado como comportamiento deseado? (Es idéntico al resto del módulo.)

### PM

- **P-1 (solo si Security cambia S-1):** si se decide dar lectura a `employee`, ¿se muestra también la nav "Atenciones" solo a owner/mechanic (filtrado por permiso en el nav) o se mantiene visible para todos los miembros del taller (hoy el nav no filtra por permiso)? El diseño actual mantiene el nav sin filtrar (consistente con "Verificaciones"/"Nueva atención"); un filtrado por permiso sería un cambio de patrón de nav que requiere decisión de producto. **No escalar aún:** solo aplica si S-1 cambia.

---

*Fin del diseño técnico F-023 — listo para implementación tras aprobación.*
