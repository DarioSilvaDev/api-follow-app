ADR-002 — Active Context

Este documento ya no habla del negocio.

Habla de cómo funciona el motor del sistema.

Objetivos

El Active Context debe resolver cuatro problemas:

1.

Saber desde qué "espacio" está trabajando el usuario.

Ejemplo

Personal

o

Workshop A 2.

Resolver los permisos.

No preguntar:

¿Es Owner?

Sino

¿Qué permisos tiene el contexto actual?

3.

Evitar consultas innecesarias.

No queremos hacer:

SELECT WorkshopMember

SELECT WorkshopRole

SELECT Permissions

SELECT Subscription

...

en cada request.

4.

Reflejar cambios administrativos inmediatamente.

Si un Super Admin elimina un permiso:

La próxima request debe enterarse.

Arquitectura propuesta
Request
│
│
Authorization JWT
│
▼
Authentication Guard
│
▼
Context Guard
│
lee X-Context-Type
lee X-Context-Id
│
▼
Context Resolver
│
┌───────┴────────┐
│ │
▼ ▼
Session Context Cache DB
│ │
└───────┬────────┘
▼
CurrentContext
│
▼
Permission Resolver
│
▼
Command / Query
El CurrentContext

Quiero que esta sea una de las piezas más importantes del proyecto.

No es una entidad.

No es una tabla.

No es un DTO.

Es un objeto construido para cada request.

Conceptualmente:

interface CurrentContext {

type: PERSONAL | WORKSHOP | PLATFORM;

userId: string;

workshopId?: string;

memberId?: string;

branchId?: string;

roleId?: string;

permissions: PermissionCode[];

}

Todos los módulos recibirán esto.

Nunca recibirán:

User
¿Dónde vive?

Yo crearía un módulo completamente independiente.

src

common

context

Dentro:

context

├── guards
│ context.guard.ts
│
├── decorators
│ current-context.decorator.ts
│
├── services
│ context-resolver.service.ts
│
├── cache
│ context-cache.service.ts
│
├── interfaces
│ current-context.interface.ts
│
└── context.module.ts

No depende de ningún módulo funcional.

Todos dependen de él.

Context Cache

Acá quiero hacer una pequeña diferencia.

No quiero cachear usuarios.

No quiero cachear JWT.

Quiero cachear únicamente el resultado de resolver el contexto.

La clave podría ser algo como:

userId +
contextType +
contextId

Ejemplo

user-1

WORKSHOP

workshop-7

↓

Devuelve

CurrentContext
TTL

No pondría un TTL largo.

Algo como:

5 minutos

Y además invalidación por eventos.

Invalidación

Acá entra en juego el EventEmitter.

Ejemplos:

WorkshopMemberRemoved

↓

ContextCacheInvalidated
WorkshopRoleChanged

↓

ContextCacheInvalidated
PlanChanged

↓

ContextCacheInvalidated
SubscriptionSuspended

↓

ContextCacheInvalidated
El frontend

Acá también quiero dejar una regla.

El frontend nunca guarda permisos.

Nunca.

Solo guarda:

Active Context

Ejemplo

{
"type": "WORKSHOP",
"id": "uuid"
}

Nada más.

¿Dónde guardar el contexto seleccionado?

Acá sí soy partidario de persistirlo del lado del cliente.

Por ejemplo:

LocalStorage

o

IndexedDB

¿Por qué?

Porque el usuario espera abrir la aplicación y seguir donde estaba.

El login

Después del login el backend debería devolver algo similar a esto:

{
"user": {...},

"availableContexts": [

      {
          "type":"PERSONAL"
      },

      {
          "type":"WORKSHOP",
          "id":"...",
          "name":"Taller Central",
          "role":"OWNER"
      },

      {
          "type":"WORKSHOP",
          "id":"...",
          "name":"Lubricentro Norte",
          "role":"MECHANIC"
      }

]
}

No devuelve permisos.

No devuelve menús.

Sólo contextos disponibles.

Mi única mejora al modelo de datos

Revisando nuevamente tu workshop.sql, hay un punto donde creo que podemos mejorar el diseño.

Hoy WorkshopMember tiene un defaultBranchId.

Eso está muy bien.

Pero un miembro puede trabajar en varias sucursales.

Por ejemplo:

Pedro

↓

Casa Central

Lunes

Martes

Miércoles

↓

Sucursal Norte

Jueves

Viernes

Con el modelo actual, solo puede tener una sucursal por defecto.

Yo no eliminaría defaultBranchId, porque sirve para la UX, pero agregaría una relación de asignación.

Por ejemplo:

WorkshopMemberBranch

memberId

branchId

isDefault

joinedAt

Así:

un recepcionista puede atender en dos sucursales,
un mecánico puede rotar entre talleres,
y el contexto activo puede incluir también la sucursal seleccionada cuando sea necesario.

No es imprescindible para el MVP, pero el modelo queda preparado para crecer sin romper nada.

---

## Decisión T2 — Implementación de Active Context (2026-09-04)

