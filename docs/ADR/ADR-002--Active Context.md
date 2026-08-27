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
