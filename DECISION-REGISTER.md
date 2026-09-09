# HCDV — Decision Register

> Registro único de decisiones de producto, dominio, arquitectura y UX que condicionan la evolución de Historia Clínica Digital Vehicular (HCDV).

**Estado del documento:** Activo
**Última actualización:** 2026-09-04
**Producto:** Historia Clínica Digital Vehicular (HCDV)
**Alcance:** MVP y decisiones estructurales que condicionan su evolución

---

## 1. Propósito

Este documento mantiene el registro oficial de decisiones que afectan:

- producto y journeys;
- modelo funcional;
- dominio;
- arquitectura;
- persistencia;
- autenticación y autorización;
- contratos Backend ↔ Frontend;
- seguridad;
- evolución futura del sistema.

Su objetivo es evitar que decisiones importantes queden implícitas en código, documentación aislada o conversaciones entre agentes.

Una decisión registrada aquí debe ser considerada **fuente de verdad** para los agentes de desarrollo, salvo que exista posteriormente una decisión explícita que la modifique o superseda.

---

# 2. Estados

| Estado       | Significado                                          |
| ------------ | ---------------------------------------------------- |
| `PROPOSED`   | Propuesta inicial pendiente de evaluación            |
| `PENDING`    | Requiere una decisión adicional antes de implementar |
| `ACCEPTED`   | Decisión aprobada y aplicable                        |
| `REJECTED`   | Decisión explícitamente descartada                   |
| `SUPERSEDED` | Fue reemplazada por una decisión posterior           |

### Regla fundamental

Los agentes **NO deben implementar silenciosamente una decisión `PENDING`**.

Si una implementación requiere resolver una decisión pendiente, el agente debe:

1. identificar la decisión;
2. explicar por qué bloquea el trabajo;
3. proponer una resolución;
4. esperar aprobación cuando corresponda.

---

# 3. Jerarquía de fuentes de verdad

En caso de contradicción, utilizar el siguiente orden:

1. Decisiones `ACCEPTED` de este documento.
2. ADRs aceptados.
3. Product Blueprint / especificación funcional vigente.
4. Baselines técnicos.
5. Documentación de agentes.
6. Código existente.
7. Suposiciones o convenciones.

El código existente **no prevalece automáticamente** sobre una decisión aceptada.

Cuando el código contradiga una decisión aceptada, debe considerarse legacy, bug o deuda técnica hasta determinar lo contrario.

---

# 4. Principios transversales

## 4.1 MVP pragmático

El MVP debe priorizar:

- claridad funcional;
- seguridad;
- consistencia de datos;
- mantenibilidad;
- velocidad de evolución.

No se introducen abstracciones o patrones únicamente por anticipación de necesidades futuras.

---

## 4.2 Modular Monolith

El backend del MVP utiliza un **modular monolith**.

No se introducen microservicios, brokers o comunicación distribuida salvo decisión explícita posterior.

---

## 4.3 DDD no es requisito del MVP

El MVP no adopta DDD táctico como metodología obligatoria.

Se pueden utilizar conceptos de dominio cuando aporten claridad, pero no deben introducirse:

- aggregates artificiales;
- value objects innecesarios;
- domain events complejos;
- bounded contexts formales;
- capas adicionales sin beneficio concreto.

---

## 4.4 Historial como información protegida

La información histórica del vehículo debe preservarse.

Las relaciones históricas importantes utilizan `RESTRICT` cuando corresponde, evitando que eliminar una entidad actual destruya o invalide artificialmente el historial.

---

# 5. Registro de decisiones

## D-001 — Estrategia de autenticación

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Security
**Prioridad:** P0

### Decisión

Para clientes web/browser, HCDV utilizará **HttpOnly Cookies** como mecanismo oficial de autenticación.

El backend mantiene soporte para:

- `access_token` mediante cookie HttpOnly;
- `refresh_token` mediante cookie HttpOnly;
- Bearer tokens para clientes no-browser que explícitamente los necesiten.

### Regla

El frontend web oficial **no debe administrar tokens de acceso mediante JavaScript**.

El flujo browser utiliza:

```text
Browser
   ↓
HttpOnly Cookies
   ↓
NestJS API
   ↓
JWT authentication
```

NextAuth puede utilizarse como mecanismo de integración de sesión del frontend, pero **no reemplaza la autoridad de autenticación del backend**.

### Bearer

Bearer no queda eliminado del sistema.

Su uso queda destinado a:

- clientes machine-to-machine;
- integraciones;
- testing;
- futuros clientes no-browser;
- otros consumidores explícitamente autorizados.

No debe utilizarse como mecanismo alternativo implícito para el frontend web.

### Implicaciones

Backend:

- mantener rotación de refresh tokens;
- mantener detección de reuse;
- revisar configuración de cookies;
- corregir CORS;
- activar protección contra abuso en login/refresh;
- eliminar configuración JWT obsoleta.

Frontend:

- utilizar `credentials: include`;
- no almacenar access/refresh tokens en `localStorage`;
- mantener refresh automático;
- documentar correctamente el flujo real.

### Seguridad

SameSite ayuda a mitigar CSRF, pero no debe considerarse la única protección.

La configuración final debe contemplar:

- CORS explícito;
- validación de `Origin`/mecanismo equivalente cuando corresponda;
- política correcta de cookies;
- protección específica de endpoints sensibles.

---

# D-002 — Fuente de verdad para `isVehicleOwner`

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization / UX
**Prioridad:** P0

### Decisión

La propiedad de un vehículo se determina exclusivamente a partir de **VehicleOwnership**.

No debe inferirse mediante:

```text
role === "user"
AND
workshopMemberships.length === 0
```

ni mediante cualquier combinación equivalente de roles, memberships o heurísticas de frontend.

