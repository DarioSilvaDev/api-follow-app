# HCDV — Decision Register

> Registro único de decisiones de producto, dominio, arquitectura y UX que condicionan la evolución de Historia Clínica Digital Vehicular (HCDV).

**Estado del documento:** Activo
**Última actualización:** 2026-09-09
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

# D-026 — Password reset: token hashing

**Estado:** `ACCEPTED`
**Tipo:** Security / Data
**Prioridad:** P0

### Decisión

El token de password reset se almacena en base de datos únicamente como **hash SHA-256**, nunca en texto plano.

```text
Token en memoria/email: randomBytes(32).toString('hex')  (64 chars hex, 256 bits)
Token en BD:            SHA-256(token)                   (column token_hash)
```

### Reglas

- `PasswordReset.tokenHash` es el único campo persistido (columna `token_hash`, unique).
- El token en claro solo existe transitoriamente en el handler y en el email enviado al usuario.
- El hash se calcula con el mismo mecanismo que `refreshToken` (`hashPasswordResetToken`).
- Aplica también como patrón obligatorio para cualquier token de verificación futuro (p. ej. `email_verifications`), evitando reintroducir texto plano.

### Implicaciones

Database:

- Migración `20260909000000_hash_password_reset_token`: agrega `token_hash`, migra datos existentes con `pgcrypto` (`encode(digest(token,'sha256'),'hex')`), índice único, drop de `token`.

Seguridad:

- Un volcado de BD no permite usar tokens de reset.
- No se requiere cifrado reversible; el hash es suficiente porque el token tiene 256 bits de entropía.

---

# D-027 — Password reset: flujo seguro (revocación, atomicidad, lockout)

**Estado:** `ACCEPTED`
**Tipo:** Security / Product
**Prioridad:** P0

### Decisión

El flujo de password reset incorpora las siguientes reglas de seguridad:

1. **Un solo token activo por usuario:** al crear un nuevo token de reset, se revocan (`usedAt = now`) todos los tokens previos no utilizados del usuario.
2. **Atomicidad:** la actualización de la contraseña, el marcado del token como usado y la revocación de sesiones se ejecutan dentro de una única transacción (`prisma.$transaction`). No puede quedar un estado intermedio (token reutilizable o sesiones no revocadas).
3. **Limpieza de lockout:** un reset exitoso reinicia `failedAttempts = 0` y `lockedUntil = null` junto con el cambio de contraseña.
4. **Revocación de sesiones:** todas las sesiones activas del usuario (`revokedAt IS NULL`) se revocan al completar un reset.
5. **Token de un solo uso:** el `usedAt` se establece dentro de la misma transacción; un token ya usado es rechazado.

### Regla

El reset de contraseña es un evento de alta seguridad: modifica credenciales, limpieza de bloqueo y sesiones de forma atómica. No puede degradarse ninguna de estas tres operaciones a un paso opcional.

### Implicaciones

Backend:

- `reset-password.handler` ejecuta todo en `$transaction`.
- `request-password-reset.handler` revoca tokens anteriores antes de crear el nuevo.

---

# D-028 — Reset password: link del email apunta al frontend

**Estado:** `ACCEPTED`
**Tipo:** Product / Architecture / Backend Contract
**Prioridad:** P0

### Decisión

El email de password reset genera un link hacia la **aplicación frontend**, no hacia el backend API.

```text
Link en email: ${FRONTEND_URL}/reset-password?token=${token}
```

### Reglas

- Se introduce la variable de entorno `FRONTEND_URL` (URI, default `http://localhost:3000`), independiente de `API_URL`.
- El frontend consume el token desde el query param y lo elimina de la URL (`history.replaceState`) tras leerlo.
- `forgot-password` y `reset-password` son endpoints públicos (sin auth); el token es la autorización del reset.

### Implicaciones

Backend:

- `mail.service.ts` usa `envs.FRONTEND_URL` para construir el link.

Frontend:

- Ruta canónica de reset: `/reset-password?token=...` (ruta pública, grupo `(auth)`).
- Página `forgot-password` implementa anti-enumeración: respuesta idéntica exista o no el email.

---

# D-029 — Email de confirmación post-reset

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

### Decisión

Se envía un **email de confirmación** al usuario cuando su contraseña es restablecida exitosamente.

### Reglas

- Se emite el evento `auth.password_reset.completed` después de la transacción exitosa.
- El listener `SendPasswordResetCompletedEmailListener` busca al usuario y le envía el email de notificación.
- Incluye advertencia de seguridad: "Si no realizaste este cambio, contacta al soporte inmediatamente".
- Un usuario inexistente (borrado entre reset y envío) no produce error ni email.

### Razón

Permite que la víctima de un reset malicioso detecte el compromiso de su cuenta sin depender de otros canales.

---

# D-030 — Rate limiting diferenciado en auth público

**Estado:** `ACCEPTED`
**Tipo:** Security / Backend Contract
**Prioridad:** P1

### Decisión

Los endpoints públicos de recuperación de contraseña tienen límites de throttling específicos, diferenciados del throttle global:

```text
POST /auth/forgot-password   3 requests / 10 minutos por IP
POST /auth/reset-password    5 requests /  5 minutos por IP
```

`change-password` (autenticado) conserva el throttle global existente.

### Observación QA registrada

Queda como deuda menor agregar el código `RATE_LIMITED` para HTTP 429 al catálogo D-025 (`error-codes.ts` + `statusToCode`); hoy el 429 cae en `INTERNAL_ERROR` (funcional pero engañoso para el frontend).

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


D-026
  └── D-027
        └── D-029


D-028
  └── D-030
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
D-026  Password reset token hashing
D-027  Password reset flow seguro (revocación, atomicidad, lockout)
D-028  Reset password link → FRONTEND_URL
D-029  Email de confirmación post-reset
D-030  Rate limiting diferenciado en auth público
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

## DECISIÓN DE PRODUCTO PENDIENTE — RESUELTA (2026-09-09, PM)

- **D-024 A1 regla 3, Amendment 3 (ACCEPTED):** los **work-orders con `status = 'cancelled'` NO generan asociación** vehículo-taller (mismo criterio que citas canceladas: no hubo atención real). Los **estimates SÍ mantienen la asociación de forma provisional**: representan la puerta de entrada comercial del taller con un vehículo nuevo; excluirlos rompería el journey de primer contacto (sin asociación previa no se puede crear el primer registro). Sujeto a revisión con D-019 (semántica de WORKSHOP y "parque de clientes").
- Implementación: añadir `status <> 'cancelled'` al leg de `work_orders` en `assertWorkshopVehicleAccess` (Wave P3).

## Observaciones QA post-wave (deuda menor)

- **D-025:** agregar código `RATE_LIMITED` para HTTP 429 (throttler) al catálogo `error-codes.ts` + `statusToCode`; hoy cae en `INTERNAL_ERROR` (funcional pero engañoso).
- **Tests faltantes:** `fileTypeFilter()`/MIME (B3) y verificación explícita del leg `estimates` en el test B6.
- **Entorno:** `.env` local sin `JWT_REFRESH_SECRET` (solo vive en shell del dev); recomendar agregarla a `.env`/`.env.example`.

## Migración requerida

- Aplicar `npm run db:deploy` en el entorno correspondiente (DROP COLUMN `admin_token`; no destructivo, no se lee desde D-016 A1).

