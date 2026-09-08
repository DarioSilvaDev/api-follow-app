# AGENTS.md

# Historia Clínica Digital Vehicular

Este documento define las instrucciones, convenciones y contexto común que deben seguir los agentes de IA que trabajen sobre este repositorio.

El objetivo es que todos los agentes —PM, Tech Lead, Senior Backend, Senior Frontend, Database, QA, Security y otros— trabajen de manera coordinada, respetando las decisiones existentes y evitando decisiones contradictorias o arquitectura innecesariamente compleja.

---

# 1. Producto

El proyecto corresponde a una **Historia Clínica Digital Vehicular (HCDV)**.

El objetivo del producto es permitir registrar, consultar y gestionar de manera confiable la información histórica asociada a vehículos, especialmente la información relacionada con sus atenciones, servicios y mantenimiento.

El producto busca construir una historia vehicular confiable y trazable que pueda ser utilizada por propietarios, talleres y otros actores autorizados.

## 1.1 Modelo conceptual

El modelo conceptual del producto contempla conceptos como:

- Identity
- User / cuenta de autenticación
- Workspace / contexto de trabajo
- Active Context
- Vehicle
- Ownership
- Workshop
- CareEpisode
- Vehicle History
- Roles
- Permissions

Estos conceptos forman parte del modelo conceptual del producto, pero **no deben asumirse automáticamente como funcionalidades o módulos implementados**.

Los agentes deben distinguir siempre entre:

1. Concepto definido por el producto.
2. Arquitectura aprobada.
3. Funcionalidad actualmente implementada.

---

# 2. Conceptos importantes del dominio

## 2.1 Identity

**Identity no es lo mismo que User.**

Identity representa al actor real que participa en el sistema.

Un actor puede interactuar con el sistema desde diferentes contextos y puede tener distintas relaciones con vehículos, talleres u organizaciones.

User / cuenta de autenticación representa la capacidad de autenticarse en el sistema.

No asumir que toda regla relacionada con una persona debe resolverse directamente mediante User.

La separación entre Identity y autenticación debe respetarse cuando esté definida por la arquitectura o el modelo del producto.

---

## 2.2 Workspace

Un Workspace representa un contexto organizacional o de trabajo dentro del sistema.

Actualmente se contemplan conceptualmente contextos como:

- Personal
- Workshop
- Platform

No asumir que todos estos contextos están implementados.

Antes de agregar lógica relacionada con Workspace, revisar el modelo existente y las decisiones de arquitectura.

---

## 2.3 Active Context

El usuario puede operar dentro de un contexto activo.

El **Active Context** determina desde qué contexto está actuando el usuario, por ejemplo:

- contexto personal;
- contexto de taller;
- contexto administrativo/platform.

Las operaciones sensibles al contexto deben respetar esta separación.

No asumir que cambiar de contexto implica cambiar de identidad.

---

## 2.4 Vehicle

Vehicle representa al vehículo dentro del sistema.

El vehículo es una entidad central del producto y constituye el eje alrededor del cual se construye su historia.

No asumir mecanismos de identificación adicionales ni modificar las reglas de identidad del vehículo sin verificar primero el modelo existente y las decisiones del Product Blueprint.

---

## 2.5 Ownership

Ownership representa la relación histórica entre una Identity y un Vehicle.

Las relaciones de propiedad deben considerarse potencialmente históricas y no simplemente como un campo `ownerId` dentro de Vehicle.

No eliminar información histórica de ownership sin analizar explícitamente las consecuencias.

---

## 2.6 Workshop

Workshop representa un taller que participa dentro del ecosistema del producto.

Las operaciones realizadas desde un Workshop pueden estar condicionadas por:

- Workspace;
- usuario autenticado;
- Identity;
- roles;
- permissions;
- ownership;
- reglas de autorización.

No asumir que Workshop es equivalente a User.

---

## 2.7 CareEpisode

**CareEpisode** representa un registro histórico de una atención, servicio o intervención realizada sobre un vehículo.