### Regla

`VehicleOwnership` es la fuente de verdad.

El frontend puede utilizar un flag derivado como:

```text
isVehicleOwner
```

cuando sea útil para UX, pero dicho flag es una **proyección**, no una fuente de autorización.

### Autorización

Las operaciones sobre un vehículo deben evaluarse utilizando las relaciones reales:

```text
VehicleOwnership
VehicleAccess
WorkshopMembership
Platform permissions
Active Context
```

según corresponda.

### `/auth/me`

El contrato de `/auth/me` puede exponer información derivada útil para la sesión, pero **no se obliga a incluir la lista completa de vehículos/ownerships del usuario**.

La información vehicle-specific debe obtenerse desde los recursos correspondientes.

Por lo tanto:

- `/auth/me` representa capacidades/contexto de sesión;
- Vehicle endpoints representan ownership/access concreto.

### Regla de seguridad

El frontend nunca debe utilizar `isVehicleOwner` como mecanismo de autorización.

La autorización definitiva ocurre en backend.

### Amendment 1 — Contrato de sesión (2026-09-04)

`GET /auth/me` expone:

```text
isVehicleOwner: boolean
```

como campo **requerido** del contrato, proyección derivada de la existencia de al menos un `VehicleOwnership` activo (`endsAt: null`), de cualquier tipo (`owner`, `co_owner`, `company`).

Reglas:

- Es proyección de UX/routing únicamente; **nunca** autorización.
- `VehicleAccess` **no** alimenta el flag (sigue siendo ownership-based exclusivamente).
- No se agrega a la sesión NextAuth (sesión permanece lean).
- Es **context-independiente**: verdadero aunque el Active Context sea WORKSHOP.
- Evolución del contrato aditiva únicamente. `ownershipCount`/`ownershipIds` no se exponen por ahora (aditivo futuro si mobile lo requiere).
- `co_owner`/`company` alimentan el flag; los **derechos** de co-owner quedan sujetos a D-018 sin alterar necesariamente la proyección.

---

# D-003 — Identity vs User

**Estado:** `ACCEPTED`
**Tipo:** Domain / Architecture
**Prioridad:** P0

### Decisión

El MVP **NO introduce una entidad `Identity` separada**.

Se ratifica la decisión conceptual de ADR-001 T1:

> Durante el MVP, `User` representa tanto la cuenta autenticada como el actor del sistema.

### Implicaciones

No se migrarán relaciones actuales desde `User` hacia una entidad `Identity`.

No se agregará una abstracción paralela únicamente para anticipar escenarios futuros.

Las relaciones actuales continuarán utilizando `User` donde corresponda.

### Separación conceptual

Aunque no exista una tabla `Identity`, conceptualmente deben distinguirse:

```text
Authentication
    ↓
User / Account
    ↓
Actor
```

Esta separación conceptual permite evolucionar posteriormente sin forzar al MVP a implementar el modelo completo.

### Triggers para introducir Identity

La decisión deberá revisarse cuando aparezca una necesidad real como:

- actores sin cuenta;
- representación de organizaciones como actores;
- perfiles de confianza independientes de cuentas;
- integración multi-tenant más compleja;
- actores externos/API;
- relaciones históricas que no correspondan exclusivamente a usuarios registrados.

Hasta entonces, `Identity` permanece como concepto futuro.

---

# D-004 — Active Context

**Estado:** `PENDING`
**Tipo:** Architecture / Authorization / Product
**Prioridad:** P0

### Decisión parcial aceptada

El concepto de **Active Context** es válido y debe formar parte del modelo de autorización y resolución de recursos.

Sin embargo, la semántica funcional definitiva todavía depende de resolver D-019 y D-021.

### Principio

Active Context es una **dimensión/input para autorización y resolución de recursos**.

No es, por sí mismo, un sistema de autorización.

Ejemplo:

```text
Authorization
    +
Active Context
    +
Resource
    ↓
Decision
```

### Contextos previstos

```text
PERSONAL
WORKSHOP
PLATFORM
```

Un contexto puede tener un identificador asociado:

```text
X-Context-Type: WORKSHOP
X-Context-Id: workshop-id
```

### Reglas preliminares

- El contexto explícito tiene prioridad sobre inferencias.
- Un `WORKSHOP` debe corresponder a un Workshop Membership válido.
- `PLATFORM` requiere privilegios de plataforma.
- `PERSONAL` representa el ámbito personal del usuario.
- Un contexto inválido no debe degradarse silenciosamente a otro contexto.

### Pendientes

D-019 define qué significa consultar vehículos bajo `WORKSHOP`.

D-021 define la relación entre contexto de sesión, navegación y URL.

Por lo tanto, **no implementar todavía el modelo frontend definitivo de Active Context** hasta cerrar esas decisiones.

---

# D-005 — CareEpisode

**Estado:** `PENDING`
**Tipo:** Domain / Product / Architecture
**Prioridad:** P0

### Decisión conceptual

Se acepta la existencia de **CareEpisode** como una entidad nueva y central del dominio.

No se trata de renombrar `ServiceRecord`.

Modelo conceptual:

```text
Vehicle
   │
   └── CareEpisode
          ├── Diagnosis
          ├── Estimate
          ├── WorkOrder
          └── ServiceRecord
```

### Semántica

Un `CareEpisode` representa una instancia concreta de atención de un vehículo.

Puede originarse mediante:

- Appointment;
- walk-in;
- otra entrada explícitamente definida por el producto.

El episodio comienza cuando el vehículo es efectivamente recibido/ingresado al proceso de atención.

### ServiceRecord

`ServiceRecord` permanece como entidad existente.

No debe realizarse un search/replace conceptual:

```text
ServiceRecord → CareEpisode
```