---

# 13. Iteración registrada (2026-09-09): Flujo completo de Reset Password (D-026 a D-030)

## Objetivo

Completar el flujo de reset password de extremo a extremo: seguridad del token, atomicidad, emails funcionales, frontend operativo y pruebas automatizadas. Las decisiones de producto asociadas son D-026 a D-030.

## Implementado

### Backend — Seguridad

| Ítem | Detalle |
| ---- | ------- |
| D-026 | `PasswordReset.token` (texto plano) → `tokenHash` (SHA-256). Migración `20260909000000_hash_password_reset_token` (add `token_hash`, `pgcrypto`, migrar datos, índice único, drop `token`). Aplicada en dev. |
| D-027 | `reset-password.handler` con `prisma.$transaction`: update credential (`passwordHash`, `passwordChangedAt`, `failedAttempts=0`, `lockedUntil=null`) + mark token used + revoke sesiones activas. Error unificado `401 'Enlace inválido o expirado'`. |
| D-027 | `request-password-reset.handler` revoca tokens previos no usados antes de crear el nuevo; token generado con `randomBytes(32).toString('hex')`. |
| D-030 | Throttling diferenciado: `forgot-password` `@Throttle` 3/10min, `reset-password` 5/5min. |

### Backend — Funcional

| Ítem | Detalle |
| ---- | ------- |
| D-028 | `FRONTEND_URL` en `envs` (URI, default `http://localhost:3000`). `mail.service.sendPasswordResetEmail` construye link `FRONTEND_URL/reset-password?token=...` en lugar de apuntar al backend. |
| D-029 | Nuevo evento `PasswordResetCompletedEvent` (`auth.password_reset.completed`) emitido tras transacción exitosa + listener que envía email de confirmación. |
| Contratos | `forgotPassword`/`resetPassword`/`changePassword` retornan `{ message }`. `ResetPasswordDto` con `@MaxLength(100)` (consistente con change/register). Mensajes de error unificados en español para el flujo de reset. |

### Frontend (creado desde cero en `frontend/`)

| Ítem | Detalle |
| ---- | ------- |
| Stack | Next.js 15+ (App Router) + TypeScript strict + Tailwind CSS 4 + shadcn/ui (Base UI) + ky + React Hook Form + Zod + TanStack Query. |
| Página | `/forgot-password` — email + Zod; estado success siempre idéntico (anti-enumeración); maneja 429. |
| Página | `/reset-password` — token desde query param, eliminado de la URL con `replaceState`; password + confirmación; 401 → enlace expirado; success → auto-redirect 3s a `/login`. |
| Página | `/login` (stub funcional) y `/profile` (change-password: current + new + confirm, validaciones Zod, 401 → contraseña actual incorrecta). |
| Componentes | `PasswordInput` (toggle mostrar/ocultar), Card/Button/Input/Label (shadcn). `authApi` (ky) + hooks `useForgotPassword`/`useResetPassword`/`useChangePassword`. |

### Tests (backend)

| Suite | Resultado |
| ----- | --------- |
| `request-password-reset.handler.spec.ts` | 6 tests (email inexistente, revocación previa, token 64 hex, evento, expiración 1h) |
| `reset-password.handler.spec.ts` | 9 tests (inválido/usado/expirado, transacción, failedAttempts reset, evento, bcrypt rounds) |
| `send-password-reset-completed-email.listener.spec.ts` | 2 tests (usuario existe/no existe) |

Verificación global: `npm test` → **17 suites / 165 tests PASS** · `tsc --noEmit` exit 0 · backend `npm run build` exit 0 · frontend `npm run build` exit 0 (6 rutas generadas).

## Decisiones de producto aplicadas

- **Ruta canónica frontend de reset:** `/reset-password?token=...` (grupo público `(auth)`).
- **Comportamiento post-reset:** revocación total de sesiones + email de confirmación + limpieza de lockout (regla D-027).
- **Idioma:** mensajes de error del flujo en español (consistente con el email).

## Observaciones / deuda registrada

- **D-025 (deuda previa):** agregar código `RATE_LIMITED` para 429 al catálogo `error-codes.ts` + `statusToCode` (hoy cae en `INTERNAL_ERROR`).
- **Limpieza de tokens expirados/usados:** no se introdujo cron en MVP (requeriría `@nestjs/schedule`). Mitigación actual: cada nuevo request revoca tokens previos (D-027). Se recomienda revisar cuando la tabla crezca o con decisión de arquitectura explícita.
- **Filas huérfanas en `_prisma_migrations`:** 2 entradas fallidas de `20260904000000_remove_refresh_token_field_from_user_session` (finished_at NULL) detectadas por Database agent; inofensivas, pueden causar prompt de reset en `prisma migrate dev`. Limpieza opcional documentada: DELETE de esas filas.
- **Login stub y auth real:** ~~el frontend tiene login stub funcional (guarda `access_token` en `localStorage`)~~ **RESUELTO en iteración Sección 14** (2026-09-09): el stub fue reemplazado por auth real con cookies HttpOnly (D-001), AuthProvider, refresh automático y protección de rutas vía `proxy.ts` (Next.js 16).
- **Coordinación backend/frontend pendiente:** el frontend debe exigir `FRONTEND_URL`/`NEXT_PUBLIC_API_URL` en cada entorno; documentado en `frontend/.env.example`.

---

# 14. Iteración registrada (2026-09-09): Auth real del frontend (D-001 sin violaciones)

## Objetivo

Eliminar el login stub del frontend (que violaba D-001 guardando `access_token` en `localStorage`) e implementar autenticación real de extremo a extremo: login/registro/verificación de email funcionales, sesión persistente vía cookies HttpOnly, refresh automático del access token, logout y protección de rutas.

## Spec

- `docs/specs/frontend-auth-flow.md` — aprobada por PM (RF-1 a RF-10).

## Implementado (frontend)

| Ítem | Detalle |
| ---- | ------- |
| D-001 | `src/providers/auth-provider.tsx` — AuthProvider con `status: loading/authenticated/unauthenticated`, `user: SessionUser`, `refreshSession`, `clearSession`. Bootstrap con `GET /auth/me` al montar. |
| D-001 | `src/lib/api.ts` — `authApi.login/logout/me/register/verifyEmail` + estrategia de refresh automático: ky `beforeRetry` (401 → `POST /auth/refresh` → reintento máx. 1; refrescos concurrentes coordinados; endpoints públicos excluidos del refresh). |
| D-001 | `src/app/(auth)/login/page.tsx` — reescrito: **sin localStorage**, cookies HttpOnly, redirect respeta `?next=` con protección anti open-redirect. |
| Registro | `src/app/(auth)/register/page.tsx` — firstName/lastName/email/password/confirm, Zod, success → pantalla "Revisa tu email". |
| Verificación | `src/app/(auth)/verify-email/page.tsx` — `GET /auth/verify-email?token=...`, estados loading/success/error. |
| Rutas | `src/proxy.ts` (convención Next.js 16: middleware → proxy) — protección `/dashboard` y `/profile` (sin cookie `access_token` → `/login?next=`); `/login` y `/register` con cookie → `/dashboard`. Matcher excluye API/static/favicon. |
| Layout | `src/app/(dashboard)/layout.tsx` — header HCDV con UserNav (avatar inicial + logout); si sesión expira → redirect `/login?next=`. |
| Dashboard | `src/app/(dashboard)/dashboard/page.tsx` — home mínima: saludo, email, roles, propietario, talleres. |
| Tipos | `src/types/auth.ts` — `SessionUser` (contrato `GET /auth/me`). |

