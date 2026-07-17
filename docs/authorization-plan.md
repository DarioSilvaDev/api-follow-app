# Plan de Autorización — RBAC + Permisos

## Stack

| Componente        | Tecnología                               |
| ----------------- | ---------------------------------------- |
| Framework         | NestJS 11                                |
| ORM               | Prisma 6                                 |
| Cache (fase 1)    | Map en memoria (TTL 5 min)               |
| Cache (fase 2)    | Redis (cuando se implemente)            |
| Autorización      | Permission-based (granular)              |
| Autenticación     | JWT (existente, no se modifica)          |

## Modelo de datos (ya existe en Prisma)

```
SystemRole (super_admin, admin, support, user)
  └── SystemRoleAssignment → User
  └── SystemRolePermission → Permission

WorkshopRole (admin, mechanic, ...)
  └── WorkshopMember → User + Workshop
  └── WorkshopRolePermission → Permission

Permission (module.resource.action → "member.invite")
```

## Flujo de autorización por request

```
Request
  → JwtAuthGuard (autenticación: ¿quién sos?)
  → WorkshopGuard (opcional: ¿sos miembro del taller?)
  → PermissionsGuard (autorización: ¿tenés el permiso?)
    → PermissionCache.get(userId)
      → cache hit → devuelve
      → cache miss → query DB → PermissionCache.set()
    → compara permisos del user vs required del @Permissions()
  → Handler
```

---

## Fase 1 — Infraestructura común (`src/common/`)

### 1.1 Tipos compartidos

**Archivo:** `src/common/types/auth.types.ts`

```ts
export interface CurrentUser {
  id: string;
  email: string;
}

export interface ResolvedPermissions {
  systemRoles: string[];
  workshopRoles: Record<string, string[]>; // workshopId → roleCodes[]
  permissions: Set<string>;                // códigos de permiso efectivos
}
```

### 1.2 PermissionCache (Map + TTL)

**Archivo:** `src/common/cache/permission-cache.ts`

- `Map<string, { data: ResolvedPermissions; expiresAt: number }>`
- TTL default: 5 minutos
- Métodos: `get(userId)`, `set(userId, data)`, `invalidate(userId)`, `clear()`
- Fácil de reemplazar por Redis en el futuro (misma interfaz)

### 1.3 Decorators

**`@Permissions()`** — `src/common/decorators/permissions.decorator.ts`

```ts
@Permissions('member.invite', 'member.remove')
```

Registra los permisos requeridos en metadata vía `SetMetadata`.

**`@CurrentUser()`** — `src/common/decorators/current-user.decorator.ts`

```ts
@Get()
async findAll(@CurrentUser() user: CurrentUser) { ... }
```

Extrae `req.user` con tipado.

### 1.4 Guards

**`PermissionsGuard`** — `src/common/guards/permissions.guard.ts`

- `CanActivate` global o por controller
- Lee `@Permissions()` del handler
- Si no hay `@Permissions()` → permite (solo autenticación)
- Si `@Permissions()` existe:
  1. Busca en `PermissionCache` los permisos del usuario
  2. Si cache miss: consulta DB → arma el set de permisos → guarda en cache
  3. Si el usuario tiene `super_admin` → bypass (todos los permisos)
  4. Verifica que todos los requeridos estén en el set

**`WorkshopGuard`** — `src/common/guards/workshop.guard.ts`

- Verifica que `req.user.id` tenga un `WorkshopMember` activo en el taller
- Toma `workshopId` de `req.params.id`
- Opcional: puede verificar un rol mínimo (según priority)

### 1.5 Módulo de autorización

**Archivo:** `src/common/authz.module.ts` (o dentro de `common/`)

- Provee `PermissionsGuard`, `WorkshopGuard`, `PermissionCache`
- `@Global()` para que esté disponible sin imports
- Alternativa: registrar los guards como providers en `AppModule`

---

## Fase 2 — Proteger módulo Workshops

### 2.1 Taller: permisos requeridos

| Endpoint | Permiso requerido | Guard |
|---|---|---|
| `PATCH /workshops/:id` | `workshop.update` | WorkshopGuard + PermissionsGuard |
| `POST /workshops/:id/branches` | `workshop.branch.create` | WorkshopGuard + PermissionsGuard |
| `POST /workshops/:id/invitations` | `member.invite` | WorkshopGuard + PermissionsGuard |
| `PATCH /workshops/:id/members/:memberId/role` | `member.role.update` | WorkshopGuard + PermissionsGuard |
| `DELETE /workshops/:id/members/:memberId` | `member.remove` | WorkshopGuard + PermissionsGuard |
| `POST /workshops/:id/branches/:branchId/hours` | `workshop.hours.set` | WorkshopGuard + PermissionsGuard |
| `GET /workshops/:id/members` | — (solo ser miembro) | WorkshopGuard |
| `GET /workshops/:id/invitations` | `member.invite` | WorkshopGuard + PermissionsGuard |