Es un concepto central para la Historia Clínica Digital Vehicular.

Convenciones:

| Contexto      | Convención                         |
| ------------- | ---------------------------------- |
| Código        | `CareEpisode`                      |
| Base de datos | `care_episodes`                    |
| API / evento  | `CareEpisodeCreated`               |
| Interfaz      | `Atención` / `Ingreso de Servicio` |

CareEpisode no debe tratarse simplemente como un CRUD genérico de mantenimiento.

Representa información histórica que puede tener importancia para la trazabilidad y confiabilidad de la historia del vehículo.

No asumir que todo lo relacionado con mantenimiento debe convertirse automáticamente en un CareEpisode.

---

# 3. Diferenciar producto, arquitectura y código

Los agentes deben distinguir entre tres niveles:

## Product Blueprint

Define:

- qué problema resuelve el producto;
- qué funcionalidades existen;
- qué reglas funcionales se necesitan;
- qué actores participan;
- qué journeys deben soportarse;
- qué está dentro o fuera del alcance.

## ARCHITECTURE.md

Define:

- arquitectura técnica aprobada;
- patrones;
- límites entre módulos;
- decisiones estructurales;
- infraestructura;
- convenciones técnicas.

## Código existente

Representa el estado real actual del sistema.

Puede existir divergencia entre:

- Product Blueprint;
- ARCHITECTURE.md;
- código.

Cuando exista una discrepancia:

1. Detectarla.
2. No asumir automáticamente cuál está equivocada.
3. Documentar la discrepancia.
4. Escalar la decisión al agente correspondiente.

Nunca modificar silenciosamente la arquitectura o el producto para hacer coincidir una implementación.

---

# 4. No inventar

Los agentes no deben inventar:

- endpoints;
- modelos;
- campos;
- relaciones;
- permisos;
- roles;
- eventos;
- reglas de negocio;
- dependencias;
- variables de entorno;
- integraciones;
- comportamientos de librerías;
- funcionalidades;
- infraestructura.

Si una decisión no está definida:

- investigar primero;
- revisar código y documentación;
- verificar dependencias;
- identificar la incertidumbre.

Si continúa sin estar definida, utilizar:

**DECISIÓN DE PRODUCTO PENDIENTE**

cuando sea una decisión funcional o de negocio.

Cuando sea una decisión arquitectónica:

**DECISIÓN DE ARQUITECTURA PENDIENTE**

La decisión debe escalarse al PM o Tech Lead correspondiente.

---

# 5. Principio de comprender antes de modificar

Antes de implementar cambios relevantes, el agente debe:

1. Inspeccionar la estructura existente.
2. Identificar el módulo afectado.
3. Revisar código relacionado.
4. Revisar modelos Prisma.
5. Revisar módulos NestJS.
6. Revisar guards y permisos.
7. Revisar eventos existentes.
8. Revisar tests existentes.
9. Revisar documentación relacionada.
10. Determinar el impacto del cambio.

No implementar basándose únicamente en:

- el nombre de un archivo;
- una descripción superficial;
- una suposición sobre la arquitectura;
- patrones conocidos de otros proyectos.

El código existente es evidencia del comportamiento actual, no necesariamente evidencia de que ese comportamiento sea el diseño correcto.

---

# 6. MVP y control de complejidad

El proyecto debe priorizar el alcance aprobado del MVP.

Los agentes deben evitar implementar infraestructura o abstracciones especulativas simplemente porque podrían ser útiles en el futuro.

No introducir sin una decisión explícita del Tech Lead:

- microservicios;
- event sourcing;
- event store;
- Kafka;
- NATS;
- RabbitMQ;
- CQRS framework;
- `@nestjs/cqrs`;
- Keycloak;
- read replicas;
- sistemas distribuidos;
- outbox pattern;
- infraestructura de mensajería durable;
- sistemas de permisos excesivamente genéricos;
- abstracciones de dominio innecesarias;
- patrones arquitectónicos únicamente por formalismo.

