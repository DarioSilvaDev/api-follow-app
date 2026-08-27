ADR-003 — Authorization & Permission Engine
El problema

La mayoría de las aplicaciones hacen esto:

if (user.role === 'OWNER') { ... }

if (user.role === 'ADMIN') { ... }

if (user.permissions.includes('vehicle.create')) { ... }

Después de 6 meses aparecen cientos de if.

Después aparecen excepciones.

Después aparecen hacks.

Y termina siendo imposible entender por qué un usuario puede hacer algo.

Quiero evitar eso desde el primer día.

Nuestra filosofía

El sistema nunca pregunta:

¿Quién sos?

Pregunta:

¿Qué podés hacer en este contexto?

Ese cambio es enorme.

Los permisos no pertenecen al usuario

Pertenecen al Contexto Activo.

Por ejemplo:

Usuario

↓

Contexto

↓

Capabilities

↓

Caso de uso

No:

Usuario

↓

Roles

↓

If

↓

Caso de uso
Las tres capas de autorización

En nuestro sistema existen tres niveles.

Nivel 1 — Plataforma

Define si puede administrar la plataforma.

Ejemplo

SUPER_ADMIN

ADMIN

SUPPORT

USER

Estos jamás afectan al taller.

Nivel 2 — Taller

Define qué puede hacer dentro de un taller.

Ejemplo

Owner

Manager

Mechanic

Receptionist

Viewer
Nivel 3 — Plan

Esta capa me parece una de las más interesantes.

No otorga permisos.

Habilita funcionalidades.

Ejemplo:

Plan Starter

✔ Vehículos

✔ Turnos

✔ Presupuestos

✘ API

✘ Integraciones

✘ Inventario

Owner y Mechanic pueden tener permiso para usar Inventario...

Pero si el plan no lo incluye...

No existe.

Entonces...

Creo que deberíamos separar dos conceptos que hoy están mezclados en muchas aplicaciones.

Authorization

¿Qué puede hacer el usuario?

Ejemplo

vehicle.update
Feature Availability

¿La plataforma ofrece esa funcionalidad?

Ejemplo

inventory.enabled

Son dos cosas distintas.

Hoy nuestro modelo tiene
Permission

y

PlanPermission

Yo cambiaría ligeramente el enfoque.

No llamaría a eso PlanPermission.

Lo llamaría:

Feature

Porque realmente describe una capacidad del producto, no un permiso de seguridad.

Por ejemplo:

appointments

work_orders

inventory

analytics

public_profile

online_booking

api

qr_history

ai_diagnostics

Luego un plan habilita Features.

Y los Roles conceden Permisos.

Eso separa muy bien el negocio de la seguridad.

¿Implica cambiar la base de datos?

No necesariamente para el MVP.

Podemos mantener PlanPermission como está y tratarlo internamente como un catálogo de features. Si más adelante vemos que conviene renombrarlo a Feature y PlanFeature, la migración será sencilla. Lo importante hoy es separar el concepto, aunque la tabla conserve el nombre.

El motor

Yo diseñaría un componente llamado

AuthorizationEngine

Su única responsabilidad:

Construir las capacidades del contexto.

Ejemplo.

CurrentContext

↓

Role

↓

Permissions

↓

Plan

↓

Features

↓

Capabilities

Devuelve algo parecido a:

{
permissions: [

        'vehicle.create',

        'vehicle.update',

        'appointment.create'

    ],

    features: [

        'inventory',

        'appointments',

        'reports'

    ]

}
Entonces un Guard

No pregunta:

¿es Owner?

Pregunta:

¿tiene vehicle.update?

Y el caso de uso

Ni siquiera pregunta permisos.

Simplemente ejecuta.

Porque el Guard ya hizo el trabajo.

¿Y las reglas de negocio?

Acá aparece algo muy importante.

Supongamos.

Mechanic

Tiene permiso para editar una orden.

Pero solamente si:

está asignado
la orden está abierta

Eso no es autorización.

Eso es negocio.

Entonces:

Guard

↓

Permiso OK

↓

Use Case

↓

Valida reglas

↓

Ejecuta

Nunca mezclaría esas dos cosas.

El resultado final

Me gustaría que cualquier módulo del sistema funcione así:

Request

↓

Authentication

↓

Current Context

↓

Authorization Engine

↓

Guards

↓

Command

↓

Domain Rules

↓

Repository

Todos.

Sin excepción.

Eventos

Cuando algo cambia

Role Updated

↓

Authorization Cache Invalidated
Plan Changed

↓

Authorization Cache Invalidated
Workshop Member Removed

↓

Authorization Cache Invalidated
Lo que cambiaría respecto al modelo actual

Hay una decisión que me gustaría tomar ahora porque todavía estamos a tiempo.

Separar Permission de Feature

Hoy en tu esquema ambas ideas viven indirectamente bajo Permission y PlanPermission.

Creo que a largo plazo vamos a tener funcionalidades que no tienen sentido como permiso de seguridad.

Ejemplos:

IA para diagnóstico.
Portal público del taller.
API pública.
WhatsApp Business.
Integración con Mercado Pago.
Exportación avanzada.
Reportes BI.

No son acciones como vehicle.update.

Son módulos del producto.

Yo los modelaría aparte.

Por ejemplo:

Feature
PlanFeature

Y dejaría Permission exclusivamente para operaciones sobre recursos (vehicle.create, work_order.close, appointment.cancel, etc.).

Una propuesta para simplificar aún más los permisos

Después de revisar varias implementaciones de RBAC y de mirar nuevamente tu modelo, hay una idea que creo que puede convertirse en uno de los diferenciales técnicos del proyecto.

En lugar de definir permisos únicamente por módulo/recurso/acción, agregaría una cuarta dimensión: Scope.

Por ejemplo:

vehicle.read:self
vehicle.read:any

work_order.update:assigned
work_order.update:any

member.manage:branch
member.manage:workshop

Con esto evitamos crear decenas de permisos casi idénticos y ganamos mucha expresividad.

El AuthorizationEngine seguiría resolviendo qué permisos tiene el contexto, mientras que una Policy (o el propio caso de uso cuando corresponda) interpretaría el alcance (self, assigned, branch, workshop, any).

No lo implementaría en el primer sprint del MVP, pero sí dejaría el diseño preparado porque encaja muy bien con la visión de una plataforma donde un mismo usuario puede ser propietario en un taller, mecánico en otro y propietario de vehículos en su contexto personal. Cuando lleguemos a módulos como Órdenes de Trabajo, Inventario o Garantías, ese concepto de scope nos va a dar mucha flexibilidad sin multiplicar la cantidad de permisos.