**Problema:**
La autorización es inconsistente e incorrecta. `PermissionsGuard` y `WorkshopGuard` infieren `workshopId` desde `request.params.id` (heurística frágil). Vehicles, Maintenance y Dashboard usan solo `JwtAuthGuard` sin verificación de contexto ni permisos (alto riesgo de IDOR).

**Decisión:**
Implementar contexto explícito en `src/common/context/`:

- **`CurrentContext`**: interface TS (no tabla), no persistida.
- **`ContextModule`**: guards, decorator, resolver, cache.
- **`@CurrentContext()`**: decorator para inyectar contexto en handlers.
- **`ContextResolver`**: fuente **conmutable** (headers `X-Context-*` como opción principal, claims JWT como alternativa, derivación del path como fallback de compatibilidad).
- Migrar `PermissionsGuard`/`WorkshopGuard` para leer `request.context` en lugar de `params.id`.
- Endurecimiento por fases: Maintenance primero (cerrar IDOR), luego Vehicles, luego Dashboard.

**Mecanismo HTTP:** Se decide en fase de contrato frontend. El resolver lo hace conmutable.

**Secuencia:**
1. Fase A: `ContextModule`, `CurrentContext`, `ContextResolver`, `ContextGuard`, decorator.
2. Fase B: Migrar guards existentes con compatibilidad.
3. Fase C: Endurecimiento por módulo.
4. Fase D: Invalidación de cache por eventos.

**Impacto:** `src/common/context/*` nuevo; `PermissionsGuard`/`WorkshopGuard` modificados; `auth.types.ts` ampliado; endpoints de Maintenance/Vehicles/Dashboard afectados en fases.

**Razón:** Autorización inconsistente es riesgo crítico (IDOR en Maintenance). Mecanismo conmutable evita quedar atrapados en un contrato HTTP rígido.

---

## Estado de implementación (2026-09-04)

**Fase A completada** — Fundación del ContextModule:

- `src/common/context/` creado con estructura:
  - `interfaces/current-context.interface.ts` — `CurrentContext`, `ContextType`, `PersonalContext`, `WorkshopContext`, `PlatformContext`
  - `services/context-resolver.service.ts` — `ContextResolver` (fuente conmutable headers `X-Context-*` → path fallback → PERSONAL)
  - `guards/context.guard.ts` — `ContextGuard` (resuelve y coloca `request.context`)
  - `decorators/current-context.decorator.ts` — `@ActiveContext()` (inyecta el contexto en handlers)
  - `context.module.ts` — `ContextModule` con providers/exports
  - `index.ts` — barrel export
- `AuthorizationModule` ahora importa y exporta `ContextModule`.
- `PermissionsGuard` y `WorkshopGuard` migrados para leer `request.context` con fallback a `params.id` (compatibilidad).
- **Build exitoso.**

**Fase B pendiente** — Migrar controllers a usar `@ActiveContext()`. Aún se usa `@CurrentUser()` y `params.id` directo en handlers.
**Fase C pendiente** — Endurecer Maintenance (cerrar IDOR), Vehicles, Dashboard.
**Fase D pendiente** — Invalidación de cache de contexto por eventos.

---

## Actualización 2026-09-04 — Fases B y C completadas

**Fase B** — Controllers migrados a `@ActiveContext()`:
- maintenance, vehicles, dashboard: `@UseGuards(JwtAuthGuard, ContextGuard)` + `@ActiveContext()` en handlers clave.

**Fase C** — Autorización endurecida (IDOR cerrado):
- **maintenance:** todos los endpoints validan pertenencia al workshop del contexto. Permisos aplicados: `appointment.update`, `appointment.cancel`, `workorder.close`, `estimate.approve`.
- **vehicles:** helper `assertVehicleAccess()` en el controller (ownership activo OR VehicleAccess no revocado OR super_admin). Aplicado a ~16 endpoints.
- **delete-vehicle:** soft-delete según ADR-005 (si hay historia → `deletedAt`; si no → delete físico).
- Build + typecheck OK.

**Fase D** — Pendiente: invalidación de cache de contexto por eventos.

## Escalaciones de Fase C (requieren decisión)

1. **Permisos `vehicle.*` no aplicados:** `PermissionsGuard` no evalúa `VehicleAccessPermission`. Los permisos `vehicle.read/update/photos/documents/history.share` existen en seed pero no se enforcean. Si deben aplicarse por vehículo, `PermissionsGuard` o un guard vehicular necesita extensión. **DECISIÓN DE ARQUITECTURA.**
2. **TOCTOU en escrituras:** la pertenencia se valida en controller (fetch → compare), luego update por `id`. Alternativa más estricta: scope de escritura por `workshopId` en repository. **DECISIÓN DE ARQUITECTURA.**
3. **Reads de maintenance sin permiso:** `GET /appointments/:id`, `GET /work-orders/:id` accesibles desde PERSONAL y WORKSHOP sin permiso de lectura. Confirmar si `history.view` debe gatearlos. **DECISIÓN DE PRODUCTO.**