Esto no significa que estas tecnologías nunca puedan utilizarse.

Significa que su incorporación debe responder a una necesidad real del producto o de la arquitectura y contar con una decisión explícita.

**Preferir la solución más simple que satisfaga correctamente el requisito actual.**

---

# 7. Arquitectura

La arquitectura actual es un:

**Modular Monolith con NestJS.**

No asumir microservicios.

Entry point:

`src/main.ts`

Módulo principal:

`src/app.module.ts`

`AppModule` es la fuente de verdad respecto de los módulos actualmente activos.

Los contextos/módulos actualmente identificados incluyen:

- Auth
- Users
- Vehicles
- Workshops
- Maintenance
- Administration
- Vehicle Catalog
- Dashboard

Esta lista representa el estado conocido del proyecto y debe verificarse contra `src/app.module.ts` y los archivos reales antes de realizar cambios.

No asumir que un módulo documentado existe realmente.

---

# 8. Organización del código

El código funcional se organiza principalmente en:

`src/modules/<context>/`

La infraestructura y primitives compartidas se encuentran en:

`src/common/`

Actualmente incluye conceptos como:

- Prisma;
- authorization guards;
- Cache;
- Storage;
- Mail;
- Logging;
- shared primitives.

`PrismaModule` es global.

No duplicar infraestructura compartida dentro de módulos cuando ya existe una abstracción común adecuada.

---

# 9. Backend baseline

Stack técnico actual:

- Node.js
- TypeScript
- NestJS
- Express
- Prisma
- PostgreSQL
- EventEmitter2
- Jest
- Docker

ORM:

**Prisma**

Base de datos:

**PostgreSQL**

Event bus interno:

**EventEmitter2 / @nestjs/event-emitter**

No introducir otra tecnología equivalente sin una justificación explícita.

---

# 10. Commands y Queries

El proyecto utiliza una separación conceptual ligera entre:

- Commands
- Queries

No utiliza `@nestjs/cqrs`.

Los handlers pueden exponer un método:

`execute()`

Los controllers pueden instanciar command classes siguiendo el patrón existente.

No introducir `@nestjs/cqrs` únicamente para formalizar esta separación.

La separación debe aportar claridad, no ceremonias innecesarias.

---

# 11. Repositories

Cuando corresponda utilizar Repository:

- mantener el repository dentro del módulo correspondiente;
- definir interfaces cuando exista una necesidad real de desacoplamiento;
- utilizar injection tokens;
- mantener las implementaciones concretas separadas de la lógica de aplicación.

Convención:

`*_REPOSITORY`

No crear repositories únicamente para envolver consultas Prisma triviales si el patrón existente no lo requiere.

Los handlers de lectura pueden utilizar `PrismaService` directamente cuando el patrón del módulo existente así lo establezca.

---

# 12. Business Logic

La lógica de negocio no debe quedar acoplada innecesariamente a:

- controllers;
- HTTP;
- Prisma;
- infraestructura;
- EventEmitter2;
- proveedores externos.

Los controllers deben concentrarse principalmente en:

- transporte HTTP;
- validación;
- autenticación;
- delegación;
- autorización;
- mapping de respuestas.

No aplicar automáticamente patrones DDD tácticos como:

- Aggregates;
- Value Objects;
- Domain Services;
- Factories;
- Domain Events;

salvo que exista una decisión explícita del Tech Lead.

El proyecto puede mantener separación de responsabilidades y lógica de negocio clara **sin adoptar DDD táctico**.

---

# 13. Base de datos

La persistencia utiliza:

**PostgreSQL + Prisma**

Antes de modificar el schema:

1. Revisar `schema.prisma`.
2. Revisar migraciones existentes.
3. Revisar relaciones.
4. Revisar constraints.
5. Revisar índices.
6. Revisar cómo utiliza el modelo el backend.
7. Evaluar impacto sobre datos existentes.
8. Evaluar impacto sobre APIs y frontend.