En el modelo objetivo:

```text
CareEpisode
    ↓
ServiceRecord
```

El ServiceRecord representa el resultado/documentación final de la atención.

### WorkOrder / Estimate

En el modelo objetivo:

```text
CareEpisode
    ├── Estimate
    └── WorkOrder
```

Las relaciones legacy existentes deberán migrarse progresivamente.

### Pendiente

El schema definitivo y lifecycle exacto quedan sujetos a:

- D-022 — MVP CareEpisode policies;
- D-023 — Appointment cancellation after CareEpisode starts.

No implementar todavía el lifecycle completo basándose únicamente en la propuesta inicial.

---

# D-006 — Repositorios

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### Decisión

Los repositories permanecen dentro de sus respectivos módulos.

Las interfaces se exponen mediante tokens de inyección.

Ejemplo conceptual:

```text
Module
├── application
├── domain
├── infrastructure
│   └── repositories
└── presentation
```

No se crea un repository global transversal salvo necesidad explícita.

---

# D-007 — Commands y Queries

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### Decisión

El backend separará conceptualmente:

```text
Commands
Queries
```

No se utilizará `@nestjs/cqrs` para implementar esta separación en el MVP.

La separación es organizacional y semántica, no una obligación de infraestructura.

---

# D-008 — Domain Events / Application Events

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### Decisión

Los eventos internos del MVP utilizarán:

```text
@nestjs/event-emitter
```

mediante `EventEmitter2`.

Los eventos representan hechos ocurridos dentro de la aplicación.

No se introduce Kafka, NATS, RabbitMQ u otro broker para el MVP.

---

# D-009 — Ownership vs Access

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization

### Decisión

Ownership y Access son conceptos diferentes.

```text
Ownership
    =
relación de propiedad sobre un vehículo

Access
    =
capacidad de operar/consultar un recurso
```

Una persona puede:

- ser owner sin pertenecer a un workshop;
- tener acceso sin ser owner;
- pertenecer a un workshop sin ser owner;
- tener múltiples relaciones simultáneas.

Nunca debe inferirse:

```text
Access == Ownership
```

ni:

```text
Workshop Membership == Ownership
```

---

# D-010 — Workshop Membership

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization

### Decisión

La pertenencia de un usuario a un workshop se representa mediante **Workshop Membership**.

Membership no debe mezclarse conceptualmente con:

- ownership;
- plataforma;
- autenticación;
- permisos globales.

Los permisos efectivos dependen del contexto y del rol correspondiente.

---

# D-011 — Timeline

**Estado:** `ACCEPTED`
**Tipo:** Domain / Read Model / UX

### Decisión

La Timeline se considera una **proyección de información histórica**.

No es la fuente primaria de verdad.

Puede combinar información proveniente de:

- CareEpisodes;
- ServiceRecords;
- WorkOrders;
- Estimates;
- otros eventos históricos relevantes.

La Timeline no debe convertirse en un aggregate o entidad transaccional central.

---

# D-012 — Vehicle First

**Estado:** `ACCEPTED`
**Tipo:** Product

### Decisión

La experiencia del producto se organiza alrededor del vehículo.

El vehículo constituye el eje principal de:

- historial;
- mantenimiento;
- atención;
- documentos;
- ownership;
- acceso;
- timeline.

El usuario es importante como actor, pero la unidad funcional principal del producto es el vehículo.

---

# D-013 — Identidad del vehículo

**Estado:** `ACCEPTED`
**Tipo:** Domain / Product

### Decisión

El vehículo posee una identidad interna canónica.

Los identificadores externos, como:

- patente;
- VIN/chassis;
- otros identificadores,

son atributos/identificadores externos del vehículo y no deben convertirse automáticamente en la identidad primaria interna.

La patente puede utilizarse como mecanismo de búsqueda/identificación operativa, pero no debe asumirse que es la identidad inmutable del vehículo.

---

# D-014 — Historical Data Protection

**Estado:** `ACCEPTED`
**Tipo:** Data / Domain

### Decisión

Los datos históricos deben preservarse incluso cuando cambien las relaciones actuales.

Esto aplica especialmente a:

- ownership;
- transfers;
- service history;
- CareEpisodes;
- WorkOrders;
- Estimates;
- ServiceRecords.

Las relaciones históricas relevantes utilizarán `RESTRICT` cuando corresponda.

No deben introducirse cascades que destruyan silenciosamente información histórica.

---

# D-015 — MVP como Modular Monolith

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### Decisión

El backend del MVP será un modular monolith construido con NestJS.

No se introducen microservicios como mecanismo de separación funcional.

La modularidad debe lograrse mediante límites claros entre módulos.

---

# D-016 — Refresh durante impersonation

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture
**Prioridad:** P0

### Decisión

Durante una sesión de impersonation, el refresh automático **no debe prolongar indefinidamente la impersonation**.

La sesión impersonada tiene una duración limitada de:

```text
1 hora
```

Una vez expirada:

- el token impersonado deja de ser válido;
- no se genera automáticamente otro token impersonado;
- el administrador debe iniciar nuevamente la impersonation si necesita continuar.

### Razón

Esto limita el tiempo de exposición de una sesión privilegiada y evita convertir el refresh mechanism en una extensión indefinida de privilegios.

El token/sesión original del administrador permanece almacenado según el mecanismo seguro existente para permitir `stop impersonation`.

### Amendment 1 — Ventana absoluta y comportamiento de refresh (2026-09-04)

La impersonación posee una **ventana absoluta de 1 hora** (`impersonateAt + 1h`), enforced server-side contra la fila `impersonation_session` (no contra un simple JWT `exp`).

Comportamiento:

| Evento | Acción |
|---|---|
| `impersonate` | Borra **todas** las filas previas del admin y crea una sola (máximo 1 impersonación activa por admin). Cookie access = token impersonado `expiresIn 1h`. |
| `refresh` dentro de la ventana | Re-emite token impersonado (`{sub: target, impersonated, impersonatedBy}`) con `exp = fin de la ventana absoluta`, **siempre** que `expiresAt > now` y el admin siga `active`. Rota el refresh session del admin (reuse-detection intacto). |
| `refresh` fuera de la ventana | Re-issue de token admin (sin impersonación). El admin debe re-impersonar. |
| `refresh` con admin no activo | `401`, sin re-issue, sin prolongación. |
| `stop-impersonate` | Re-firma un access token admin **fresco** (nunca devuelve el token almacenado, que puede estar vencido). Busca la fila sin filtro temporal (funciona incluso post-expiración). Borra la fila. Requiere admin `active`. |
| Expiración natural | La fila permanece hasta el próximo `impersonate` del admin (sin job de limpieza en MVP; limpieza oportunista). |

La ventana de 1h **nunca** se supera, sin importar el comportamiento del cliente: el servidor no re-firma más allá de `expiresAt`.

Frontend:

- Snapshot de admin en `sessionStorage` incorpora `impersonatedAt` (mirror de UX, no autoridad).
- Expiración → página explícita `/impersonation-expired` con "volver a sesión de administrador" y "cerrar sesión". Sin auto-restore.
- El backend expone código estable de expiración: `401` + `IMPERSONATION_EXPIRED` (ver D-025).

Mobile futuro: la impersonación en MVP es cookie-only (browser). Los handlers devuelven tokens transport-agnostic; el soporte mobile Bearer se implementará cuando exista el cliente, sin cambios de diseño estructural (limitación documentada).

### Amendment 2 — Flujo de recovery post-expiración (2026-09-04, Security Review)

La Security Review encontró un **P0 de recovery**: el viaje "impersonación expirada → volver a sesión de administrador" estaba roto porque el cliente **no refrescaba** ante `401 IMPERSONATION_EXPIRED` (tratándolo como ventana cerrada) y "volver a admin" dependía de `stop-impersonate`, inalcanzable con access expirado.

Regla de producto (corrige la interpretación):

- El cliente refresca ante **cualquier `401`**, incluido `IMPERSONATION_EXPIRED`: dentro de la ventana el refresh es legítimo y re-emite token impersonado (`impersonated: true`, D-016 A1).
- La ventana cerrada se detecta **por la respuesta del refresh**: `impersonated: false` + snapshot de admin vigente → mostra `/impersonation-expired`; `401` en refresh → login.
- `/impersonation-expired` → "volver a sesión de administrador" = **refresh** (obtiene token admin si la ventana cerró) y navegar a `/admin/users`; logout = cerrar sesión. `stop-impersonate` queda para la terminación **dentro** de la ventana (access válido), no para recovery.
- El código `IMPERSONATION_EXPIRED` se conserva para SSR y telemetría; no es el disparador del flujo de expiración.

Decisión de seguridad asociada (Security Review P1): **eliminar la persistencia del `adminToken` en claro** en `impersonation_sessions`. Desde D-016 A1 el `stop-impersonate` re-firma token fresco y nunca reutiliza el almacenado; la columna deja de ser necesaria (drop vía migración — coordina TL/Database). La ventana y rotación siguen enforced server-side por la fila.

---

# D-017 — Bearer en producción

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture

### Decisión

**No se deshabilita globalmente Bearer en producción.**

La API puede necesitar Bearer para:

- machine clients;
- integraciones;
- clientes no-browser.

Por lo tanto, no se debe implementar una regla global del tipo:

```text
production => ignore Authorization header
```

### Regla

El frontend web oficial utiliza exclusivamente cookies.

Bearer debe estar explícitamente asociado a clientes no-browser autorizados.

Si en el futuro existe una necesidad fuerte de separar ambos mecanismos, se evaluará:

- audience;
- client type;
- rutas;
- scopes;
- auth strategies independientes.

La coexistencia no debe convertirse en una vía accidental de autenticación para el frontend browser.

---

# D-018 — Co-owner rights

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Problema

VehicleOwnership permite representar ownership histórico, pero todavía no se ha definido completamente:

- múltiples propietarios simultáneos;
- derechos de co-owner;
- diferencia entre owner principal y co-owner;
- capacidad de transferir;
- acceso automático derivado de ownership.

### Pendiente

Definir las capacidades concretas de:

```text
Owner
Co-owner
Former Owner
Authorized User
```

antes de construir workflows avanzados de ownership.

---

# D-019 — Semántica de vehículos en WORKSHOP context

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Pregunta

¿Qué significa:

```text
GET /vehicles
```

cuando:

```text
Active Context = WORKSHOP
```

### Opciones consideradas

1. Vehículos que actualmente pertenecen explícitamente al workshop.
2. Vehículos derivados de historial de atención del workshop.
3. Una entidad explícita `WorkshopVehicle`.
4. Una combinación de ownership/access/history.

### Recomendación provisional

Para el MVP se favorece una semántica derivada de la relación histórica con el workshop, evitando introducir prematuramente una entidad `WorkshopVehicle`.

Esta recomendación requiere aprobación antes de convertirse en contrato definitivo.

---

# D-020 — Contexto inválido

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Security

### Decisión

Un Active Context inválido, inexistente o no autorizado debe producir:

```text
403 Forbidden
```

No se debe realizar fallback silencioso hacia:

```text
PERSONAL
```

ni hacia ningún otro contexto.

### Razón

El fallback puede provocar:

- confusión funcional;
- exposición accidental de información;
- autorización incorrecta;
- problemas difíciles de detectar.

Un contexto inválido debe ser explícito y observable.