## Decisions técnicas del Tech Lead

- **Next.js 16**: `middleware.ts` renombrado a `proxy.ts` (convención oficial de la versión instalada, verificada en `node_modules/next/dist/docs`).
- **Sin next-auth**: con D-001 (cookies HttpOnly del backend) un AuthProvider ligero + ky es suficiente; next-auth agregaría complejidad sin valor (decisión de implementación dentro de la autoridad del Tech Lead; alineada con `frontend-auth-flow.md` sección 9).
- **Refresh**: ky `beforeRetry` con flag global para no duplicar refrescos concurrentes y exclusión de endpoints públicos.

## Verificación

- `npm run build` → exit 0 (Next.js 16.3.4, Turbopack): 9 rutas generadas + `ƒ Proxy (Middleware)`.
- Rutas: `/`, `/_not-found`, `/dashboard`, `/forgot-password`, `/login`, `/profile`, `/register`, `/reset-password`, `/verify-email`.

## Observaciones / deuda registrada

- **Pruebas E2E pendientes:** no hay test runner de frontend configurado (deuda conocida). El flujo completo (login con cookies en dev localhost:3000 ↔ backend:3001) requiere verificación manual o script E2E; CORS + credentials ya están habilitados en backend.
- **Contrato `/auth/me` a confirmar:** el campo `workshopMemberships` y `roles` fueron tipados en `SessionUser` según el handler backend; confirmar con Backend Tech Lead antes de construir UI dependiente (p. ej. `/profile` avanzado).
- **Splash global:** AuthProvider muestra splash de carga en toda la app mientras resuelve sesión; correcto para evitar flash en páginas autenticadas.
- **Registro no auto-login:** deliberado (verificar email primero); coherente con backend.
- **Deuda previa sin cambios:** RATE_LIMITED para 429 (`error-codes.ts`), cron limpieza de tokens, filas huérfanas en `_prisma_migrations`, evidente en Sección 13.

---

# 15. Registro (2026-09-09): Backend E2E auth + config CORS/FRONTEND_URL (cierre de iteración D-001)

## Objetivo

Cerrar la iteración de auth real del frontend (Sección 14) validando el backend de extremo a extremo y documentando la configuración de orígenes. Sin cambios de producto.

## Decisión de configuración (Tech Lead)

- **`CORS_ORIGIN`** en `.env.example` pasa de `*` a `http://localhost:3000`. Con `cors.credentials: true` (cookies HttpOnly, D-001) el browser rechaza `*` + credentials; el origen debe ser el real (lista separada por comas permitida). Resuelve el hardening pendiente anotado en `DECISION-PROPOSALS.md` (D-001).
- **`FRONTEND_URL`** agregado a `.env.example` (`http://localhost:3000`, URI validada por Joi). Ya existía en `src/config/envs.ts` (D-028); el ejemplo del entorno no lo reflejaba. El `.env` local ya tenía `CORS_ORIGIN=http://localhost:3000` (verificado, sin cambios).
- Implementación: `.env.example` — 2 líneas de comentario + 1 valor cambiado + bloque nuevo `FRONTEND_URL`. Sin secretos.

## Verificación E2E backend (evidencia registrada)

Backend build + start (`node dist/main.js`, `npm run build` exit 0) sobre PostgreSQL local (50 usuarios seed). Matriz completa en el reporte de cierre del Backend Tech Lead (este ítem). Resumen:

- `POST /api/auth/register` → 201 `{ user }`, sin Set-Cookie (no auto-login). Duplicado → 401 `SESSION_EXPIRED` (no 409 — comportamiento existente, ver observaciones).
- `POST /api/auth/login` → 201 + `Set-Cookie access_token` (HttpOnly, SameSite=Lax, Max-Age=1500) + `refresh_token` (HttpOnly, SameSite=Strict, Max-Age=604800); body `{ user }` sin tokens. CORS verificado: `Access-Control-Allow-Origin: http://localhost:3000` + `Access-Control-Allow-Credentials: true`.
- `GET /api/auth/me` → 200 con `{ id, email, firstName, lastName, avatarUrl, language, status, isVehicleOwner, roles[], workshopMemberships[] }` — payload coincide con `SessionUser` del frontend (excepto `roles[].type` vs `roles[].code`, ver observaciones).
- `POST /api/auth/refresh` → 201, cookies rotadas (nuevo `refresh_token`), body `{ success: true, impersonated: false }`.
- `POST /api/auth/logout` → 201 `{ message }`, cookies limpiadas (`Max-Age=0`); `/auth/me` posterior → 401 `SESSION_EXPIRED`.
- `POST /api/auth/forgot-password` (email desconocido) → 201 con mensaje fijo anti-enumeración; 4º intento → 429 `RATE_LIMITED` (mapeo D-025 confirmado).
- `POST /api/auth/reset-password` (token inválido) → 401 `'Enlace inválido o expirado'`.
- `GET /api/auth/verify-email?token=...` → 400 `VALIDATION_ERROR` (token no UUID) / 404 `NOT_FOUND 'Token inválido'` (UUID inexistente).
- Tests unitarios auth: 6 suites / 37 tests PASS.

## Decisiones de producto aceptadas en el cierre (2026-09-09)

> **Estado: TODAS IMPLEMENTADAS Y VERIFICADAS** (2026-09-09) — ver "Cierre de implementación" al final de esta sección.

### D-031 — Contrato `roles` en `/auth/me`: el backend es la fuente de verdad

- **Decisión:** `GET /auth/me` devuelve `roles[]: { id, type, name, permissions[] }`. El frontend `SessionUser.roles[]` se corrige a ese contrato (`type` en lugar de `code`, + `permissions` opcional).
- **Razón:** el handler y `RoleDto` del backend usan `type` en toda la aplicación; no hay contrato anterior que defina `code`. Frontend debe tipar el payload real.
- **Impacto:** cambio localizado en `frontend/src/types/auth.ts`. Runtime actualmente OK (solo se consume `name`).
- **Alternativas descartadas:** renombrar el campo backend a `code` (cambio breaking sin necesidad real).

### D-032 — Register duplicado → 409 `CONFLICT`

- **Decisión:** `POST /auth/register` con email ya registrado debe responder **409** con código `CONFLICT` y mensaje claro ("Ya existe una cuenta con este email").
- **Razón:** 401 `SESSION_EXPIRED` es semánticamente incorrecto para un registro duplicado (no es un problema de credenciales); la UI de register ya mapea 409 (código D-025).
- **Impacto:** cambio en el handler de register + tests. Revisar que no rompa el flujo de login.
- **Alternativas descartadas:** mantener 401 (contradice semántica y la UI existente); usar 400 (confunde validación).

### D-033 — Limpieza oportunista de tokens de reset expirados/usados (Opción A)