### 2.2 Creación de taller: asignar rol admin automáticamente

Ya existe en `PrismaWorkshopRepository.create()` — asigna `admin` al creador. Verificar que el rol `admin` tenga todos los permisos de gestión.

### 2.3 Seed de permisos

Agregar a la BD todos los permisos listados en `README.md`:

```
vehicle.read, vehicle.update, vehicle.transfer,
appointment.create, appointment.update, appointment.cancel,
estimate.create, estimate.approve,
workorder.create, workorder.close,
history.view, history.share,
member.invite, member.remove,
subscription.manage,
workshop.update, workshop.branch.create, workshop.hours.set,
member.role.update
```

---

## Fase 3 — Módulo `administration/`

### 3.1 Estructura

```
modules/administration/
├── commands/
│   ├── assign-system-role/
│   │   ├── assign-system-role.command.ts
│   │   └── assign-system-role.handler.ts
│   └── revoke-system-role/
│       ├── revoke-system-role.command.ts
│       └── revoke-system-role.handler.ts
├── controllers/
│   └── administration.controller.ts
├── dto/
│   ├── assign-system-role.dto.ts
│   ├── revoke-system-role.dto.ts
│   └── system-role-response.dto.ts
├── queries/
│   ├── list-users.handler.ts
│   └── list-system-roles.handler.ts
├── tokens.ts
└── administration.module.ts
```

### 3.2 Endpoints

| Método | Ruta | Permiso requerido | Descripción |
|---|---|---|---|
| `POST` | `/admin/roles/assign` | `admin.roles.assign` | Asignar SystemRole a un usuario |
| `DELETE` | `/admin/roles/revoke` | `admin.roles.revoke` | Revocar SystemRole |
| `GET` | `/admin/users` | `admin.users.list` | Listar usuarios con sus roles |
| `GET` | `/admin/roles` | `admin.roles.list` | Listar roles de sistema |

### 3.3 Seguridad

- Solo `super_admin` puede asignar/revocar cualquier rol
- `admin` puede listar usuarios pero no asignar `super_admin`
- `support` solo puede leer

---

## Fase 4 — Seed de datos iniciales

### 4.1 Permissions

Crear script `prisma/seed.ts` (o migración manual) que inserte todos los registros en `Permission`.

### 4.2 SystemRoles por defecto

| Rol | Priority | Permisos clave |
|---|---|---|
| `super_admin` | 100 | Todos (bypass en guard) |
| `admin` | 80 | `admin.users.list`, `admin.roles.list` |
| `support` | 60 | `admin.users.list` (solo lectura) |
| `user` | 0 | Ninguno de admin |

### 4.3 WorkshopRoles por defecto

Al crear un taller, crear automáticamente:

| Rol | Priority | Permisos |
|---|---|---|
| `admin` | 100 | Todos los del taller |
| `mechanic` | 50 | `vehicle.read`, `workorder.*`, `appointment.*` |
| `receptionist` | 30 | `appointment.*`, `estimate.*`, `vehicle.read` |
| `viewer` | 10 | `vehicle.read`, `history.view` |

### 4.4 Asignación initial

Al registrarse, el primer usuario de una cuenta nueva obtiene `SystemRole` = `user`.
Al crear un taller, el creador obtiene `WorkshopRole` = `admin`.

---

## Fase 5 — Redis (futuro)

Reemplazar `PermissionCache` (Map) por Redis:

```ts
// src/infrastructure/cache/redis-permission-cache.ts
export class RedisPermissionCache implements IPermissionCache {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
  async get(userId: string): Promise<ResolvedPermissions | null> {
    const raw = await this.redis.get(`perm:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }
  async set(userId: string, data: ResolvedPermissions, ttl = 300): Promise<void> {
    await this.redis.set(`perm:${userId}`, JSON.stringify(data), 'EX', ttl);
  }
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`perm:${userId}`);
  }
}
```

---

## Glosario de permisos completo

Basado en `README.md` + los necesarios para admin:

```
# Vehículos
vehicle.read
vehicle.update
vehicle.transfer
vehicle.documents.read
vehicle.documents.write
vehicle.history.read
vehicle.history.write
vehicle.photos.read
vehicle.photos.write
vehicle.share.create
vehicle.share.revoke

# Taller
workshop.update
workshop.branch.create
workshop.hours.set

# Miembros
member.invite
member.role.update
member.remove

# Turnos
appointment.create
appointment.update
appointment.cancel

# Presupuestos
estimate.create
estimate.approve

# Órdenes de trabajo
workorder.create
workorder.close

# Historial
history.view
history.share

# Suscripción
subscription.manage

# Administración (sistema)
admin.roles.assign
admin.roles.revoke
admin.roles.list
admin.users.list
```