### Amendment 1 — Implementación (2026-09-04)

Implementación concreta en `ContextResolver`:

- **Header `X-Context-Type` ausente** → default `PERSONAL` (no hay contexto explícito solicitado; permitido).
- **Header presente e inválido** → `403 Forbidden` duro, sin fallback. Caminos: tipo desconocido; `WORKSHOP` sin `X-Context-Id`; workshop inexistente o sin membership activa; `PLATFORM` sin rol de plataforma; `PERSONAL` con `X-Context-Id` (contrato estricto).
- **Se elimina el path-fallback** del `ContextResolver` (ninguna ruta con `ContextGuard` tiene un workshopId legítimo en `:id`; solo enmascaraba ambigüedad).
- `PLATFORM` exige `systemRoleAssignment` con rol `(super_admin, admin, support)`. El rol de sistema `user` **no** califica.
- Error estándar para el contrato: `ForbiddenException('Invalid or unauthorized active context')`.

Coordinación de release (cambio breaking asociado):

- Los flujos de taller que hoy "funcionan por accidente" (IDOR) dejarán de hacerlo. El frontend debe enviar `X-Context-Type: WORKSHOP` + `X-Context-Id` en los flujos de taller **a partir de este fix**, mediante propagación mínima basada en el taller actualmente seleccionado por la navegación (sin ContextSwitcher, sin queryKeys por contexto, sin persistencia — eso es parte de D-004/D-021).
- El despliegue del P0 de seguridad se coordina Backend + Frontend.

---

# D-021 — Session-driven vs route-driven Active Context

**Estado:** `PENDING`
**Tipo:** Product / Architecture

### Problema

Debe definirse qué elemento representa la autoridad del contexto activo:

```text
Session
URL
Route
Query parameter
Header
```

### Principio provisional

La navegación puede reflejar el contexto mediante URL, pero la URL **no debe convertirse automáticamente en autoridad de autorización**.

La arquitectura favorece:

```text
Session / explicit context
        ↓
API request
        ↓
Authorization
```

La URL puede actuar como mecanismo de navegación/persistencia UX.

### Pendiente

Definir:

- persistencia entre refresh;
- comportamiento SSR;
- deep links;
- cambio de workshop;
- logout/login;
- múltiples pestañas;
- sincronización frontend/backend.

---

# D-022 — MVP CareEpisode policies

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Debe definirse

Antes de implementar completamente CareEpisode se deben resolver:

- quién puede crear un episodio;
- cuándo exactamente nace;
- si siempre requiere Appointment;
- walk-ins;
- quién puede modificarlo;
- qué significa `waiting_approval`;
- qué eventos cambian su estado;
- qué estados son obligatorios;
- quién puede cerrar un episodio;
- qué datos son obligatorios para cerrar;
- permisos por actor/contexto.

### Principio

CareEpisode debe representar una atención real del vehículo y no convertirse en un simple wrapper técnico alrededor de las entidades existentes.

---

# D-023 — Appointment cancelado después de iniciar CareEpisode

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Problema

Un Appointment puede ser cancelado después de que el vehículo ya haya ingresado.

La semántica correcta debe distinguir:

```text
Appointment
    =
reserva/intención de atención

CareEpisode
    =
atención efectivamente iniciada
```

### Recomendación provisional

Una vez creado un CareEpisode:

```text
Appointment.cancelled
```

no debe destruir ni cancelar automáticamente:

```text
CareEpisode
```

El episodio representa un hecho operativo ya ocurrido.

El comportamiento exacto de los estados debe resolverse junto con D-022.

---

# D-024 — Validación de acceso a recursos vehiculares (VehicleAccessService)

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture / Authorization
**Prioridad:** P0

### Contexto

Verificación de seguridad (2026-09-04) confirmó IDORs activos:

- `GET /maintenance/appointments/:id`, `work-orders/:id`, `estimates/:id`, `vehicles/:vehicleId/history` **no validan** ownership/access del llamador (causa raíz: path-fallback del ContextResolver, corregido en D-020).
- `GET /maintenance/appointments` y `work-orders` (listados) en PERSONAL aceptan `?workshopId=` libre → listados también IDOR.
- `POST /vehicles/:id/mileage` no valida acceso → IDOR de escritura.
- `POST /maintenance/estimates/:id/convert` sin validación.
- `POST /maintenance/work-orders/:id/items` sin guard de permisos.
- `GET /dashboard/super-admin` sin PermissionsGuard validado (P1).

### Decisión

Introducir **`VehicleAccessService`** en `src/common/authorization/` como validación reutilizable de acceso a un vehículo, con regla de evaluación (corto-circuito):

```text
1. Ownership activo (vehicle_ownerships, endsAt: null)
2. VehicleAccess vigente (revokedAt: null, sin expirar)
3. Workshop membership del contexto WORKSHOP (si contexto es WORKSHOP)
4. Privilegio de plataforma (super_admin)
```

Si ninguna aplica → `ForbiddenException`.

### Implicaciones

- Las rutas de lectura y escritura de maintenance validan acceso al `vehicleId` del recurso (13+ endpoints).
- Listados en contexto PERSONAL exigen `vehicleId` validado o contexto WORKSHOP; el `workshopId` del contexto **gana** sobre el del query (mismatch → 403).
- `POST /vehicles/:id/mileage` incorpora validación de acceso (P0).
- `GET /vehicles/:id` (detalle) **permanece** con ownership/access/super_admin hasta D-019 (no se incorpora workshop-membership en este P0).
- Deuda P1 registrada: `DELETE /vehicles/:id` y `POST /vehicles/:id/access` deben exigir **ownership** (hoy un usuario con solo access puede borrar/otorgar); `GET /dashboard/super-admin` requiere PermissionsGuard.
- El P0 crea el primer scaffold de testing (jest existente; unit de ContextResolver + VehicleAccessService + integration Supertest por endpoint).