- **Decisión:** en `request-password-reset`, además de la revocación previa (D-027), ejecutar `DELETE` oportunista de tokens `usedAt IS NOT NULL OR expiresAt < now` del mismo usuario.
- **Razón:** mantiene la higiene de `password_resets` sin introducir cron ni dependencia nueva (`@nestjs/schedule`); el endpoint ya está throttled (3/10min), volumen acotado.
- **Impacto:** ~3 líneas en handler/repository + tests. Cero impacto en contratos.
- **Alternativas descartadas:** `@nestjs/schedule` + cron (dependencia nueva sin necesidad real en MVP — rechazada por ahora; revisar cuando la tabla crezca o en staging pre-producción); no limpiar (aceptable a corto plazo pero deja la deuda).

### D-034 — Email de verificación de cuenta → journey frontend

- **Decisión:** el email de verificación de cuenta debe apuntar a `FRONTEND_URL/verify-email?token=...` (página frontend), no directamente al endpoint backend.
- **Razón:** consistencia con D-028 (reset ya usa `FRONTEND_URL`); el frontend ya tiene la página `/verify-email` con UX completa; evitar mostrar texto/JSON del backend al usuario.
- **Impacto:** cambio en `mail.service` (build link con `FRONTEND_URL`) + tests. El endpoint `GET /auth/verify-email` permanece como API consumida por la página.

### Decisiones menores (aceptadas, sin cambio de código)

- **Status 201 vs 200 en POST:** se documenta en specs que los POST responden 201 (default NestJS). No se agrega `@HttpCode(200)` — el frontend maneja cualquier 2xx y el costo de alinear no aporta valor.
- **Mensaje 429 crudo** (`"ThrottlerException: Too Many Requests"`): cosmético; el frontend mapea por `code: RATE_LIMITED`, no por mensaje. Se acepta como deuda menor.
- **Drift seed→DB (roles/permissions):** el rol `user` en DB tiene 13 permissions vs `systemRolePermissions.user = []` en seed. Deuda de mantenimiento de seed, fuera del scope de auth.
- **`verify-email` exige token UUID:** comportamiento razonable y ya documentado en el journey.

## Cierre de implementación (2026-09-09)

| Decisión | Estado | Implementación |
| -------- | ------ | -------------- |
| D-031 | ✅ Implementada | `frontend/src/types/auth.ts` → `roles: Array<{ id; type; name; permissions? }>`. Sin referencias residuales a `roles.code`. Frontend build exit 0 + 19 tests PASS. |
| D-032 | ✅ Implementada | `register.handler.ts` → `ConflictException('Ya existe una cuenta con este email')`. `statusToCode` ya mapeaba 409→CONFLICT. Nuevo spec: `register.handler.spec.ts` (3 tests). Login intacto (401 INVALID_CREDENTIALS). |
| D-033 | ✅ Implementada | `AuthRepository.deleteCleanupPasswordResets(userId)` + `prisma-auth.repository` (DELETE `usedAt != null OR expiresAt < now`). Orden en handler: revoke → delete → create. Spec actualizado (+2 tests). Sin `@nestjs/schedule`. |
| D-034 | ✅ Implementada | `mail.service.sendVerificationEmail` → link `${FRONTEND_URL}/verify-email?token=...`. Cubre register y resend-verification (mismo evento). Nuevo spec: `mail.service.spec.ts` (3 tests; protege también D-028). |
| Menores | ✅ Aceptadas | Spec `frontend-auth-flow.md` documenta 201 (POST), D-032 (409), D-031 (roles.type). Mensaje 429 crudo y drift seed→DB registrados como deuda menor. |

Verificación global: `npm test` → **19 suites / 173 tests PASS** (165 previos + 8 nuevos) · backend `npm run build` exit 0 · frontend `npm run build` exit 0 + `npm test` 19 tests PASS · limpieza de migraciones huérfanas ejecutada (Database) · E2E backend con backend real verificado (Backend Tech Lead).

---

# 16. Registro (2026-09-09): F-010 Registrar Vehículo end-to-end (D-035..D-038)

## Objetivo

Completar el journey F-010 de extremo a extremo (features.md Fase 1): el propietario registra su vehículo desde el frontend, el vehículo queda asociado como owner (VehicleOwnership) y aparece en "Mis vehículos". El backend ya exponía el alta; el trabajo real fue el journey frontend + ajustes menores de robustez backend.

## Spec

- `docs/specs/vehicle-register-flow.md` — aprobada por PM con las 4 decisiones confirmadas.

## Decisiones de producto aceptadas en el cierre (2026-09-09)

> **Estado: TODAS APROBADAS POR PM; IMPLEMENTADAS** — ver "Cierre de implementación" al final de esta sección.

### D-035 — Registro de vehículo solo en contexto PERSONAL (MVP)

- **Decisión:** el alta de vehículo se asocia al `user.id` autenticado como owner; solo aplica en contexto PERSONAL en MVP. Los miembros de taller (WORKSHOP) **no** registran vehículos en esta iteración (post-MVP). El frontend no envía `X-Context-Type` en estas llamadas (default PERSONAL, D-020 A1).
- **Razón:** "el taller no es propietario del vehículo por registrar una atención"; el alta es un acto de propiedad. Evita abrir la semántica WORKSHOP sin una decisión explícita (D-004/D-021).
- **Impacto:** ningún cambio de código requerido en el guard de contexto (el default PERSONAL ya aplica); solo documentación de journey y ausencia del header en el cliente.
- **Alternativas descartadas:** alta en WORKSHOP (requiere Ownership por taller/miembro y semántica de contexto no resuelta — post-MVP).

### D-036 — VIN opcional en MVP

- **Decisión:** `vin` es opcional al crear vehículo. La UI informa que completarlo mejora la trazabilidad, pero no bloquea el registro. `vin` duplicado → 409 CONFLICT con mensaje específico.
- **Razón:** obligar VIN aumenta fricción de alta sin valor probado en MVP; la trazabilidad mejora si se completa, pero el registro con placa es válido.
- **Impacto:** backend — capturar P2002 de `vin`/`engine_number` en `create()` y mapearlo a 409 (antes 500). Frontend — campo VIN opcional con nota.
- **Alternativas descartadas:** VIN obligatorio (fricción); texto libre de VIN (rompe unicidad/trazabilidad).

### D-037 — Placa: formato libre + normalización a mayúsculas

- **Decisión:** placa alfanumérica de 2–10 caracteres. El backend normaliza `trim().toUpperCase()` tanto al buscar como al guardar, impidiendo duplicados "abc123" vs "ABC123". Sin regex por país en MVP.
- **Razón:** el producto no define un formato nacional único; la normalización canonical evita duplicados case-insensitive con costo mínimo.
- **Impacto:** validación DTO (`@Matches(/^[A-Za-z0-9]{2,10}$/)`), normalización en handler (armoniza busca+guarda) y en `findByLicensePlate` (red de seguridad).
- **Alternativas descartadas:** regex por país (MVP multi-país sin decisión); solo trim (no resuelve case-insensitive).

### D-038 — Catálogo opcional, sin texto libre

- **Decisión:** el selector marca → modelo → versión (catálogo) es opcional. Si no se selecciona versión, el vehículo se guarda con `versionId: null` y la UI muestra marca/modelo/versión como "—". No hay campos de texto libre para marca/modelo/versión en esta iteración.
- **Razón:** el catálogo ya existe; el texto libre degradaría la consistencia de datos y complicaría el timeline futuro (F-013).
- **Impacto:** frontend — cascada brands/models/versions on-demand; si el catálogo falla, el registro sigue sin versionId. Backend — sin cambios (versionId ya es opcional).
- **Alternativas descartadas:** texto libre (deuda de normalización de datos); catálogo obligatorio (bloquea registros cuando el catálogo está incompleto).

