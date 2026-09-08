Construyamos una especie de Architecture Decision Records (ADR) del proyecto. Cada documento representará una decisión importante y será la fuente de verdad tanto para nosotros como para Big Pickle y Mimo.

# Roadmap de Arquitectura

Yo lo dividiría así:

0.  Visión del producto
1.  Modelo de usuarios
2.  Active Context ⭐
3.  Autenticación
4.  Autorización
5.  Navegación
6.  Dashboards
7.  Workshops
8.  Vehículos
9.  Historia Clínica
10. Eventos
11. CQRS
12. Repository Pattern
13. Frontend State
14. Notificaciones
15. Roadmap MVP

Todo lo demás colgará de estos documentos.

## Empecemos por el Documento 01

No vamos a hablar de tablas ni de NestJS.

Vamos a definir el corazón del sistema.

## ADR-001 — Modelo de Usuario

### Objetivo

Definir qué representa un usuario dentro de la plataforma y cómo interactúa con los distintos contextos disponibles.

### Principio N°1

#### Existe un único tipo de usuario.

No existen:

Cliente
Mecánico
Dueño
Recepcionista
Administrador

Todos son simplemente:
User

### Principio N°2

#### Los permisos no pertenecen al usuario.

Los permisos pertenecen al contexto donde está trabajando.

Ejemplo

Dario

↓

Contexto Personal

↓

Puede administrar sus vehículos.

o

Dario

↓

Workshop A

↓

Role = Owner

o

Dario

↓

Workshop B

↓

Role = Mechanic

El usuario nunca cambia.

Sólo cambia el contexto.

### Principio N°3

#### Un usuario puede pertenecer a infinitos talleres.

Ejemplo

Dario

Workshop A

Owner

---

Workshop B

Mechanic

---

Workshop C

Receptionist

Todo simultáneamente.

### Principio N°4

#### Todo usuario posee automáticamente un contexto personal.

_No se crea._

_No se configura._

_Existe desde el momento del registro._

Ese contexto contiene:

vehículos propios
historial
documentos
recordatorios
gastos (si en el futuro los implementamos)
configuraciones

### Principio N°5

#### Los talleres son espacios independientes.

Cada taller tiene:

miembros
permisos
roles
sucursales
configuración
suscripción

Nunca se mezclan entre sí.

¿Qué es realmente un Contexto?

Acá quiero hacer una pequeña diferencia conceptual.

No es un rol.

No es un perfil.

No es un workspace.

Para nosotros un contexto será:

El ámbito operativo sobre el cual se ejecuta una acción.

Ejemplos

Personal
Workshop ABC
Workshop XYZ
Platform

Eso es un contexto.

Tipos de contexto

_Yo tendría únicamente tres._

1. PERSONAL - Siempre existe.

2. WORKSHOP - Uno por cada membresía.

3. PLATFORM - Sólo para administradores del sistema.

Nada más.

No agregaría ninguno más.

¿Qué cambia cuando cambia el contexto?

Todo.

Por ejemplo:

Sidebar

Personal

Mis vehículos

Mis documentos

Recordatorios

Configuración

Workshop

Dashboard

Clientes

Vehículos

Turnos

Órdenes

Presupuestos

Miembros

Reportes

Platform

Usuarios

Talleres

Planes

Catálogos

Logs

Eventos

Facturación

Soporte
Dashboard

Cada contexto posee un dashboard completamente distinto.

No compartimos widgets.

No mezclamos información.

Permisos

Los permisos siempre se evalúan sobre el contexto activo.

Nunca sobre el usuario.

Eso simplifica muchísimo los guards.

API

Todas las requests tendrán implícitamente un contexto.

Ejemplo conceptual:

User
↓

JWT

↓

Context Resolver

↓

Active Context

↓

Permission Resolver

↓

Use Case

Los casos de uso nunca preguntan:

¿es dueño?

Preguntan:

¿Qué permisos tiene este contexto?

### Persistencia del contexto

Acá hay varias opciones.

Opción A

Guardar el contexto activo en la base de datos.

No me gusta.

Hace más lenta la API.

Opción B

Guardar el contexto en Redis.

No me gusta para un MVP.

Opción C (la que recomiendo)

Guardar el contexto activo en el JWT o enviarlo explícitamente en cada request mediante un encabezado, por ejemplo:

Authorization: Bearer xxx

X-Context-Type: WORKSHOP
X-Context-Id: uuid

El backend valida que ese contexto pertenece al usuario autenticado y construye el CurrentContext.

No hay estado del lado del servidor.

Escala muy bien.

Lo único que cambiaría en el modelo actual

Sinceramente...

Casi nada.

Eso es una muy buena noticia.

Ya tenemos:

User
Workshop
WorkshopMember
WorkshopRole
SystemRole
VehicleOwnership

Lo único que agregaría es un objeto de dominio (no necesariamente una tabla) llamado:

CurrentContext

Con algo parecido a:

type CurrentContext =
| {
type: 'PERSONAL';
userId: string;
}
| {
type: 'WORKSHOP';
workshopId: string;
memberId: string;
roleId: string;
}
| {
type: 'PLATFORM';
systemRole: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
};

No se persiste.

Se construye en cada request.

---

## Decisión T1 — Identity vs User (2026-09-04)

**Problema:**
El dominio requiere separar conceptualmente la cuenta de autenticación (User) del actor real (Identity) que tiene relaciones históricas con vehículos, talleres y clientes. Hoy `User` cumple ambas funciones.

**Decisión:**
**Evolución progresiva, sin tabla Identity ahora.** `User` representa cuenta+actor para el MVP. No migrar ninguna FK a Identity en este ciclo.

**Criterio de activación:**
Solo migrar a Identity cuando (1) exista un caso real que requiera un actor sin cuenta, o (2) se modele Trust Profile/confianza por actor, o (3) se introduzca multi-tenancy que separe identidad del login.

**Candidatos a migración futura:**
`VehicleOwnership.userId`, `VehicleTransfer.fromUserId/toUserId`, `Appointment.customerId`, `WorkOrder.customerId`, `Estimate.customerId`.

**Impacto:** Sin cambios de schema, migración, módulos o API. Solo documentación ADR.

**Razón:** No agregar abstracción sin consumidor real. `User` satisface todas las necesidades del MVP. Evita riesgo de migración de decenas de FKs.