### Amendment 1 — Alcance mínimo exacto y regla de taller verificada (2026-09-04, desglose técnico)

El desglose técnico verificó la lista real de endpoints (12, no 13+ — `GET /maintenance/estimates/:id` no existe). Se corrigen y complementan las implicaciones:

1. **Regla 3 (workshop membership) requiere asociación de vehículo con el taller.** La membership activa del contexto WORKSHOP **no alcanza** para acceder a cualquier vehículo del sistema: el vehículo debe además tener **al menos un registro de mantenimiento del taller** (appointment, work-order, estimate o service-record con ese `workshopId`). Sin asociación → `ForbiddenException`. Evita sobre-exposición de lectura ("cualquier miembro puede leer cualquier vehículo del sistema"). Regla **provisional** sujeta a D-019; no reabre el IDOR de listados.
2. **Los creates de maintenance entran al P0.** `POST /maintenance/appointments|work-orders|estimates|service-records` deben validar acceso al `vehicleId` del DTO: en PERSONAL, ownership/access/super_admin; en WORKSHOP, membership activa **+ asociación** con el taller. Sin esto, un usuario autenticado podría crear recursos sobre un vehículo ajeno y **contaminar el historial** (viola D-012/D-014). Extiende la lista de endpoints cubiertos (12 → 16).
3. **Hallazgo adicional confirmado:** `POST /maintenance/estimates/:id/convert` y `POST /maintenance/work-orders/:id/items` entran al P0 como escrituras validadas con `assertVehicleAccess` (el `PermissionsGuard` del items y del dashboard super-admin permanecen deuda P1).
4. **`/vehicles/*`** (findOne, update, remove, photos, documents, history, grantAccess): reemplaza el `assertVehicleAccess` privado por el servicio en **modo estricto** (ownership/access/super_admin, sin membership), comportamiento idéntico al actual hasta D-019.

### Amendment 2 — Maintenance writes son exclusivos de taller (WORKSHOP-only) (2026-09-08, QA post-merge, decisión PM confirmada)

**Amenda el punto 2 del Amendment 1** y resuelve la regresión detectada en el QA post-merge: los `@Permissions` de taller sobre los writes de maintenance hacían que un owner en contexto PERSONAL recibiera 403 sobre su propio vehículo, contradiciendo el punto 2 del Amendment 1 (que validaba los creates en PERSONAL por ownership/access/super_admin).

**Decisión (Opción A):**

- El registro de atenciones/servicios (CareEpisode y sus derivados: appointments, work-orders, service-records, estimates, items, approve, convert) es actividad **del taller**. Los writes de maintenance **requieren contexto WORKSHOP** con permisos de taller (`appointment.*`, `workorder.*`, `service-record.*`, `estimate.*`).
- En contexto **PERSONAL**, los writes de maintenance están **denegados por diseño**: el backend responde `403 PERMISSION_DENIED` sin depender de ownership/access. Aplica también a `super_admin` (debe operar desde un contexto WORKSHOP con permisos de taller registrados; no se concede privilegio de plataforma para writes de maintenance).
- El owner en PERSONAL conserva: consultas de maintenance con ownership/access, `POST /vehicles/:id/mileage`, y las operaciones de `/vehicles/*` (strict mode). Puede **consultar** el historial, pero **no crear/cancelar/convertir** atenciones desde su contexto personal.
- Frontend: en contexto PERSONAL, la UI de maintenance activo (crear, cancelar, convertir, agregar items, cambiar estado) se oculta o se presenta en modo solo-consulta, con aviso de que la gestión requiere operar desde un taller. Backend permanece estricto (nunca se confía en la UI).
- El enforcement actual (`PermissionsGuard` + `@Permissions`) ya produce este comportamiento en la práctica; esta enmienda lo convierte en **decisión explícita de producto** y elimina la contradicción con el Amendment 1.

**Nota de implementación (2026-09-08, cierre de QA post-merge):**

- **Escape de seguridad corregido:** el bypass incondicional de `super_admin` en `PermissionsGuard` (líneas 56-58) hacía que un `super_admin` en contexto PERSONAL pudiera escribir maintenance si ownership/access lo permitía (el bypass se dispara antes de cargar permisos de taller). Se introdujo `WorkshopOnlyGuard` (`src/common/guards/workshop-only.guard.ts`), aplicado **antes de** `PermissionsGuard` en los **10 endpoints write** de maintenance: exige `ctx.type === 'WORKSHOP'` y lanza `ForbiddenException` (403 → envelope `PERMISSION_DENIED` vía D-025) en PERSONAL/PLATFORM/contexto ausente. Los endpoints read de maintenance conservan validación por ownership/access.
- **Cobertura de tests:** la matriz de la Opción A quedó cubierta en `maintenance.controller.spec.ts` (45 casos nuevos sobre esa spec; suite total 127 tests). Incluye: owner en PERSONAL → 403 en writes; `super_admin` en PERSONAL → 403 en writes; miembro en WORKSHOP con permiso → pasa; owner en PERSONAL → reads pasan.
- **UI (frontend):** en contexto PERSONAL (usuario sin membresía de taller activa) la UI de maintenance queda **solo-consulta**: se ocultan controles de create/cancel/convert/item/status y las páginas `/new` muestran un aviso ("La gestión de mantenimiento requiere operar desde un taller"). La barra lateral conserva el vínculo "Mantenimiento" (decisión PM: el owner debe poder consultar su historial; se evita ocultar navegación), con las vistas read-only + aviso. Un usuario con ≥1 membresía mantiene el comportamiento previo (contexto WORKSHOP vía fallback `workshopMembers[0]`).