## Implementado

### Backend (robustez, sin migración — el schema no cambió)

| Ítem | Detalle |
| ---- | ------- |
| D-037 | `register-vehicle.dto.ts` — `@Matches(/^[A-Za-z0-9]{2,10}$/)` (mensaje español). |
| D-037 | `register-vehicle.handler.ts` — `trim().toUpperCase()` antes de `findByLicensePlate` y `create`; pre-check placa → 409 conservado. |
| D-037 | `prisma-vehicle.repository.ts` — `findByLicensePlate()` normaliza su input (red de seguridad). |
| D-036 | `prisma-vehicle.repository.ts` `create()` — captura `PrismaClientKnownRequestError` P2002, inspecciona `meta.target` (`license_plate`/`vin`/`engine_number`) y relanza `ConflictException` con mensaje específico en español; fallback genérico. |
| Contrato | `list-vehicles.handler.ts` — `GET /api/vehicles` devuelve ítems con shape `VehicleResponseDto` (brand/model/version desnormalizados vía include) + ownerships activas + foto primaria + `meta` (antes raw Prisma). |

### Frontend (journey completo)

| Ítem | Detalle |
| ---- | ------- |
| API | `src/lib/api.ts` — `toApiError` + `vehicleApi` (listVehicles, registerVehicle, listBrands, listModels, listVersions) sobre el cliente ky existente (refresh 401 ya integrado); sin `X-Context-Type` (D-035). |
| Tipos | `src/types/vehicle.ts` — `Vehicle`, `VehicleListResponse/Meta`, `VehicleBrand/Model/Version`, `RegisterVehicleInput` (brand/model/version opcionales por tolerancia). |
| Listado | `src/app/(dashboard)/vehicles/page.tsx` — listado con estados loading/error/vacío; CTA "Registrar vehículo"; paginación con `meta`. |
| Formulario | `src/app/(dashboard)/vehicles/new/page.tsx` — RHF + zod (placa 2–10 alfanumérica normalizada; VIN opcional con nota D-036; cascada catálogo on-demand D-038); 409 mapeado por campo (licensePlate/vin) o general (engineNumber); valores preservados en error; post-201 → invalidate + refreshSession + redirect `/vehicles`. |
| UI | `src/components/ui/select.tsx` + `textarea.tsx` (primitivas nativas, patrón shadcn existente). |
| Navegación | `src/app/(dashboard)/dashboard/page.tsx` — card "Mis vehículos"; `src/proxy.ts` — `/vehicles` en `protectedRoutes`. |

## Decisions técnicas del Tech Lead (divergencias a validar)

El Tech Lead emitió `DESIGN-F-010` con 7 decisiones (D1 contrato uniforme, D2 normalización, D3 validación, D4 P2002, D5 sin migración, D6 tests, D7 contrato frontend). Estado de seguimiento:

| Directiva | Estado | Nota |
| --------- | ------ | ---- |
| D1 list vs detail con `VehicleResponseDto` + `meta` | ✅ Implementada | `list-vehicles.handler.ts`. **Validación TL (2026-09-09):** la sub-instrucción `?? []` se descarta deliberadamente — el listado NO incluye `documents` en su query de forma intencional (no hay consumidor en MVP; `?? []` mentiría al consumidor "no tiene documentos" cuando la realidad es "no se consultaron"). Registrada como deuda P2: fix = agregar `documents` al include del list-vehicles handler cuando aparezca un consumidor. |
| D2 normalización en handler (autoritativa) | ✅ Implementada | + red de seguridad en `findByLicensePlate`. |
| D3 validación DTO | ✅ Decisión técnica cerrada | **Validación TL (2026-09-09):** se acepta la normalización en handler/repository (implementación actual) en lugar de `@Transform` en el DTO. Razones: resultado funcional idéntico (D-037 satisfecho); más explícito y testeable; red de seguridad en repository (defensa en profundidad que `@Transform` no brindaría a llamadas directas al repository); no depende de `transform: true` del ValidationPipe. Sin deuda. |
| D4 P2002 → 409 | ⚠️ Deuda P1 aceptada (MVP) | **Validación TL (2026-09-09):** se acepta `ConflictException` (envelope CONFLICT sin `errors.field`) para MVP con un único consumidor controlado. El frontend mapea por texto (`conflictField`) — frágil pero contenido. **Trigger de corrección:** segundo consumidor de `POST /api/vehicles` (mobile/API pública) → bloquear y aplicar fix (~30 líneas, 5 archivos): `CodedHttpException` + `errors.field` en repository y handler, `expectConflictWithMessage` verifica shape, frontend lee `errors.field` en vez de texto. Inconsistencia con patrón `record-mileage` (que sí usa `CodedHttpException` + `errors`) = cosmética. |
| D5 sin migración | ✅ Cumplida | Schema intacto; constraints unique ya existían. |
| D6 tests | ✅ Implementada | 3 specs nuevos (handler, repository, list handler). |
| D7 contrato frontend | ✅ Implementada | Según D1/D7; el frontend tolera shape opcional de brand/model/version. |

**Resultado del escalamiento al Tech Lead (2026-09-09):** los 3 puntos (D1-DTO, D3, D4) fueron validados y aceptados como están — 2 decisiones técnicas cerradas sin deuda (D3) o con deuda P2 condicional (D1), y 1 deuda P1 con trigger explícito (D4). **No se requirió implementación adicional del backend-engineer.**

## Verificación

- Backend: `npm test` → **22 suites / 185 tests PASS** (19/173 previos + 3 suites/12 tests nuevos: register-vehicle.handler, prisma-vehicle.repository, list-vehicles.handler) · `npm run build` exit 0.
- Frontend: `npm test` → **34/34 PASS** (4 suites nuevas: vehicles list 4, register form 5, proxy +3, api +3) · `npm run build` exit 0 (rutas `/vehicles` y `/vehicles/new` prerenderizadas; proxy activo).
- Sin cambios de schema; sin migraciones; sin nuevas dependencias (RHF + zod ya estaban en el proyecto).

## Observaciones / deuda registrada

- **Puntos del Tech Lead a validar** (escalados el 2026-09-09; no los resuelve el PM):
  1. `vehicle-response.dto.ts` `?? []` no aplicado → key-drifting list vs detail persiste en `documents`.
  2. `@Transform` del DTO omitido por el engineer (divergencia deliberada documentada).
  3. Envelope 409 sin `errors.field` tipado (usa `ConflictException` en vez de `CodedHttpException`).
- **Mensajes de error en español:** el pre-check de placa ahora responde en español (el snapshot de la spec §5 lo tenía en inglés — el AC §10 y el journey 6.2 exigen español). Sin consumidores previos del mensaje en inglés; el `code` (`CONFLICT`) no cambia.
- **`engineNumber` no está en el formulario MVP:** su 409 se muestra como error general de submit (no es campo del form).
- **E2E pendiente:** el journey completo aún no se verificó contra el backend real con base de datos (tests unitarios + build verdes). QA debe correr el flujo completo (registro → listado → dashboard isVehicleOwner) antes del cierre formal.