Las decisiones importantes de persistencia deben seguir las reglas definidas en `database.md`.

---

# 14. Convenciones de base de datos

Preferir:

- `snake_case` en base de datos;
- nombres camelCase en código cuando corresponda a las convenciones de Prisma;
- consistencia con modelos existentes.

No renombrar tablas, columnas o relaciones sin analizar el impacto.

Las restricciones de integridad deben utilizarse cuando corresponda:

- foreign keys;
- unique constraints;
- check constraints;
- not-null;
- relaciones correctamente definidas.

No utilizar JSON o arrays para representar información relacional cuando un modelo relacional sea más apropiado.

---

# 15. Migraciones

Después de cambios de schema:

### Desarrollo

```bash
npm run db:migrate
npm run db:generate
```

### Aplicar migraciones

```
npm run db:deploy
```

### Reset

```
npm run db:reset
```

db:reset puede destruir datos.

No ejecutar comandos destructivos salvo que sea explícitamente intencionado y autorizado.

Nunca asumir que la base de datos puede resetearse simplemente porque se está trabajando en desarrollo.

Antes de eliminar:

columnas;
tablas;
relaciones;
índices;
constraints;

verificar su uso real y las consecuencias sobre los datos.

16. Seed

Seed:

prisma/seed.ts

Comando:

npm run db:seed

Actualmente crea o actualiza información relacionada con:

Permissions
System roles
Vehicle catalog
Users
Workshops

El seed no debe asumirse como mínimo.

Requiere una base de datos correctamente migrada.

Cuando se agregue un nuevo permission, evaluar y actualizar el seed correspondiente.

17. API

Todas las rutas HTTP utilizan:

/api

Los contratos existentes deben preservarse salvo que exista una decisión explícita para modificarlos.

Antes de modificar una API:

Buscar consumidores.
Revisar DTOs.
Revisar frontend.
Revisar tests.
Revisar autorización.
Evaluar compatibilidad.

No exponer directamente modelos internos de persistencia cuando esto comprometa el contrato o encapsulamiento de la API.

18. Eventos

El sistema utiliza:

@nestjs/event-emitter

basado en EventEmitter2.

Los eventos de negocio deben emitirse desde handlers después de que el cambio de estado haya sido exitoso.

No emitir eventos de negocio desde implementaciones de Repository.

Antes de crear un nuevo evento:

Buscar eventos existentes.
Verificar si el evento ya existe.
Identificar consumidores.
Definir claramente qué hecho representa.
Definir su payload.
Determinar cuándo debe emitirse.
Emitirlo únicamente después del éxito de la operación.

Los eventos representan hechos significativos del negocio, no cada llamada de método.

19. Limitaciones de EventEmitter2

EventEmitter2 es un mecanismo:

in-process

No debe considerarse automáticamente:

durable;
persistente;
distribuido;
retryable;
transaccional;
resistente a reinicios.

Por lo tanto, no introducir automáticamente:

Outbox;
Event Store;
Kafka;
RabbitMQ;
NATS;
colas persistentes;

simplemente porque el sistema utiliza eventos.

Si el producto requiere garantías de entrega, persistencia o procesamiento distribuido, debe existir una decisión arquitectónica explícita.

20. Autenticación y autorización

Distinguir siempre:

Authentication ≠ Authorization

Authentication determina quién es el actor.

Authorization determina qué puede hacer dentro de un contexto determinado.

El sistema utiliza principalmente:

JwtAuthGuard;
WorkshopGuard;
PermissionsGuard;
@Permissions(...).

Las operaciones sensibles deben considerar:

Identity;
User/account;
Workspace;
Active Context;
Workshop;
roles;
permissions;
ownership;
scope de la operación.

Nunca confiar en que el frontend ocultará una funcionalidad para garantizar autorización.

El backend es la frontera final de enforcement.

21. Permisos

Al agregar un nuevo permission:

Definir una convención coherente.
Verificar permissions existentes.
Aplicar el mecanismo de autorización correspondiente.
Actualizar seed.
Revisar roles.
Agregar tests relevantes.

No crear nuevos roles o permissions sin una necesidad funcional clara.

No duplicar permisos existentes con nombres ligeramente diferentes.

22. Frontend

Antes de modificar frontend, inspeccionar:

framework;
routing;
component system;
state management;
HTTP client;
autenticación;
autorización;
permisos;
manejo de errores.

Reutilizar componentes existentes cuando sea apropiado.

Respetar contratos definidos por backend.

No resolver problemas de autorización únicamente mediante UI.

23. Security

Todo cambio relevante debe considerar:

authentication;
authorization;
ownership;
permissions;
input validation;
information exposure;
injection;
improper access;
file uploads;
storage;
tokens;
secrets;
logs;
datos sensibles.

Nunca:

confiar en el frontend;
desactivar guards para facilitar desarrollo;
hardcodear credenciales;
exponer secretos;
registrar tokens o credenciales en logs.

Security puede y debe ser consultado antes de implementar cambios que afecten:

autenticación;
autorización;
ownership;
storage;
archivos;
información sensible.

No debe considerarse únicamente una etapa final de revisión.

24. Storage

El proyecto utiliza infraestructura de almacenamiento basada en:

R2
B2

Antes de implementar almacenamiento:

Revisar la infraestructura existente.
Determinar qué storage corresponde.
Revisar políticas.
Revisar validaciones.
Revisar naming.
Revisar metadata.
Revisar eliminación.
Revisar seguridad.

No crear un nuevo cliente o abstracción de storage si ya existe una infraestructura común adecuada.

25. Testing

Actualmente no existe un directorio test/ con una suite versionada completa.

Esto constituye deuda técnica/oportunidad y no significa que una funcionalidad no necesite pruebas.

Las nuevas funcionalidades deben incorporar tests apropiados.

Priorizar:

business rules;
authorization;
validation;
edge cases;
error handling;
data integrity;
regressions;
repository behavior;
important event behavior.

Según el cambio, utilizar:

unit tests;
integration tests;
e2e tests.

No escribir tests únicamente para aumentar cobertura.

Los tests deben proteger comportamiento relevante.

26. Comandos del proyecto

Utilizar:

npm

y respetar el:

package-lock.json

Instalación
npm ci
Desarrollo
npm run start:dev
Build
npm run build

Actualmente no existe un script separado de typecheck.

Lint
npm run lint

IMPORTANTE:

El script utiliza ESLint con --fix y puede modificar archivos.

No ejecutar automáticamente si no es necesario.

Formato
npm run format

Puede modificar:

src/**/\*.ts
test/**/*.ts
Tests
npm test 27. Variables de entorno

La configuración se carga mediante:

src/config/envs.ts

.env se carga directamente y las variables se validan durante el startup.

Entre las variables requeridas actualmente se encuentran:

DATABASE_URL
JWT configuration
SMTP configuration
R2 storage configuration
B2 storage configuration

Nunca:

agregar secretos reales;
inventar valores de entorno;
commitear credenciales;
asumir que una variable existe sin verificar el código. 28. Context7 y documentación técnica

Para librerías y dependencias cuyo comportamiento pueda depender de versión, utilizar documentación compatible con la versión instalada.

Priorizar:

versión instalada;
documentación oficial compatible;
Context7;
conocimiento general.

Especialmente importante para:

NestJS;
Prisma;
PostgreSQL;
authentication;
testing;
storage;
SDKs;
APIs externas.

Context7 no reemplaza la inspección del código existente.

29. Fuente de verdad según el tipo de decisión

No existe una única fuente de verdad para todo.

Producto / negocio

Prioridad:

Product Blueprint
Acceptance Criteria
decisiones explícitas del PM
comportamiento implementado

El código no debe redefinir silenciosamente el producto.

Arquitectura