---

# D-025 — Contrato de errores estandarizado (Error envelope)

**Estado:** `ACCEPTED`
**Tipo:** Backend Contract / Frontend / Security
**Prioridad:** P0

### Decisión

El backend estandariza el envelope de error:

```json
{
  "statusCode": 403,
  "message": "No tenés acceso a este recurso",
  "code": "PERMISSION_DENIED",
  "errors": {}
}
```

Conjunto mínimo de códigos estables:

```text
INVALID_CREDENTIALS
SESSION_EXPIRED
IMPERSONATION_EXPIRED
PERMISSION_DENIED
INVALID_CONTEXT
NOT_FOUND
VALIDATION_ERROR
CONFLICT
INTERNAL_ERROR
```

`INTERNAL_ERROR` (500) se agrega al set como código **de fallback genérico** (excepciones no capturadas: envelope sin stack, log interno). No se usa como código de negocio; el cliente lo trata como error de servidor rethrow al error boundary.

### Reglas frontend

- **`403` nunca implica logout**: sin refresh, sin redirect a `/login`. Renderiza estado de acceso denegado.
- **`401`** es el único código que dispara refresh → retry → redirect.
- SSR: `401` → redirect `/login`; `403` → `ForbiddenState`; `404` → `notFound()`; 5xx → error boundary.
- `code === "INVALID_CONTEXT"` queda reservado para la UX de recuperación de contexto cuando D-004/D-021 aterricen (diseñado ahora, implementado después).
- `code === "IMPERSONATION_EXPIRED"` (401) dispara la flujo `/impersonation-expired` (ver D-016).

### Mobile futuro

El envelope es portable por transporte (cookies web / Bearer mobile): el cliente dispone sobre los mismos `code`, independientemente del transporte.

---

# 6. Dependency Graph

Las decisiones tienen las siguientes dependencias principales:

```text
D-001
 ├── D-016
 └── D-017


D-003
 └── D-002


D-002
 └── D-004
       ├── D-019
       └── D-021


D-005
 ├── D-022
 └── D-023


D-020
 └── D-024
       └── D-025
```

---

# 7. Orden recomendado de resolución

## Fase 0 — Corrección inmediata (P0)

### Build blocker

Corregir:

```text
src/hooks/use-vehicles.ts
```

eliminando el import inexistente:

```text
getAuthHeaders
```

Esta corrección no requiere una decisión arquitectónica.

### Seguridad P0 (coordinado Backend + Frontend)

Cerrar los hallazgos de seguridad verificados:

```text
D-020  ContextResolver → 403 hard, eliminar path-fallback, PLATFORM con rol
D-024  VehicleAccessService + validación en rutas de maintenance/record-mileage
D-025  Error envelope + 403 nunca = logout (frontend)
D-016  Refresh mantenido dentro de ventana + stop-impersonate re-firma admin
D-002  /auth/me expone isVehicleOwner (contrato de sesión)
```

Requisito de release coordinado: el frontend envía `X-Context-Type`/`X-Context-Id` en flujos de taller (propagación mínima, D-020 Amendment 1). Sin este requisito, el fix de contexto rompería flujos de taller existentes.

---

## Fase 1 — Auth

Resolver implementación/documentación de:

```text
D-001
D-016
D-017
```

Prioridad máxima por impacto transversal y seguridad.

---

## Fase 2 — Actor / Ownership

Consolidar:

```text
D-003
D-002
D-018
```

D-018 puede mantenerse pendiente si el MVP no requiere co-ownership explícito.

---

## Fase 3 — Active Context

Resolver:

```text
D-019
D-021
```

y luego implementar definitivamente:

```text
D-004
D-020
```

D-020 ya está aceptada y debe respetarse desde el comienzo.

---

## Fase 4 — CareEpisode

Resolver:

```text
D-022
D-023
```

y posteriormente cerrar la implementación derivada de:

```text
D-005
```

---

# 8. Reglas para agentes

Todos los agentes del proyecto deben seguir estas reglas.

### 8.1 No sobrescribir decisiones aceptadas

Un agente no puede modificar el comportamiento definido por una decisión `ACCEPTED` sin:

1. registrar una nueva decisión;
2. marcar la anterior como `SUPERSEDED` cuando corresponda;
3. documentar la razón del cambio.

---

### 8.2 No resolver silenciosamente decisiones pendientes

Una decisión `PENDING` no debe ser convertida implícitamente en una decisión técnica mediante código.

---

### 8.3 Diferenciar legacy de target architecture

El código existente puede no coincidir con la arquitectura objetivo.

Cuando exista contradicción:

```text
Accepted Decision
        ↓
Target Architecture
        ↓
Migration Plan
        ↓
Legacy Code
```

No se debe adaptar la arquitectura objetivo al legacy automáticamente.

---

### 8.4 Frontend no es autoridad de seguridad

El frontend puede ocultar:

- botones;
- rutas;
- acciones;
- elementos de navegación.

Pero nunca reemplaza las verificaciones backend.

---

### 8.5 No introducir abstracciones especulativas

No crear:

- Identity;
- WorkshopVehicle;
- microservicios;
- event broker;
- CQRS framework;
- aggregates formales;

solo porque podrían ser necesarios en el futuro.

Deben existir necesidades concretas y una decisión explícita.

---

# 9. Template para nuevas decisiones

Las nuevas decisiones deben utilizar como mínimo:

```markdown
# D-XXX — Nombre

**Estado:** `PROPOSED`
**Tipo:** Product / Domain / Architecture / Security / Data / UX
**Prioridad:** P0 / P1 / P2

## Problema

¿Qué problema necesita resolverse?

## Contexto

¿Qué información relevante existe?

## Opciones

### Opción A

...

### Opción B

...

## Decisión

...

## Consecuencias

...

## Implicaciones

### Backend

...

### Frontend

...

### Database

...

### Security

...

## Dependencias

...

## Estado

...
```