## Cierre de implementación (2026-09-09)

| Decisión | Estado | Implementación |
| -------- | ------ | -------------- |
| D-035 | ✅ Aprobada e implementada | Frontend sin `X-Context-Type`; ownership automático por el repository existente. |
| D-036 | ✅ Aprobada e implementada | VIN opcional en formulario (nota de trazabilidad); P2002 vin/engine → 409. |
| D-037 | ✅ Aprobada e implementada | `@Matches` 2–10 + normalización trim/UPPER en handler y `findByLicensePlate`. |
| D-038 | ✅ Aprobada e implementada | Cascada catálogo on-demand; registro sin versionId funciona; UI "—" ante ausencia. |
| Contrato list | ✅ Implementada (validación TL pendiente) | `GET /vehicles` con shape `VehicleResponseDto` + `meta`; divergencias D1-DTO/D3/D4 registradas arriba. |

Verificación global: backend `npm test` 22 suites / 185 PASS · backend `npm run build` exit 0 · frontend `npm test` 34/34 PASS · frontend `npm run build` exit 0.

---

# 17. Registro (2026-09-09): QA E2E F-010 + mini-iteración de corrección (F-1/F-2)

## Objetivo

Ejecutar el plan de QA E2E de F-010 (Registrar Vehículo) contra backend real + BD local, verificar el journey UI, y corregir los hallazgos detectados antes de dar por cerrada la iteración.

## Cobertura QA (ejecutada 2026-09-09)

### API / BD (backend-engineer) — 12 casos en primera pasada
| Resultado | Casos |
|---|---|
| **PASS** (10) | Login seed 201+cookies; ownership en BD correcta; placa duplicada lowercase→409 (D-037); VIN→409 sin 500; engineNumber→409 sin 500; sin sesión→401; `GET /vehicles` con `meta` + shape desnormalizado; `GET /:id` 200/403/404; catálogo cascada 200; POST sin versionId→201 `versionId:null` (D-038); listado con ownerships activas. |
| **FAIL parcial** (1) | **F-1:** `POST /api/vehicles` con `versionId` válido → 201 pero `brand/model/version: null` (AC §10 no cumplido; `create()` sin include). |
| **FAIL integración** (1) | **F-2:** 9/10 versiones del catálogo seed con IDs `00000000-...-0001..009` rechazadas con 400 por `@IsUUID()` (seed, no DTO). En UI real, elegir la mayoría de las versiones del catálogo → 400. |

### UI (frontend-tech-lead) — 10 casos
8 PASS · 1 PARTIAL (QA-U5: manejo 409 engineNumber/fallback correcto en código, sin tests — LOW) · 0 FAIL.
4 vacíos de cobertura LOW: test 409 engineNumber, test 409 fallback, test dashboard card "Mis vehículos", edge cases zod (min/max placa, rango años). 34/34 tests PASS + build OK (rutas `/vehicles` y `/vehicles/new` generadas).

## Validación técnica (Tech Lead)

- **F-1:** causa raíz confirmada (`vehicle.create` sin include; el patrón ya existía en list/get). Decisión: agregar `include: { version: { include: { model: { include: { brand: true } } } } }` en `create()` (único round-trip, consistente con list/detail). Descartado refetch tras create (ventana de carrera) y handler-lectura (viola patrón).
- **F-2:** `@IsUUID()` en class-validator 0.15.1 delega a `validator` con `version='all'` — verificado empíricamente: **`@IsUUID('all')` NO acepta los IDs del seed** (fallan por dígito de versión `0`; solo `'loose'` los aceptaría). El DTO es correcto; el defecto es del **seed**. Opciones: A) re-seed con v4 deterministas (recomendada), B) re-seed sin id explícito (rompe idempotencia), C) `@IsUUID('loose')` (deuda fallback, degrada contrato), D) `'all'` (no resuelve).

## Correcciones aplicadas y verificadas (10/10 PASS en re-QA)

### F-1 (commit `f8d6654`) — hidratación en create
- `prisma-vehicle.repository.ts` `create()`: + include de `version.model.brand` (idéntico a list/get).
- `vehicle.repository.ts`: tipo de retorno con relación hidratada (sin mover al DTO para evitar dependencia repositorio→DTO).
- Tests: +1 en `prisma-vehicle.repository.spec.ts` (assert include) + nuevo `vehicle-response.dto.spec.ts` (2 casos: con rama poblada → nombres; sin versión → `null`, no rompe).
- Verificación: 23 suites / 188 tests PASS + build OK + e2e 201 con `brand:"Toyota", model:"Corolla", version:"1.8 XLI"`.

### F-2 (commit `e07cf9b`) — IDs de catálogo v4 deterministas
- **Estrategia (Database):** migración de datos versionada (no re-seed directo) porque 2 vehículos reales referenciaban `...007`/`...008`. Re-key en sitio (`UPDATE vehicle_versions SET id = <v4> WHERE id = <v0>` × 9) aprovechando `ON UPDATE CASCADE` de la FK (actualiza automáticamente los vehículos referenciantes; atómico; no-op en BD frescas).
- Migración: `prisma/migrations/20260909000001_fix_catalog_version_ids/migration.sql` (SQL puro, sin cambios de schema).
- `prisma/seed.ts`: 9 IDs `00000000-0000-0000-...-0001..009` → `00000000-0000-4000-8000-...-0001..009` (v4 deterministas; `crypto.randomUUID()` descartado por idempotencia).
- Verificación: seed idempotente (doble `db:seed`, sin duplicados), catálogo expone solo v4, POST 201 con versión del catálogo (antes 400).
- **Regla para el futuro:** el patrón `00000000-...` determinista es correcto para catálogo semilla vía upsert, pero **no debe usarse para entidades de usuario** (vehicles/users).

## Re-QA de cierre (backend-engineer) — 10/10 PASS

QA-2 (registro con versión → brand/model/version no-null; sin versión → null, D-038) · QA-5 (placa/VIN/engine duplicados → 409, no 500) · QA-6 (listado/detalle desnormalizados, 403/404, catálogo sin IDs v0). BD restaurada a estado previo (4 vehículos, 10 versiones; registros de prueba eliminados en transacción).

## Deuda / decisiones pendientes detectadas en el cierre

1. **Bug pre-existente `DELETE /api/vehicles/:id` → 500** (descubierto por Database, NO introducido por F-2): el handler borra físicamente cuando no hay historial, pero `VehicleOwnership.vehicle` es `onDelete: Restrict` → `prisma.vehicle.delete` falla con P2003 para todo vehículo creado vía API. Decisión del TL recomendada: **ticket separado** (probablemente ampliar `hasHistory` a ownerships y/o borrar ownerships sin historial en la misma transacción). **No bloquea** la iteración F-010; se agenda para F-011 o próxima iteración de vehículos.
2. **Baseline QA con datos de prueba previos:** `QA2ZZZ9` y `QA11PLACA` (owner user2) permanecen como vehículos de desarrollo. Decisión de depuración: Database/Tech Lead pueden limpiarlos en una pasada dedicada.
3. **Proceso backend en 3001:** quedó corriendo el `dist` nuevo con F-1 (PID 25180 al cierre). Entorno de dev; finalizable si no debe quedar procesos colgados.
4. **Datos QA primera pasada vs baseline:** los criterios del QA asumieron baseline "4 vehículos"; los registros QA previos forman parte de ese conteo. Documentado para no volver a contar como pérdida.