Prioridad:

decisiones explícitas del Tech Lead
ARCHITECTURE.md
patrones existentes aprobados
código existente

Una implementación existente no debe interpretarse automáticamente como una decisión arquitectónica correcta.

Estado actual del sistema

Para saber qué existe realmente:

código;
src/app.module.ts;
módulos NestJS;
Prisma schema;
tests;
documentación.

El código es la fuente principal del estado actual.

Dependencias

Prioridad:

versión instalada;
documentación oficial compatible;
Context7;
conocimiento general.

Nunca utilizar documentación correspondiente a otra versión sin verificar compatibilidad.

30. DDD

El proyecto no adopta DDD táctico como requisito arquitectónico del MVP.

Los agentes pueden utilizar conceptos de modelado de dominio cuando ayuden a razonar sobre el problema, pero no deben introducir automáticamente:

Aggregates;
Value Objects;
Domain Services;
Factories;
Repositories como abstracción obligatoria;
Domain Events;
bounded contexts formales;

si no existe una decisión explícita que lo justifique.

El objetivo es mantener:

separación de responsabilidades;
lógica de negocio clara;
módulos coherentes;
persistencia desacoplada cuando sea necesario;
APIs claras;
código testeable;

sin sobrearquitectura.

31. Responsabilidad y autoridad de los agentes

Cada agente tiene una responsabilidad principal.

PM

Responsable de:

producto;
alcance;
requirements;
user journeys;
acceptance criteria;
prioridades;
decisiones funcionales.

No implementa arquitectura ni código.

Tech Lead

Responsable de:

arquitectura;
decisiones técnicas;
contratos;
dependencias;
patrones;
riesgos;
coordinación;
revisión técnica.

No redefine unilateralmente el producto.

Backend

Responsable de:

NestJS;
APIs;
handlers;
business logic;
repositories;
Prisma usage;
integrations;
backend tests.
Database

Responsable de:

schema;
relations;
constraints;
indexes;
migrations;
persistence;
query performance;
data integrity.
Frontend

Responsable de:

UI;
UX;
components;
routing;
state;
forms;
API integration;
frontend tests.
QA

Responsable de:

test strategy;
acceptance criteria verification;
edge cases;
regressions;
integration;
E2E.
Security

Responsable de:

authentication;
authorization;
permissions;
ownership;
input security;
storage security;
information exposure;
secrets;
threat analysis. 32. Regla de escalamiento entre agentes

Un agente puede detectar problemas fuera de su área.

Puede recomendarlos, pero no debe implementar unilateralmente una decisión que corresponda a otro agente.

Ejemplos:

Backend detecta una ambigüedad de negocio

→ Escalar al PM.

Backend detecta una decisión arquitectónica

→ Escalar al Tech Lead.

Database detecta un problema de autorización

→ Documentar y escalar a Security / Tech Lead.

Frontend detecta una inconsistencia de API

→ Revisar contrato y escalar a Backend / Tech Lead según corresponda.

QA detecta una regla de negocio ambigua

→ Escalar al PM.

Security detecta un problema estructural de arquitectura

→ Escalar al Tech Lead.

Cualquier agente detecta una contradicción entre producto y código

→ No resolver silenciosamente.

33. Los agentes especializados no redefinen el producto

Los agentes técnicos pueden proponer soluciones.

No pueden cambiar unilateralmente:

alcance;
reglas de negocio;
user journeys;
actores;
permisos funcionales;
comportamiento esperado del producto.

Si una implementación parece difícil o costosa, eso no autoriza al agente a simplificar el requisito por su cuenta.

Debe indicarlo como:

DECISIÓN DE PRODUCTO PENDIENTE

y solicitar definición del PM.

34. Cambios de arquitectura

Requieren revisión del Tech Lead cuando involucren, entre otros:

nuevos módulos importantes;
nuevos patrones arquitectónicos;
nuevas infraestructuras;
nuevas dependencias estructurales;
cambios de autenticación;
cambios de autorización;
cambios de Identity;
cambios de Workspace;
cambios de Active Context;
cambios importantes de persistencia;
cambios importantes de eventos;
procesamiento distribuido;
cambios breaking de API.

Los agentes especializados pueden implementar decisiones ya aprobadas, pero no convertir una implementación local en una nueva arquitectura sin revisión.

35. Cambios de base de datos importantes

Requieren especial atención los cambios sobre:

Identity;
User;
Workspace;
authorization;
Vehicle;
Ownership;
CareEpisode;
historical records;
permissions;
roles.

Antes de realizarlos evaluar:

datos existentes;
relaciones;
constraints;
índices;
migración;
compatibilidad;
backend;
API;
frontend;
tests.

Nunca eliminar información histórica simplemente para simplificar el modelo.

36. Git

Realizar cambios pequeños y cohesivos.

Evitar mezclar:

features;
refactors;
formatting masivo;
dependency updates;
cambios arquitectónicos no relacionados.

No modificar historial salvo autorización explícita.

Nunca ejecutar sin autorización:

git reset --hard
git clean -fd

Evitar operaciones destructivas o irreversibles.

37. Workflow general

Para una funcionalidad significativa:

Requirement
↓
PM
↓
Acceptance Criteria
↓
Tech Lead
↓
Technical Design
↓
Backend / Frontend / Database
↓
QA
↓
Security
↓
Review
↓
Finalization

Security puede participar antes de QA cuando el cambio afecte:

auth;
authorization;
ownership;
storage;
sensitive data;
file handling.

El workflow no debe interpretarse como una secuencia rígida cuando una tarea pequeña no requiera todos los agentes.

38. Antes de implementar una feature

El agente debe poder responder, al menos conceptualmente:

¿Qué se necesita?
¿Por qué se necesita?
¿Qué módulo corresponde?
¿Existe algo reutilizable?
¿Qué entidades/modelos están involucrados?
¿Qué API está involucrada?
¿Qué permisos están involucrados?
¿Qué eventos están involucrados?
¿Requiere migración?
¿Qué tests necesita?
¿Qué riesgos existen?
¿Existe alguna decisión pendiente?

Si no puede responder estas preguntas, debe investigar antes de implementar.

No es necesario producir un documento formal para cada cambio pequeño, pero sí razonar sobre estos puntos.

39. Antes de finalizar un cambio

Verificar:

requirement satisfecho;
acceptance criteria;
arquitectura respetada;
código existente reutilizado cuando corresponde;
sin dependencias innecesarias;
autorización correcta;
validación correcta;
manejo de errores;
tests relevantes;
build;
migraciones;
seed si corresponde;
documentación si corresponde;
sin secretos;
sin cambios destructivos;
sin cambios arquitectónicos no aprobados. 40. Comunicación de cambios

Cuando un agente termine una implementación significativa, debe comunicar de forma concisa:

Implemented

Qué se implementó.

Technical Decisions

Qué decisiones técnicas se tomaron y por qué.

Tests

Qué verificaciones se realizaron.

Risks / Concerns

Qué riesgos o problemas quedaron identificados.

Tech Lead Attention

Qué decisiones requieren revisión del Tech Lead.

Cuando corresponda, incluir también:

Product Decision Pending

Qué definición funcional requiere intervención del PM.

41. Regla de oro

Primero entender. Después planificar. Luego implementar. Finalmente verificar.

Prioridad:

Correctitud >
Seguridad >
Coherencia arquitectónica >
Mantenibilidad >
Velocidad

La velocidad de implementación nunca justifica:

inventar reglas;
romper contratos;
saltarse autorización;
destruir datos;
introducir arquitectura innecesaria;
ocultar decisiones pendientes.

El objetivo no es que el agente simplemente produzca código.
El objetivo es que el agente contribuya a construir HCDV de forma correcta, segura, coherente y evolutiva, respetando las decisiones del producto y de la arquitectura.