---

# 10. Estado actual

### Accepted

```text
D-001  Auth
D-002  Vehicle ownership source of truth
D-003  Identity vs User
D-006  Repository pattern
D-007  Commands / Queries
D-008  Application events
D-009  Ownership vs Access
D-010  Workshop Membership
D-011  Timeline as projection
D-012  Vehicle First
D-013  Vehicle identity
D-014  Historical data protection
D-015  Modular Monolith
D-016  Impersonation refresh policy
D-017  Bearer production policy
D-020  Invalid Active Context → 403
D-024  VehicleAccessService / access validation (P0)
D-025  Error envelope contract
```

### Pending

```text
D-004  Active Context final semantics
D-005  CareEpisode implementation/lifecycle
D-018  Co-owner rights
D-019  WORKSHOP vehicle semantics
D-021  Session-driven vs route-driven context
D-022  MVP CareEpisode policies
D-023  Appointment cancellation after CareEpisode
```

---

# 11. Resumen ejecutivo

El MVP queda alineado alrededor de los siguientes principios:

```text
                    HCDV
                     │
                 Vehicle First
                     │
              ┌──────┴──────┐
              │             │
         Ownership        Access
              │             │
              └──────┬──────┘
                     │
              Active Context
                     │
             ┌───────┴───────┐
             │               │
         PERSONAL         WORKSHOP
             │               │
             └───────┬───────┘
                     │
                 CareEpisode
                     │
          ┌──────────┼──────────┐
          │          │          │
      Diagnosis   Estimate   WorkOrder
                                  │
                            ServiceRecord
                                  │
                               Timeline
```

Y en términos de arquitectura:

```text
Browser
  │
  │ HttpOnly Cookies
  ▼
NestJS Modular Monolith
  │
  ├── Authentication
  ├── Authorization
  ├── Active Context
  ├── Vehicles
  ├── Ownership
  ├── Workshops
  ├── Appointments
  └── Maintenance
          │
          └── CareEpisode
                ├── Diagnosis
                ├── Estimate
                ├── WorkOrder
                └── ServiceRecord
  │
  ▼
PostgreSQL + Prisma
```

El registro debe permanecer deliberadamente pequeño y orientado a decisiones. Las decisiones de implementación menores no deben convertirse automáticamente en entradas del Decision Register.

---

# 12. Wave P2 — Implementación registrada (2026-09-08)

## Implementado (QA post-onda: APROBADO CON OBSERVACIONES; 0 defectos corregibles)

| Ítem | Detalle |
| ---- | ------- |
| D-016 A2 completado | Drop de `adminToken` en claro: migración `prisma/migrations/20260908000000_drop_admin_token_from_impersonation_sessions` (DROP COLUMN) + schema + `impersonate.handler` ya no persiste token. `stop-impersonate` sigue re-firmando token fresco (D-016 A1). Cero lecturas residuales de DB (verificado por QA). |
| exp explícita | `login`, `refresh` (normal), `impersonate` y `stop-impersonate` firman con exp determinada; impersonación usa exp absoluta de la ventana de 1h. |
| Throttler | `ThrottlerModule` habilitado (envs `THROTTLE_TTL`/`THROTTLE_LIMIT` con defaults) en login, refresh, forgot/reset-password e impersonate. Sin APP_GUARD global (SPA). Sin dependencias nuevas. |
| B2 | `status` tipado a `AppointmentStatus`/`WorkOrderStatus` en maintenance. Sin cambio de contrato runtime. |
| B3 | `fileFilter` MIME en fotos (jpeg/png/webp/avif) y documentos (+pdf), consistente con `isImage` de storage. 400 → envelope D-025. |
| B5 | `jwt.strategy.spec.ts` instancia la estrategia real (elimina `validatePayload` que replicaba lógica). |
| Asociación vehículo-taller | Appointments con `status = 'cancelled'` ya NO generan asociación (SQL en `assertWorkshopVehicleAccess`). |
| Dead code | Eliminado `src/common/exceptions/domain.exception.ts` (sin imports). |

Verificación: `tsc --noEmit` exit 0 · `npm test` 132 PASS · `npm run build` exit 0 (backend y frontend).

## Decisión de producto aplicada

- **D-024 A1 regla 3 (asociación, enmienda parcial):** los appointments **cancelados no constituyen atención real** y por lo tanto no generan asociación vehículo-taller para acceso WORKSHOP.

## DECISIÓN DE PRODUCTO PENDIENTE

- **¿Los work-orders con `status = 'cancelled'` y los estimates deben seguir contando como asociación vehículo-taller?** (regla 3 de D-024 A1). Documentado en `src/common/authorization/vehicle-access.service.ts`. No se cambió el contrato silenciosamente. Recomendación: resolver junto con D-019 (semántica de WORKSHOP y "parque de clientes").

## Observaciones QA post-wave (deuda menor)

- **D-025:** agregar código `RATE_LIMITED` para HTTP 429 (throttler) al catálogo `error-codes.ts` + `statusToCode`; hoy cae en `INTERNAL_ERROR` (funcional pero engañoso).
- **Tests faltantes:** `fileTypeFilter()`/MIME (B3) y verificación explícita del leg `estimates` en el test B6.
- **Entorno:** `.env` local sin `JWT_REFRESH_SECRET` (solo vive en shell del dev); recomendar agregarla a `.env`/`.env.example`.

## Migración requerida

- Aplicar `npm run db:deploy` en el entorno correspondiente (DROP COLUMN `admin_token`; no destructivo, no se lee desde D-016 A1).