# 18. Registro (2026-09-11): F-011 Editar Veh�culo end-to-end (D-039..D-043)

## Objetivo

Completar el journey de edici�n de veh�culo (F-011) de extremo a extremo: el owner edita sus veh�culos desde "Mis veh�culos" con PATCH parcial, duplicados a 409, normalizaci�n de placa, y persistencia de null al vaciar campos opcionales.

## Decisiones de producto confirmadas (2026-09-11)

### D-039 � Solo el owner puede editar
- `PATCH /api/vehicles/:id` usa `assertVehicleOwned` (no `assertVehicleAccess`). Usuarios con acceso compartido consultan (GET) pero no editan en MVP.
- La UI solo muestra "Editar" cuando `ownerships` tiene `type: 'owner'` activa (verificado por `o.userId === user.id && o.type === 'owner' && !o.endsAt`).
- Alternativas descartadas: permitir edici�n a co-owners (equivaldr�a a transferencia informal, fuera de MVP); mantener `assertVehicleAccess` (habilitar�a edici�n a cualquier acceso compartido).

### D-040 � Campos editables = todos los del alta, en PATCH parcial
- Mismos campos de `RegisterVehicleDto`, solo los enviados. Corregir el VIN mal registrado es leg�timo: el `id` y el historial permanecen.

### D-041 � Duplicados al editar ? 409, no 500
- `P2002` (placa/VIN/engine) en `update()` se traduce igual que en register (mensaje espec�fico; reuso de `mapUniqueViolation`).

### D-042 � Normalizaci�n de placa tambi�n al editar
- `trim().toUpperCase()` antes de buscar/guardar en el update (igual que D-037).
- Solo condicional: si `licensePlate` no viene en el PATCH, no se toca (guard `typeof === 'string'`; nunca `undefined`?`null`).

### D-043 � Vaciar campos opcionales en edici�n persiste null
- Campo opcional de texto/n�mero vaciado por el usuario (`vin`, `engineNumber`, `color`, `notes`, `manufactureYear`, `modelYear`) se env�a como `null` expl�cito ? backend persiste NULL.
- **El cat�logo (`versionId`) NUNCA viaja `null`:** si no cambia, se omite (`undefined`) para no borrar la rama (RF-2). `licensePlate` es obligatoria y no se vac�a.
- Comprobado emp�ricamente por backend: `class-validator 0.15.1` con `@IsOptional()` acepta `null`; `null` en Prisma = SET NULL (vs `undefined` = no tocar); columnas opcionales son nullable en schema. Sin cambios de producci�n backend necesarios para D-043 � solo tests (6 nuevos).

## Decisiones t�cnicas validadas por el Tech Lead (2026-09-11)

1. **Controller PATCH**: `assertVehicleOwned` (D-039) + el 200 DEBE devolver `VehicleResponseDto.from(vehicle)` (mismo patr�n que `create()`/`findOne()`; sin esto el 200 respond�a raw Prisma anidado). Verificado en c�digo y smoke e2e.
2. **P2025 (registro no encontrado en `update()`) ? NO se mapea.** El engineer verific� con docs oficiales que `prisma.model.update` con `where` inexistente lanza P2025 (no P2001). TL acept� el no-mapeo: coherente con el proyecto (0 mapeos P2025 existentes; 404 v�a `findById` pre-operaci�n; race window �nfimo y solo con hard-delete de veh�culo sin historial).
3. **No-op PATCH `{}` sin hidratar ? aceptado como deuda.** Edge case solo alcanzable con body literal `{}` (el frontend siempre env�a el form completo). Hidratar exigir�a cambiar la interfaz `VehicleRepository.findById`: costo desproporcionado. Deuda registrada.
4. **`brandId`/`modelId` agregados a `VehicleResponseDto` (cambio exigido por el TL).** Riesgo ~0 verificado (specs usan asserts por propiedad, no `toEqual` completo). Elimina el workaround de preselecci�n de cat�logo por nombre en el frontend (colisiones de nombres; edge case del no-op). Reemplazo del workaround por IDs en la cascada = follow-up de frontend.

## Cambios t�cnicos aplicados

### Backend (commit `78c2619`)
- `vehicles.controller.ts` PATCH `:id`: `assertVehicleOwned` + `VehicleResponseDto.from` (shape aplanado en 200).
- `update-vehicle.handler.ts`: guard PATCH `{}` ? no-op 200 sin llamar a `update()`; normalizaci�n placa D-042 condicional; sin eventos nuevos.
- `prisma-vehicle.repository.ts` `update()`: include `version.model.brand` (id�ntico a create/list/get), P2002?409 reusando `mapUniqueViolation`, red de seguridad D-042 condicional (`typeof licensePlate === 'string'`).
- `vehicle.repository.ts`: tipo de retorno `update` ? `HydratedVehicle` id�ntico a `create()`.
- `vehicle-response.dto.ts`: + `brandId`/`modelId` (aditivo, desde relaci�n ya hidratada).
- Tests: 24 suites / 206 tests (handler update 8, repository update 17, DTO 2; +6 por D-043).
- Smoke e2e (backend 3001): 200 aplanado con brand/model/version � 409 placa duplicada � 403 no-owner � 404 inexistente � PATCH `{}` 200 no-op � `{ color: null }` persiste NULL. Registros QA limpiados en transacci�n.

### Frontend (commit `8f518c1`)
- `api.ts`: + `getVehicle`/`updateVehicle`; `types/vehicle.ts`: `UpdateVehicleInput` con opcionales `string | null`.
- P�gina `/vehicles/[id]/edit`: precarga GET /:id, cascada con preselecci�n, PATCH parcial, manejo 409/403/404/401, invalidate + redirect.
- `vehicle-form-schema.ts` (m�dulo compartido): `vehicleFormSchema` extra�do de `new/page.tsx` (alta y edici�n no divergen) + `toEditVehicleInput` (regla D-043: vac�o con prefill contenido ? `null`; vac�o sin prefill ? omitido; `versionId` cambia solo si se modific�).
- Listado: bot�n "Editar" solo owner (D-039).
- Tests: 6 files / 51 tests (+4 D-043: `color: null`, omitir vac�os, `manufactureYear: null` no `0`, `versionId` omitido si no cambia) + build OK (ruta din�mica `/vehicles/[id]/edit`).

## Deuda / decisiones pendientes detectadas en el cierre

1. **Deuda de contrato: no-op PATCH `{}`** ? 200 con `versionId` poblado pero `brand/model/version: null` (fix = hidratar retorno del no-op, follow-up barato; no alcanzable por consumidor MVP).
2. **Deuda preexistente (nueva, TL): `findById` no filtra `deletedAt`** ? PATCH sobre veh�culo soft-deleted (ADR-005) editar�a el registro. Backlog; NO accionar en la misma iteraci�n.
3. **Deuda de validaci�n (backend-engineer, escalada): `PartialType()` agrega `@IsOptional()` a TODOS los campos, incluido `licensePlate`** ? `PATCH` con `{ licensePlate: null }` pasar�a validaci�n y reventar�a en `null.trim()` ? 500 (deber�a ser 400). El frontend nunca lo env�a (zod bloquea vac�o; D-043 no aplica a placa). Fix sugerido (fuera de alcance): rechazar null en `licensePlate` en `UpdateVehicleDto` (ej. `@ValidateIf` + `@IsNotEmpty()`) + test de validaci�n. Backlog.
4. **Detecci�n de owner en frontend por `ownerships`** (`userId` + `type` + `!endsAt`): depende del shape real del listado; verificado en tests. Si el contrato del listado cambia, revisitar.
5. **Bug pre-existente `DELETE /api/vehicles/:id` ? 500** (Secci�n 17): sigue como ticket separado, NO tocado en F-011.
6. **Proceso backend en 3001:** qued� corriendo el `dist` nuevo (PID 10364 al cierre). Entorno de dev; finalizable si no debe quedar procesos colgados.

# 19. Registro (2026-09-11): F-012 Buscar Veh�culo end-to-end (D-044..D-045)

## Objetivo

Permitir al propietario encontrar un veh�culo dentro de su lista escribiendo parte de la placa (b�squeda en vivo con debounce), manteniendo el shape y contrato existentes del listado.

## Decisiones de producto confirmadas (2026-09-11)

### D-044 � B�squeda por placa parcial en la lista del propietario
- `GET /api/vehicles?q=` filtra por `licensePlate` con `contains` + `mode: 'insensitive'` (case-insensitive), combinado con AND al scope de ownership existente.
- `q` se normaliza con `trim()`; m�nimo 2 caracteres tras trim para filtrar; con menos, se comporta como sin `q`.
- Param aditivo en la ruta existente (NO se cre� `/vehicles/search`: `@Get(':id')` ya registrado en `vehicles.controller.ts` L356 har�a que una ruta `/vehicles/search` mal ordenada fuera capturada por `:id` ? 404/400).
- Sin permiso nuevo: el listado es ownership-scoped, no permission-gated (verificado).
- Alternativas descartadas: b�squeda por VIN/n�mero de motor (no son datos que el due�o recuerde de memoria); filtros marca/modelo/a�o (navegaci�n de cat�logo, no "encontrar mi veh�culo"); ruta separada; query-DTO en esta feature.

### D-045 � Filtros de cat�logo post-MVP
- Filtros por marca/modelo/a�o quedan post-MVP (el owner busca por placa, dato que ya conoce). Cuando lleguen, es el momento coordinado de introducir `ListVehiclesQueryDto` (hoy params crudos + interfaz interna, decisi�n TL).

## Decisiones t�cnicas validadas por el Tech Lead (2026-09-11)

1. **Param aditivo en `GET /api/vehicles?q=`** (no ruta separada) � evita foot-gun de `@Get(':id')`.
2. **Donde: `licensePlate: { contains, mode: 'insensitive' }` combinado con AND con `ownerships.some(userId, endsAt: null)`** � preserva la frontera IDOR (solo se busca dentro de la lista del owner). `meta.total` filtrado autom�ticamente (`count({ where })` reusa la misma variable).
3. **Mantener params crudos + interfaz interna** (`q?: string` en `ListVehiclesQuery`). NO crear query-DTO: ser�a el primero del codebase, sumar�a casos 400 nuevos (rompiendo "sin 4xx nuevos") y crear�a patr�n nuevo a mitad de feature. Cu�ndo s�: con filtros marca/modelo (D-045).
4. **Guard `typeof query.q === 'string'`** obligatorio: `?q=a&q=b` entrega array y `.trim()` explotar�a. Normalizaci�n en el handler (testeable sin HTTP). Hardening `slice(0, 20)` (placa VarChar(20)).
5. **Frontend: `placeholderData: keepPreviousData` OBLIGATORIO** (React Query v5): con queryKey din�mico cada cambio de `q` crea una query sin cach�; sin el placeholder, `isLoading` desmontar�a la lista en cada tipeo (regresi�n UX). Hook `useDebounce` propio en `frontend/src/hooks/` (sin dependencias).
6. **`contains` (`%q%`) no usa el �ndice B-tree** (ni `@unique` ni `@@index([licensePlate])` � ese �ndice es redundante con el unique y no da soporte de b�squeda). Riesgo Baja en MVP: volumen post-ownership es de docenas de filas. Trigram/full-text = decisi�n aparte si crece.
7. **Quirk LIKE wildcards** (`%`/`_` en la entrada act�an como wildcards; `q="A_B"` matchea "AXB"): sem�ntica inesperada, no es issue de seguridad (parametrizado), aceptada y documentada en spec �12.

## Cambios t�cnicos aplicados

### Backend (commit `f9c6917`)
- `vehicles.controller.ts` `findAll`: + `@Query('q') q?: string` ? handler.
- `list-vehicles.handler.ts`: `q?: string` en `ListVehiclesQuery`; normalizaci�n (guard `typeof` + `trim()` + m�nimo 2 + `slice(0,20)`); `where` tipado `Prisma.VehicleWhereInput` combinando ownership AND `licensePlate contains/insensitive`; orden/include/paginaci�n intactos. Import `Vehicle` sin uso limpiado.
- Tests: 24 suites / 214 tests (6 nuevos: composici�n AND, insensitive, trim, <2 chars, no-string sin crash, sin match ? data [] + meta.total 0). Los 3 tests de regresi�n F-010 del listado pasan sin modificaci�n (RF-2).

### Frontend (commit `ae6dae8`)
- `frontend/src/hooks/use-debounce.ts` (nuevo): debounce gen�rico ~300ms, sin dependencias.
- `api.ts` `listVehicles`: firma `{ page?, limit?, q? }`; `searchParams` con `q` solo si est� presente (no enviar `q=""`).
- `/vehicles/page.tsx`: input controlado (label sr-only, placeholder "Buscar por placa�", `maxLength={20}`, bot�n limpiar con aria-label), `useDebounce` ? `effectiveQ` (trim >= 2), queryKey din�mico `["vehicles", PAGE, LIMIT, effectiveQ]`, `placeholderData: keepPreviousData`, estados vac�os ramificados por `effectiveQ` ("No se encontraron veh�culos con esa placa" + CTA limpiar vs. vac�o real). Invalidaci�n de F-011 intacta (match por prefijo).
- Tests: 6 files / 56 tests (p�gina +3 con fake timers y `settle()` 4-pass; api +2 con/sin q). `/vehicles` sigue est�tica en build.

## Deuda / decisiones pendientes detectadas en el cierre

1. **Soft-deleted en listado/b�squeda** sigue abierto: ticket follow-up sist�mico de soft-delete filtering (Secci�n 18, �tem 2). La b�squeda hace los veh�culos retirados levemente m�s "descubribles" (un owner puede buscar una placa dada de baja); mismo defecto que el listado, no es nuevo. Decisiones de producto pendientes: archivo/retirados, reactivaci�n, 404 vs 410.
2. **`?page=abc` ? NaN** en el listado (deuda preexistente): se arreglar� con el query-DTO cuando lleguen los filtros marca/modelo (D-045 post-MVP). NO se toc� en F-012.
3. **Import `Vehicle` limpiado** en `list-vehicles.handler.ts` (deja `import { Prisma }`), tras el escaneo del engineer � sin cambio funcional.
