# HCDV â€” Decision Register

> Registro Ãºnico de decisiones de producto, dominio, arquitectura y UX que condicionan la evoluciÃ³n de Historia ClÃ­nica Digital Vehicular (HCDV).

**Estado del documento:** Activo
**Ãšltima actualizaciÃ³n:** 2026-09-09
**Producto:** Historia ClÃ­nica Digital Vehicular (HCDV)
**Alcance:** MVP y decisiones estructurales que condicionan su evoluciÃ³n

---

## 1. PropÃ³sito

Este documento mantiene el registro oficial de decisiones que afectan:

- producto y journeys;
- modelo funcional;
- dominio;
- arquitectura;
- persistencia;
- autenticaciÃ³n y autorizaciÃ³n;
- contratos Backend â†” Frontend;
- seguridad;
- evoluciÃ³n futura del sistema.

Su objetivo es evitar que decisiones importantes queden implÃ­citas en cÃ³digo, documentaciÃ³n aislada o conversaciones entre agentes.

Una decisiÃ³n registrada aquÃ­ debe ser considerada **fuente de verdad** para los agentes de desarrollo, salvo que exista posteriormente una decisiÃ³n explÃ­cita que la modifique o superseda.

---

# 2. Estados

| Estado       | Significado                                          |
| ------------ | ---------------------------------------------------- |
| `PROPOSED`   | Propuesta inicial pendiente de evaluaciÃ³n            |
| `PENDING`    | Requiere una decisiÃ³n adicional antes de implementar |
| `ACCEPTED`   | DecisiÃ³n aprobada y aplicable                        |
| `REJECTED`   | DecisiÃ³n explÃ­citamente descartada                   |
| `SUPERSEDED` | Fue reemplazada por una decisiÃ³n posterior           |

### Regla fundamental

Los agentes **NO deben implementar silenciosamente una decisiÃ³n `PENDING`**.

Si una implementaciÃ³n requiere resolver una decisiÃ³n pendiente, el agente debe:

1. identificar la decisiÃ³n;
2. explicar por quÃ© bloquea el trabajo;
3. proponer una resoluciÃ³n;
4. esperar aprobaciÃ³n cuando corresponda.

---

# 3. JerarquÃ­a de fuentes de verdad

En caso de contradicciÃ³n, utilizar el siguiente orden:

1. Decisiones `ACCEPTED` de este documento.
2. ADRs aceptados.
3. Product Blueprint / especificaciÃ³n funcional vigente.
4. Baselines tÃ©cnicos.
5. DocumentaciÃ³n de agentes.
6. CÃ³digo existente.
7. Suposiciones o convenciones.

El cÃ³digo existente **no prevalece automÃ¡ticamente** sobre una decisiÃ³n aceptada.

Cuando el cÃ³digo contradiga una decisiÃ³n aceptada, debe considerarse legacy, bug o deuda tÃ©cnica hasta determinar lo contrario.

---

# 4. Principios transversales

## 4.1 MVP pragmÃ¡tico

El MVP debe priorizar:

- claridad funcional;
- seguridad;
- consistencia de datos;
- mantenibilidad;
- velocidad de evoluciÃ³n.

No se introducen abstracciones o patrones Ãºnicamente por anticipaciÃ³n de necesidades futuras.

---

## 4.2 Modular Monolith

El backend del MVP utiliza un **modular monolith**.

No se introducen microservicios, brokers o comunicaciÃ³n distribuida salvo decisiÃ³n explÃ­cita posterior.

---

## 4.3 DDD no es requisito del MVP

El MVP no adopta DDD tÃ¡ctico como metodologÃ­a obligatoria.

Se pueden utilizar conceptos de dominio cuando aporten claridad, pero no deben introducirse:

- aggregates artificiales;
- value objects innecesarios;
- domain events complejos;
- bounded contexts formales;
- capas adicionales sin beneficio concreto.

---

## 4.4 Historial como informaciÃ³n protegida

La informaciÃ³n histÃ³rica del vehÃ­culo debe preservarse.

Las relaciones histÃ³ricas importantes utilizan `RESTRICT` cuando corresponde, evitando que eliminar una entidad actual destruya o invalide artificialmente el historial.

---

# 5. Registro de decisiones

## D-001 â€” Estrategia de autenticaciÃ³n

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Security
**Prioridad:** P0

### DecisiÃ³n

Para clientes web/browser, HCDV utilizarÃ¡ **HttpOnly Cookies** como mecanismo oficial de autenticaciÃ³n.

El backend mantiene soporte para:

- `access_token` mediante cookie HttpOnly;
- `refresh_token` mediante cookie HttpOnly;
- Bearer tokens para clientes no-browser que explÃ­citamente los necesiten.

### Regla

El frontend web oficial **no debe administrar tokens de acceso mediante JavaScript**.

El flujo browser utiliza:

```text
Browser
   â†“
HttpOnly Cookies
   â†“
NestJS API
   â†“
JWT authentication
```

NextAuth puede utilizarse como mecanismo de integraciÃ³n de sesiÃ³n del frontend, pero **no reemplaza la autoridad de autenticaciÃ³n del backend**.

### Bearer

Bearer no queda eliminado del sistema.

Su uso queda destinado a:

- clientes machine-to-machine;
- integraciones;
- testing;
- futuros clientes no-browser;
- otros consumidores explÃ­citamente autorizados.

No debe utilizarse como mecanismo alternativo implÃ­cito para el frontend web.

### Implicaciones

Backend:

- mantener rotaciÃ³n de refresh tokens;
- mantener detecciÃ³n de reuse;
- revisar configuraciÃ³n de cookies;
- corregir CORS;
- activar protecciÃ³n contra abuso en login/refresh;
- eliminar configuraciÃ³n JWT obsoleta.

Frontend:

- utilizar `credentials: include`;
- no almacenar access/refresh tokens en `localStorage`;
- mantener refresh automÃ¡tico;
- documentar correctamente el flujo real.

### Seguridad

SameSite ayuda a mitigar CSRF, pero no debe considerarse la Ãºnica protecciÃ³n.

La configuraciÃ³n final debe contemplar:

- CORS explÃ­cito;
- validaciÃ³n de `Origin`/mecanismo equivalente cuando corresponda;
- polÃ­tica correcta de cookies;
- protecciÃ³n especÃ­fica de endpoints sensibles.

---

# D-002 â€” Fuente de verdad para `isVehicleOwner`

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization / UX
**Prioridad:** P0

### DecisiÃ³n

La propiedad de un vehÃ­culo se determina exclusivamente a partir de **VehicleOwnership**.

No debe inferirse mediante:

```text
role === "user"
AND
workshopMemberships.length === 0
```

ni mediante cualquier combinaciÃ³n equivalente de roles, memberships o heurÃ­sticas de frontend.

### Regla

`VehicleOwnership` es la fuente de verdad.

El frontend puede utilizar un flag derivado como:

```text
isVehicleOwner
```

cuando sea Ãºtil para UX, pero dicho flag es una **proyecciÃ³n**, no una fuente de autorizaciÃ³n.

### AutorizaciÃ³n

Las operaciones sobre un vehÃ­culo deben evaluarse utilizando las relaciones reales:

```text
VehicleOwnership
VehicleAccess
WorkshopMembership
Platform permissions
Active Context
```

segÃºn corresponda.

### `/auth/me`

El contrato de `/auth/me` puede exponer informaciÃ³n derivada Ãºtil para la sesiÃ³n, pero **no se obliga a incluir la lista completa de vehÃ­culos/ownerships del usuario**.

La informaciÃ³n vehicle-specific debe obtenerse desde los recursos correspondientes.

Por lo tanto:

- `/auth/me` representa capacidades/contexto de sesiÃ³n;
- Vehicle endpoints representan ownership/access concreto.

### Regla de seguridad

El frontend nunca debe utilizar `isVehicleOwner` como mecanismo de autorizaciÃ³n.

La autorizaciÃ³n definitiva ocurre en backend.

### Amendment 1 â€” Contrato de sesiÃ³n (2026-09-04)

`GET /auth/me` expone:

```text
isVehicleOwner: boolean
```

como campo **requerido** del contrato, proyecciÃ³n derivada de la existencia de al menos un `VehicleOwnership` activo (`endsAt: null`), de cualquier tipo (`owner`, `co_owner`, `company`).

Reglas:

- Es proyecciÃ³n de UX/routing Ãºnicamente; **nunca** autorizaciÃ³n.
- `VehicleAccess` **no** alimenta el flag (sigue siendo ownership-based exclusivamente).
- No se agrega a la sesiÃ³n NextAuth (sesiÃ³n permanece lean).
- Es **context-independiente**: verdadero aunque el Active Context sea WORKSHOP.
- EvoluciÃ³n del contrato aditiva Ãºnicamente. `ownershipCount`/`ownershipIds` no se exponen por ahora (aditivo futuro si mobile lo requiere).
- `co_owner`/`company` alimentan el flag; los **derechos** de co-owner quedan sujetos a D-018 sin alterar necesariamente la proyecciÃ³n.

---

# D-003 â€” Identity vs User

**Estado:** `ACCEPTED`
**Tipo:** Domain / Architecture
**Prioridad:** P0

### DecisiÃ³n

El MVP **NO introduce una entidad `Identity` separada**.

Se ratifica la decisiÃ³n conceptual de ADR-001 T1:

> Durante el MVP, `User` representa tanto la cuenta autenticada como el actor del sistema.

### Implicaciones

No se migrarÃ¡n relaciones actuales desde `User` hacia una entidad `Identity`.

No se agregarÃ¡ una abstracciÃ³n paralela Ãºnicamente para anticipar escenarios futuros.

Las relaciones actuales continuarÃ¡n utilizando `User` donde corresponda.

### SeparaciÃ³n conceptual

Aunque no exista una tabla `Identity`, conceptualmente deben distinguirse:

```text
Authentication
    â†“
User / Account
    â†“
Actor
```

Esta separaciÃ³n conceptual permite evolucionar posteriormente sin forzar al MVP a implementar el modelo completo.

### Triggers para introducir Identity

La decisiÃ³n deberÃ¡ revisarse cuando aparezca una necesidad real como:

- actores sin cuenta;
- representaciÃ³n de organizaciones como actores;
- perfiles de confianza independientes de cuentas;
- integraciÃ³n multi-tenant mÃ¡s compleja;
- actores externos/API;
- relaciones histÃ³ricas que no correspondan exclusivamente a usuarios registrados.

Hasta entonces, `Identity` permanece como concepto futuro.

---

# D-004 â€” Active Context

**Estado:** `PENDING`
**Tipo:** Architecture / Authorization / Product
**Prioridad:** P0

### DecisiÃ³n parcial aceptada

El concepto de **Active Context** es vÃ¡lido y debe formar parte del modelo de autorizaciÃ³n y resoluciÃ³n de recursos.

Sin embargo, la semÃ¡ntica funcional definitiva todavÃ­a depende de resolver D-019 y D-021.

### Principio

Active Context es una **dimensiÃ³n/input para autorizaciÃ³n y resoluciÃ³n de recursos**.

No es, por sÃ­ mismo, un sistema de autorizaciÃ³n.

Ejemplo:

```text
Authorization
    +
Active Context
    +
Resource
    â†“
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

- El contexto explÃ­cito tiene prioridad sobre inferencias.
- Un `WORKSHOP` debe corresponder a un Workshop Membership vÃ¡lido.
- `PLATFORM` requiere privilegios de plataforma.
- `PERSONAL` representa el Ã¡mbito personal del usuario.
- Un contexto invÃ¡lido no debe degradarse silenciosamente a otro contexto.

### Pendientes

D-019 define quÃ© significa consultar vehÃ­culos bajo `WORKSHOP`.

D-021 define la relaciÃ³n entre contexto de sesiÃ³n, navegaciÃ³n y URL.

Por lo tanto, **no implementar todavÃ­a el modelo frontend definitivo de Active Context** hasta cerrar esas decisiones.

---

# D-005 â€” CareEpisode

**Estado:** `PENDING`
**Tipo:** Domain / Product / Architecture
**Prioridad:** P0

### DecisiÃ³n conceptual

Se acepta la existencia de **CareEpisode** como una entidad nueva y central del dominio.

No se trata de renombrar `ServiceRecord`.

Modelo conceptual:

```text
Vehicle
   â”‚
   â””â”€â”€ CareEpisode
          â”œâ”€â”€ Diagnosis
          â”œâ”€â”€ Estimate
          â”œâ”€â”€ WorkOrder
          â””â”€â”€ ServiceRecord
```

### SemÃ¡ntica

Un `CareEpisode` representa una instancia concreta de atenciÃ³n de un vehÃ­culo.

Puede originarse mediante:

- Appointment;
- walk-in;
- otra entrada explÃ­citamente definida por el producto.

El episodio comienza cuando el vehÃ­culo es efectivamente recibido/ingresado al proceso de atenciÃ³n.

### ServiceRecord

`ServiceRecord` permanece como entidad existente.

No debe realizarse un search/replace conceptual:

```text
ServiceRecord â†’ CareEpisode
```

En el modelo objetivo:

```text
CareEpisode
    â†“
ServiceRecord
```

El ServiceRecord representa el resultado/documentaciÃ³n final de la atenciÃ³n.

### WorkOrder / Estimate

En el modelo objetivo:

```text
CareEpisode
    â”œâ”€â”€ Estimate
    â””â”€â”€ WorkOrder
```

Las relaciones legacy existentes deberÃ¡n migrarse progresivamente.

### Pendiente

El schema definitivo y lifecycle exacto quedan sujetos a:

- D-022 â€” MVP CareEpisode policies;
- D-023 â€” Appointment cancellation after CareEpisode starts.

No implementar todavÃ­a el lifecycle completo basÃ¡ndose Ãºnicamente en la propuesta inicial.

---

# D-006 â€” Repositorios

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### DecisiÃ³n

Los repositories permanecen dentro de sus respectivos mÃ³dulos.

Las interfaces se exponen mediante tokens de inyecciÃ³n.

Ejemplo conceptual:

```text
Module
â”œâ”€â”€ application
â”œâ”€â”€ domain
â”œâ”€â”€ infrastructure
â”‚   â””â”€â”€ repositories
â””â”€â”€ presentation
```

No se crea un repository global transversal salvo necesidad explÃ­cita.

---

# D-007 â€” Commands y Queries

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### DecisiÃ³n

El backend separarÃ¡ conceptualmente:

```text
Commands
Queries
```

No se utilizarÃ¡ `@nestjs/cqrs` para implementar esta separaciÃ³n en el MVP.

La separaciÃ³n es organizacional y semÃ¡ntica, no una obligaciÃ³n de infraestructura.

---

# D-008 â€” Domain Events / Application Events

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### DecisiÃ³n

Los eventos internos del MVP utilizarÃ¡n:

```text
@nestjs/event-emitter
```

mediante `EventEmitter2`.

Los eventos representan hechos ocurridos dentro de la aplicaciÃ³n.

No se introduce Kafka, NATS, RabbitMQ u otro broker para el MVP.

---

# D-009 â€” Ownership vs Access

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization

### DecisiÃ³n

Ownership y Access son conceptos diferentes.

```text
Ownership
    =
relaciÃ³n de propiedad sobre un vehÃ­culo

Access
    =
capacidad de operar/consultar un recurso
```

Una persona puede:

- ser owner sin pertenecer a un workshop;
- tener acceso sin ser owner;
- pertenecer a un workshop sin ser owner;
- tener mÃºltiples relaciones simultÃ¡neas.

Nunca debe inferirse:

```text
Access == Ownership
```

ni:

```text
Workshop Membership == Ownership
```

---

# D-010 â€” Workshop Membership

**Estado:** `ACCEPTED`
**Tipo:** Domain / Authorization

### DecisiÃ³n

La pertenencia de un usuario a un workshop se representa mediante **Workshop Membership**.

Membership no debe mezclarse conceptualmente con:

- ownership;
- plataforma;
- autenticaciÃ³n;
- permisos globales.

Los permisos efectivos dependen del contexto y del rol correspondiente.

---

# D-011 â€” Timeline

**Estado:** `ACCEPTED`
**Tipo:** Domain / Read Model / UX

### DecisiÃ³n

La Timeline se considera una **proyecciÃ³n de informaciÃ³n histÃ³rica**.

No es la fuente primaria de verdad.

Puede combinar informaciÃ³n proveniente de:

- CareEpisodes;
- ServiceRecords;
- WorkOrders;
- Estimates;
- otros eventos histÃ³ricos relevantes.

La Timeline no debe convertirse en un aggregate o entidad transaccional central.

---

# D-012 â€” Vehicle First

**Estado:** `ACCEPTED`
**Tipo:** Product

### DecisiÃ³n

La experiencia del producto se organiza alrededor del vehÃ­culo.

El vehÃ­culo constituye el eje principal de:

- historial;
- mantenimiento;
- atenciÃ³n;
- documentos;
- ownership;
- acceso;
- timeline.

El usuario es importante como actor, pero la unidad funcional principal del producto es el vehÃ­culo.

---

# D-013 â€” Identidad del vehÃ­culo

**Estado:** `ACCEPTED`
**Tipo:** Domain / Product

### DecisiÃ³n

El vehÃ­culo posee una identidad interna canÃ³nica.

Los identificadores externos, como:

- patente;
- VIN/chassis;
- otros identificadores,

son atributos/identificadores externos del vehÃ­culo y no deben convertirse automÃ¡ticamente en la identidad primaria interna.

La patente puede utilizarse como mecanismo de bÃºsqueda/identificaciÃ³n operativa, pero no debe asumirse que es la identidad inmutable del vehÃ­culo.

---

# D-014 â€” Historical Data Protection

**Estado:** `ACCEPTED`
**Tipo:** Data / Domain

### DecisiÃ³n

Los datos histÃ³ricos deben preservarse incluso cuando cambien las relaciones actuales.

Esto aplica especialmente a:

- ownership;
- transfers;
- service history;
- CareEpisodes;
- WorkOrders;
- Estimates;
- ServiceRecords.

Las relaciones histÃ³ricas relevantes utilizarÃ¡n `RESTRICT` cuando corresponda.

No deben introducirse cascades que destruyan silenciosamente informaciÃ³n histÃ³rica.

---

# D-015 â€” MVP como Modular Monolith

**Estado:** `ACCEPTED`
**Tipo:** Architecture

### DecisiÃ³n

El backend del MVP serÃ¡ un modular monolith construido con NestJS.

No se introducen microservicios como mecanismo de separaciÃ³n funcional.

La modularidad debe lograrse mediante lÃ­mites claros entre mÃ³dulos.

---

# D-016 â€” Refresh durante impersonation

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture
**Prioridad:** P0

### DecisiÃ³n

Durante una sesiÃ³n de impersonation, el refresh automÃ¡tico **no debe prolongar indefinidamente la impersonation**.

La sesiÃ³n impersonada tiene una duraciÃ³n limitada de:

```text
1 hora
```

Una vez expirada:

- el token impersonado deja de ser vÃ¡lido;
- no se genera automÃ¡ticamente otro token impersonado;
- el administrador debe iniciar nuevamente la impersonation si necesita continuar.

### RazÃ³n

Esto limita el tiempo de exposiciÃ³n de una sesiÃ³n privilegiada y evita convertir el refresh mechanism en una extensiÃ³n indefinida de privilegios.

El token/sesiÃ³n original del administrador permanece almacenado segÃºn el mecanismo seguro existente para permitir `stop impersonation`.

### Amendment 1 â€” Ventana absoluta y comportamiento de refresh (2026-09-04)

La impersonaciÃ³n posee una **ventana absoluta de 1 hora** (`impersonateAt + 1h`), enforced server-side contra la fila `impersonation_session` (no contra un simple JWT `exp`).

Comportamiento:

| Evento | AcciÃ³n |
|---|---|
| `impersonate` | Borra **todas** las filas previas del admin y crea una sola (mÃ¡ximo 1 impersonaciÃ³n activa por admin). Cookie access = token impersonado `expiresIn 1h`. |
| `refresh` dentro de la ventana | Re-emite token impersonado (`{sub: target, impersonated, impersonatedBy}`) con `exp = fin de la ventana absoluta`, **siempre** que `expiresAt > now` y el admin siga `active`. Rota el refresh session del admin (reuse-detection intacto). |
| `refresh` fuera de la ventana | Re-issue de token admin (sin impersonaciÃ³n). El admin debe re-impersonar. |
| `refresh` con admin no activo | `401`, sin re-issue, sin prolongaciÃ³n. |
| `stop-impersonate` | Re-firma un access token admin **fresco** (nunca devuelve el token almacenado, que puede estar vencido). Busca la fila sin filtro temporal (funciona incluso post-expiraciÃ³n). Borra la fila. Requiere admin `active`. |
| ExpiraciÃ³n natural | La fila permanece hasta el prÃ³ximo `impersonate` del admin (sin job de limpieza en MVP; limpieza oportunista). |

La ventana de 1h **nunca** se supera, sin importar el comportamiento del cliente: el servidor no re-firma mÃ¡s allÃ¡ de `expiresAt`.

Frontend:

- Snapshot de admin en `sessionStorage` incorpora `impersonatedAt` (mirror de UX, no autoridad).
- ExpiraciÃ³n â†’ pÃ¡gina explÃ­cita `/impersonation-expired` con "volver a sesiÃ³n de administrador" y "cerrar sesiÃ³n". Sin auto-restore.
- El backend expone cÃ³digo estable de expiraciÃ³n: `401` + `IMPERSONATION_EXPIRED` (ver D-025).

Mobile futuro: la impersonaciÃ³n en MVP es cookie-only (browser). Los handlers devuelven tokens transport-agnostic; el soporte mobile Bearer se implementarÃ¡ cuando exista el cliente, sin cambios de diseÃ±o estructural (limitaciÃ³n documentada).

### Amendment 2 â€” Flujo de recovery post-expiraciÃ³n (2026-09-04, Security Review)

La Security Review encontrÃ³ un **P0 de recovery**: el viaje "impersonaciÃ³n expirada â†’ volver a sesiÃ³n de administrador" estaba roto porque el cliente **no refrescaba** ante `401 IMPERSONATION_EXPIRED` (tratÃ¡ndolo como ventana cerrada) y "volver a admin" dependÃ­a de `stop-impersonate`, inalcanzable con access expirado.

Regla de producto (corrige la interpretaciÃ³n):

- El cliente refresca ante **cualquier `401`**, incluido `IMPERSONATION_EXPIRED`: dentro de la ventana el refresh es legÃ­timo y re-emite token impersonado (`impersonated: true`, D-016 A1).
- La ventana cerrada se detecta **por la respuesta del refresh**: `impersonated: false` + snapshot de admin vigente â†’ mostra `/impersonation-expired`; `401` en refresh â†’ login.
- `/impersonation-expired` â†’ "volver a sesiÃ³n de administrador" = **refresh** (obtiene token admin si la ventana cerrÃ³) y navegar a `/admin/users`; logout = cerrar sesiÃ³n. `stop-impersonate` queda para la terminaciÃ³n **dentro** de la ventana (access vÃ¡lido), no para recovery.
- El cÃ³digo `IMPERSONATION_EXPIRED` se conserva para SSR y telemetrÃ­a; no es el disparador del flujo de expiraciÃ³n.

DecisiÃ³n de seguridad asociada (Security Review P1): **eliminar la persistencia del `adminToken` en claro** en `impersonation_sessions`. Desde D-016 A1 el `stop-impersonate` re-firma token fresco y nunca reutiliza el almacenado; la columna deja de ser necesaria (drop vÃ­a migraciÃ³n â€” coordina TL/Database). La ventana y rotaciÃ³n siguen enforced server-side por la fila.

---

# D-017 â€” Bearer en producciÃ³n

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture

### DecisiÃ³n

**No se deshabilita globalmente Bearer en producciÃ³n.**

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

Bearer debe estar explÃ­citamente asociado a clientes no-browser autorizados.

Si en el futuro existe una necesidad fuerte de separar ambos mecanismos, se evaluarÃ¡:

- audience;
- client type;
- rutas;
- scopes;
- auth strategies independientes.

La coexistencia no debe convertirse en una vÃ­a accidental de autenticaciÃ³n para el frontend browser.

---

# D-018 â€” Co-owner rights

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Problema

VehicleOwnership permite representar ownership histÃ³rico, pero todavÃ­a no se ha definido completamente:

- mÃºltiples propietarios simultÃ¡neos;
- derechos de co-owner;
- diferencia entre owner principal y co-owner;
- capacidad de transferir;
- acceso automÃ¡tico derivado de ownership.

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

# D-019 â€” SemÃ¡ntica de vehÃ­culos en WORKSHOP context

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Pregunta

Â¿QuÃ© significa:

```text
GET /vehicles
```

cuando:

```text
Active Context = WORKSHOP
```

### Opciones consideradas

1. VehÃ­culos que actualmente pertenecen explÃ­citamente al workshop.
2. VehÃ­culos derivados de historial de atenciÃ³n del workshop.
3. Una entidad explÃ­cita `WorkshopVehicle`.
4. Una combinaciÃ³n de ownership/access/history.

### RecomendaciÃ³n provisional

Para el MVP se favorece una semÃ¡ntica derivada de la relaciÃ³n histÃ³rica con el workshop, evitando introducir prematuramente una entidad `WorkshopVehicle`.

Esta recomendaciÃ³n requiere aprobaciÃ³n antes de convertirse en contrato definitivo.

---

# D-020 â€” Contexto invÃ¡lido

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Security

### DecisiÃ³n

Un Active Context invÃ¡lido, inexistente o no autorizado debe producir:

```text
403 Forbidden
```

No se debe realizar fallback silencioso hacia:

```text
PERSONAL
```

ni hacia ningÃºn otro contexto.

### RazÃ³n

El fallback puede provocar:

- confusiÃ³n funcional;
- exposiciÃ³n accidental de informaciÃ³n;
- autorizaciÃ³n incorrecta;
- problemas difÃ­ciles de detectar.

Un contexto invÃ¡lido debe ser explÃ­cito y observable.

### Amendment 1 â€” ImplementaciÃ³n (2026-09-04)

ImplementaciÃ³n concreta en `ContextResolver`:

- **Header `X-Context-Type` ausente** â†’ default `PERSONAL` (no hay contexto explÃ­cito solicitado; permitido).
- **Header presente e invÃ¡lido** â†’ `403 Forbidden` duro, sin fallback. Caminos: tipo desconocido; `WORKSHOP` sin `X-Context-Id`; workshop inexistente o sin membership activa; `PLATFORM` sin rol de plataforma; `PERSONAL` con `X-Context-Id` (contrato estricto).
- **Se elimina el path-fallback** del `ContextResolver` (ninguna ruta con `ContextGuard` tiene un workshopId legÃ­timo en `:id`; solo enmascaraba ambigÃ¼edad).
- `PLATFORM` exige `systemRoleAssignment` con rol `(super_admin, admin, support)`. El rol de sistema `user` **no** califica.
- Error estÃ¡ndar para el contrato: `ForbiddenException('Invalid or unauthorized active context')`.

CoordinaciÃ³n de release (cambio breaking asociado):

- Los flujos de taller que hoy "funcionan por accidente" (IDOR) dejarÃ¡n de hacerlo. El frontend debe enviar `X-Context-Type: WORKSHOP` + `X-Context-Id` en los flujos de taller **a partir de este fix**, mediante propagaciÃ³n mÃ­nima basada en el taller actualmente seleccionado por la navegaciÃ³n (sin ContextSwitcher, sin queryKeys por contexto, sin persistencia â€” eso es parte de D-004/D-021).
- El despliegue del P0 de seguridad se coordina Backend + Frontend.

---

# D-021 â€” Session-driven vs route-driven Active Context

**Estado:** `PENDING`
**Tipo:** Product / Architecture

### Problema

Debe definirse quÃ© elemento representa la autoridad del contexto activo:

```text
Session
URL
Route
Query parameter
Header
```

### Principio provisional

La navegaciÃ³n puede reflejar el contexto mediante URL, pero la URL **no debe convertirse automÃ¡ticamente en autoridad de autorizaciÃ³n**.

La arquitectura favorece:

```text
Session / explicit context
        â†“
API request
        â†“
Authorization
```

La URL puede actuar como mecanismo de navegaciÃ³n/persistencia UX.

### Pendiente

Definir:

- persistencia entre refresh;
- comportamiento SSR;
- deep links;
- cambio de workshop;
- logout/login;
- mÃºltiples pestaÃ±as;
- sincronizaciÃ³n frontend/backend.

---

# D-022 â€” MVP CareEpisode policies

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Debe definirse

Antes de implementar completamente CareEpisode se deben resolver:

- quiÃ©n puede crear un episodio;
- cuÃ¡ndo exactamente nace;
- si siempre requiere Appointment;
- walk-ins;
- quiÃ©n puede modificarlo;
- quÃ© significa `waiting_approval`;
- quÃ© eventos cambian su estado;
- quÃ© estados son obligatorios;
- quiÃ©n puede cerrar un episodio;
- quÃ© datos son obligatorios para cerrar;
- permisos por actor/contexto.

### Principio

CareEpisode debe representar una atenciÃ³n real del vehÃ­culo y no convertirse en un simple wrapper tÃ©cnico alrededor de las entidades existentes.

---

# D-023 â€” Appointment cancelado despuÃ©s de iniciar CareEpisode

**Estado:** `PENDING`
**Tipo:** Product / Domain

### Problema

Un Appointment puede ser cancelado despuÃ©s de que el vehÃ­culo ya haya ingresado.

La semÃ¡ntica correcta debe distinguir:

```text
Appointment
    =
reserva/intenciÃ³n de atenciÃ³n

CareEpisode
    =
atenciÃ³n efectivamente iniciada
```

### RecomendaciÃ³n provisional

Una vez creado un CareEpisode:

```text
Appointment.cancelled
```

no debe destruir ni cancelar automÃ¡ticamente:

```text
CareEpisode
```

El episodio representa un hecho operativo ya ocurrido.

El comportamiento exacto de los estados debe resolverse junto con D-022.

---

# D-024 â€” ValidaciÃ³n de acceso a recursos vehiculares (VehicleAccessService)

**Estado:** `ACCEPTED`
**Tipo:** Security / Architecture / Authorization
**Prioridad:** P0

### Contexto

VerificaciÃ³n de seguridad (2026-09-04) confirmÃ³ IDORs activos:

- `GET /maintenance/appointments/:id`, `work-orders/:id`, `estimates/:id`, `vehicles/:vehicleId/history` **no validan** ownership/access del llamador (causa raÃ­z: path-fallback del ContextResolver, corregido en D-020).
- `GET /maintenance/appointments` y `work-orders` (listados) en PERSONAL aceptan `?workshopId=` libre â†’ listados tambiÃ©n IDOR.
- `POST /vehicles/:id/mileage` no valida acceso â†’ IDOR de escritura.
- `POST /maintenance/estimates/:id/convert` sin validaciÃ³n.
- `POST /maintenance/work-orders/:id/items` sin guard de permisos.
- `GET /dashboard/super-admin` sin PermissionsGuard validado (P1).

### DecisiÃ³n

Introducir **`VehicleAccessService`** en `src/common/authorization/` como validaciÃ³n reutilizable de acceso a un vehÃ­culo, con regla de evaluaciÃ³n (corto-circuito):

```text
1. Ownership activo (vehicle_ownerships, endsAt: null)
2. VehicleAccess vigente (revokedAt: null, sin expirar)
3. Workshop membership del contexto WORKSHOP (si contexto es WORKSHOP)
4. Privilegio de plataforma (super_admin)
```

Si ninguna aplica â†’ `ForbiddenException`.

### Implicaciones

- Las rutas de lectura y escritura de maintenance validan acceso al `vehicleId` del recurso (13+ endpoints).
- Listados en contexto PERSONAL exigen `vehicleId` validado o contexto WORKSHOP; el `workshopId` del contexto **gana** sobre el del query (mismatch â†’ 403).
- `POST /vehicles/:id/mileage` incorpora validaciÃ³n de acceso (P0).
- `GET /vehicles/:id` (detalle) **permanece** con ownership/access/super_admin hasta D-019 (no se incorpora workshop-membership en este P0).
- Deuda P1 registrada: `DELETE /vehicles/:id` y `POST /vehicles/:id/access` deben exigir **ownership** (hoy un usuario con solo access puede borrar/otorgar); `GET /dashboard/super-admin` requiere PermissionsGuard.
- El P0 crea el primer scaffold de testing (jest existente; unit de ContextResolver + VehicleAccessService + integration Supertest por endpoint).

### Amendment 1 â€” Alcance mÃ­nimo exacto y regla de taller verificada (2026-09-04, desglose tÃ©cnico)

El desglose tÃ©cnico verificÃ³ la lista real de endpoints (12, no 13+ â€” `GET /maintenance/estimates/:id` no existe). Se corrigen y complementan las implicaciones:

1. **Regla 3 (workshop membership) requiere asociaciÃ³n de vehÃ­culo con el taller.** La membership activa del contexto WORKSHOP **no alcanza** para acceder a cualquier vehÃ­culo del sistema: el vehÃ­culo debe ademÃ¡s tener **al menos un registro de mantenimiento del taller** (appointment, work-order, estimate o service-record con ese `workshopId`). Sin asociaciÃ³n â†’ `ForbiddenException`. Evita sobre-exposiciÃ³n de lectura ("cualquier miembro puede leer cualquier vehÃ­culo del sistema"). Regla **provisional** sujeta a D-019; no reabre el IDOR de listados.
2. **Los creates de maintenance entran al P0.** `POST /maintenance/appointments|work-orders|estimates|service-records` deben validar acceso al `vehicleId` del DTO: en PERSONAL, ownership/access/super_admin; en WORKSHOP, membership activa **+ asociaciÃ³n** con el taller. Sin esto, un usuario autenticado podrÃ­a crear recursos sobre un vehÃ­culo ajeno y **contaminar el historial** (viola D-012/D-014). Extiende la lista de endpoints cubiertos (12 â†’ 16).
3. **Hallazgo adicional confirmado:** `POST /maintenance/estimates/:id/convert` y `POST /maintenance/work-orders/:id/items` entran al P0 como escrituras validadas con `assertVehicleAccess` (el `PermissionsGuard` del items y del dashboard super-admin permanecen deuda P1).
4. **`/vehicles/*`** (findOne, update, remove, photos, documents, history, grantAccess): reemplaza el `assertVehicleAccess` privado por el servicio en **modo estricto** (ownership/access/super_admin, sin membership), comportamiento idÃ©ntico al actual hasta D-019.

### Amendment 2 â€” Maintenance writes son exclusivos de taller (WORKSHOP-only) (2026-09-08, QA post-merge, decisiÃ³n PM confirmada)

**Amenda el punto 2 del Amendment 1** y resuelve la regresiÃ³n detectada en el QA post-merge: los `@Permissions` de taller sobre los writes de maintenance hacÃ­an que un owner en contexto PERSONAL recibiera 403 sobre su propio vehÃ­culo, contradiciendo el punto 2 del Amendment 1 (que validaba los creates en PERSONAL por ownership/access/super_admin).

**DecisiÃ³n (OpciÃ³n A):**

- El registro de atenciones/servicios (CareEpisode y sus derivados: appointments, work-orders, service-records, estimates, items, approve, convert) es actividad **del taller**. Los writes de maintenance **requieren contexto WORKSHOP** con permisos de taller (`appointment.*`, `workorder.*`, `service-record.*`, `estimate.*`).
- En contexto **PERSONAL**, los writes de maintenance estÃ¡n **denegados por diseÃ±o**: el backend responde `403 PERMISSION_DENIED` sin depender de ownership/access. Aplica tambiÃ©n a `super_admin` (debe operar desde un contexto WORKSHOP con permisos de taller registrados; no se concede privilegio de plataforma para writes de maintenance).
- El owner en PERSONAL conserva: consultas de maintenance con ownership/access, `POST /vehicles/:id/mileage`, y las operaciones de `/vehicles/*` (strict mode). Puede **consultar** el historial, pero **no crear/cancelar/convertir** atenciones desde su contexto personal.
- Frontend: en contexto PERSONAL, la UI de maintenance activo (crear, cancelar, convertir, agregar items, cambiar estado) se oculta o se presenta en modo solo-consulta, con aviso de que la gestiÃ³n requiere operar desde un taller. Backend permanece estricto (nunca se confÃ­a en la UI).
- El enforcement actual (`PermissionsGuard` + `@Permissions`) ya produce este comportamiento en la prÃ¡ctica; esta enmienda lo convierte en **decisiÃ³n explÃ­cita de producto** y elimina la contradicciÃ³n con el Amendment 1.

**Nota de implementaciÃ³n (2026-09-08, cierre de QA post-merge):**

- **Escape de seguridad corregido:** el bypass incondicional de `super_admin` en `PermissionsGuard` (lÃ­neas 56-58) hacÃ­a que un `super_admin` en contexto PERSONAL pudiera escribir maintenance si ownership/access lo permitÃ­a (el bypass se dispara antes de cargar permisos de taller). Se introdujo `WorkshopOnlyGuard` (`src/common/guards/workshop-only.guard.ts`), aplicado **antes de** `PermissionsGuard` en los **10 endpoints write** de maintenance: exige `ctx.type === 'WORKSHOP'` y lanza `ForbiddenException` (403 â†’ envelope `PERMISSION_DENIED` vÃ­a D-025) en PERSONAL/PLATFORM/contexto ausente. Los endpoints read de maintenance conservan validaciÃ³n por ownership/access.
- **Cobertura de tests:** la matriz de la OpciÃ³n A quedÃ³ cubierta en `maintenance.controller.spec.ts` (45 casos nuevos sobre esa spec; suite total 127 tests). Incluye: owner en PERSONAL â†’ 403 en writes; `super_admin` en PERSONAL â†’ 403 en writes; miembro en WORKSHOP con permiso â†’ pasa; owner en PERSONAL â†’ reads pasan.
- **UI (frontend):** en contexto PERSONAL (usuario sin membresÃ­a de taller activa) la UI de maintenance queda **solo-consulta**: se ocultan controles de create/cancel/convert/item/status y las pÃ¡ginas `/new` muestran un aviso ("La gestiÃ³n de mantenimiento requiere operar desde un taller"). La barra lateral conserva el vÃ­nculo "Mantenimiento" (decisiÃ³n PM: el owner debe poder consultar su historial; se evita ocultar navegaciÃ³n), con las vistas read-only + aviso. Un usuario con â‰¥1 membresÃ­a mantiene el comportamiento previo (contexto WORKSHOP vÃ­a fallback `workshopMembers[0]`).

---

# D-025 â€” Contrato de errores estandarizado (Error envelope)

**Estado:** `ACCEPTED`
**Tipo:** Backend Contract / Frontend / Security
**Prioridad:** P0

### DecisiÃ³n

El backend estandariza el envelope de error:

```json
{
  "statusCode": 403,
  "message": "No tenÃ©s acceso a este recurso",
  "code": "PERMISSION_DENIED",
  "errors": {}
}
```

Conjunto mÃ­nimo de cÃ³digos estables:

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

`INTERNAL_ERROR` (500) se agrega al set como cÃ³digo **de fallback genÃ©rico** (excepciones no capturadas: envelope sin stack, log interno). No se usa como cÃ³digo de negocio; el cliente lo trata como error de servidor rethrow al error boundary.

### Reglas frontend

- **`403` nunca implica logout**: sin refresh, sin redirect a `/login`. Renderiza estado de acceso denegado.
- **`401`** es el Ãºnico cÃ³digo que dispara refresh â†’ retry â†’ redirect.
- SSR: `401` â†’ redirect `/login`; `403` â†’ `ForbiddenState`; `404` â†’ `notFound()`; 5xx â†’ error boundary.
- `code === "INVALID_CONTEXT"` queda reservado para la UX de recuperaciÃ³n de contexto cuando D-004/D-021 aterricen (diseÃ±ado ahora, implementado despuÃ©s).
- `code === "IMPERSONATION_EXPIRED"` (401) dispara la flujo `/impersonation-expired` (ver D-016).

### Mobile futuro

El envelope es portable por transporte (cookies web / Bearer mobile): el cliente dispone sobre los mismos `code`, independientemente del transporte.

---

# D-026 â€” Password reset: token hashing

**Estado:** `ACCEPTED`
**Tipo:** Security / Data
**Prioridad:** P0

### DecisiÃ³n

El token de password reset se almacena en base de datos Ãºnicamente como **hash SHA-256**, nunca en texto plano.

```text
Token en memoria/email: randomBytes(32).toString('hex')  (64 chars hex, 256 bits)
Token en BD:            SHA-256(token)                   (column token_hash)
```

### Reglas

- `PasswordReset.tokenHash` es el Ãºnico campo persistido (columna `token_hash`, unique).
- El token en claro solo existe transitoriamente en el handler y en el email enviado al usuario.
- El hash se calcula con el mismo mecanismo que `refreshToken` (`hashPasswordResetToken`).
- Aplica tambiÃ©n como patrÃ³n obligatorio para cualquier token de verificaciÃ³n futuro (p. ej. `email_verifications`), evitando reintroducir texto plano.

### Implicaciones

Database:

- MigraciÃ³n `20260909000000_hash_password_reset_token`: agrega `token_hash`, migra datos existentes con `pgcrypto` (`encode(digest(token,'sha256'),'hex')`), Ã­ndice Ãºnico, drop de `token`.

Seguridad:

- Un volcado de BD no permite usar tokens de reset.
- No se requiere cifrado reversible; el hash es suficiente porque el token tiene 256 bits de entropÃ­a.

---

# D-027 â€” Password reset: flujo seguro (revocaciÃ³n, atomicidad, lockout)

**Estado:** `ACCEPTED`
**Tipo:** Security / Product
**Prioridad:** P0

### DecisiÃ³n

El flujo de password reset incorpora las siguientes reglas de seguridad:

1. **Un solo token activo por usuario:** al crear un nuevo token de reset, se revocan (`usedAt = now`) todos los tokens previos no utilizados del usuario.
2. **Atomicidad:** la actualizaciÃ³n de la contraseÃ±a, el marcado del token como usado y la revocaciÃ³n de sesiones se ejecutan dentro de una Ãºnica transacciÃ³n (`prisma.$transaction`). No puede quedar un estado intermedio (token reutilizable o sesiones no revocadas).
3. **Limpieza de lockout:** un reset exitoso reinicia `failedAttempts = 0` y `lockedUntil = null` junto con el cambio de contraseÃ±a.
4. **RevocaciÃ³n de sesiones:** todas las sesiones activas del usuario (`revokedAt IS NULL`) se revocan al completar un reset.
5. **Token de un solo uso:** el `usedAt` se establece dentro de la misma transacciÃ³n; un token ya usado es rechazado.

### Regla

El reset de contraseÃ±a es un evento de alta seguridad: modifica credenciales, limpieza de bloqueo y sesiones de forma atÃ³mica. No puede degradarse ninguna de estas tres operaciones a un paso opcional.

### Implicaciones

Backend:

- `reset-password.handler` ejecuta todo en `$transaction`.
- `request-password-reset.handler` revoca tokens anteriores antes de crear el nuevo.

---

# D-028 â€” Reset password: link del email apunta al frontend

**Estado:** `ACCEPTED`
**Tipo:** Product / Architecture / Backend Contract
**Prioridad:** P0

### DecisiÃ³n

El email de password reset genera un link hacia la **aplicaciÃ³n frontend**, no hacia el backend API.

```text
Link en email: ${FRONTEND_URL}/reset-password?token=${token}
```

### Reglas

- Se introduce la variable de entorno `FRONTEND_URL` (URI, default `http://localhost:3000`), independiente de `API_URL`.
- El frontend consume el token desde el query param y lo elimina de la URL (`history.replaceState`) tras leerlo.
- `forgot-password` y `reset-password` son endpoints pÃºblicos (sin auth); el token es la autorizaciÃ³n del reset.

### Implicaciones

Backend:

- `mail.service.ts` usa `envs.FRONTEND_URL` para construir el link.

Frontend:

- Ruta canÃ³nica de reset: `/reset-password?token=...` (ruta pÃºblica, grupo `(auth)`).
- PÃ¡gina `forgot-password` implementa anti-enumeraciÃ³n: respuesta idÃ©ntica exista o no el email.

---

# D-029 â€” Email de confirmaciÃ³n post-reset

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

### DecisiÃ³n

Se envÃ­a un **email de confirmaciÃ³n** al usuario cuando su contraseÃ±a es restablecida exitosamente.

### Reglas

- Se emite el evento `auth.password_reset.completed` despuÃ©s de la transacciÃ³n exitosa.
- El listener `SendPasswordResetCompletedEmailListener` busca al usuario y le envÃ­a el email de notificaciÃ³n.
- Incluye advertencia de seguridad: "Si no realizaste este cambio, contacta al soporte inmediatamente".
- Un usuario inexistente (borrado entre reset y envÃ­o) no produce error ni email.

### RazÃ³n

Permite que la vÃ­ctima de un reset malicioso detecte el compromiso de su cuenta sin depender de otros canales.

---

# D-030 â€” Rate limiting diferenciado en auth pÃºblico

**Estado:** `ACCEPTED`
**Tipo:** Security / Backend Contract
**Prioridad:** P1

### DecisiÃ³n

Los endpoints pÃºblicos de recuperaciÃ³n de contraseÃ±a tienen lÃ­mites de throttling especÃ­ficos, diferenciados del throttle global:

```text
POST /auth/forgot-password   3 requests / 10 minutos por IP
POST /auth/reset-password    5 requests /  5 minutos por IP
```

`change-password` (autenticado) conserva el throttle global existente.

### ObservaciÃ³n QA registrada

Queda como deuda menor agregar el cÃ³digo `RATE_LIMITED` para HTTP 429 al catÃ¡logo D-025 (`error-codes.ts` + `statusToCode`); hoy el 429 cae en `INTERNAL_ERROR` (funcional pero engaÃ±oso para el frontend).

---

# 6. Dependency Graph

Las decisiones tienen las siguientes dependencias principales:

```text
D-001
 â”œâ”€â”€ D-016
 â””â”€â”€ D-017


D-003
 â””â”€â”€ D-002


D-002
 â””â”€â”€ D-004
       â”œâ”€â”€ D-019
       â””â”€â”€ D-021


D-005
 â”œâ”€â”€ D-022
 â””â”€â”€ D-023


D-020
  â””â”€â”€ D-024
        â””â”€â”€ D-025


D-026
  â””â”€â”€ D-027
        â””â”€â”€ D-029


D-028
  â””â”€â”€ D-030
```

---

# 7. Orden recomendado de resoluciÃ³n

## Fase 0 â€” CorrecciÃ³n inmediata (P0)

### Build blocker

Corregir:

```text
src/hooks/use-vehicles.ts
```

eliminando el import inexistente:

```text
getAuthHeaders
```

Esta correcciÃ³n no requiere una decisiÃ³n arquitectÃ³nica.

### Seguridad P0 (coordinado Backend + Frontend)

Cerrar los hallazgos de seguridad verificados:

```text
D-020  ContextResolver â†’ 403 hard, eliminar path-fallback, PLATFORM con rol
D-024  VehicleAccessService + validaciÃ³n en rutas de maintenance/record-mileage
D-025  Error envelope + 403 nunca = logout (frontend)
D-016  Refresh mantenido dentro de ventana + stop-impersonate re-firma admin
D-002  /auth/me expone isVehicleOwner (contrato de sesiÃ³n)
```

Requisito de release coordinado: el frontend envÃ­a `X-Context-Type`/`X-Context-Id` en flujos de taller (propagaciÃ³n mÃ­nima, D-020 Amendment 1). Sin este requisito, el fix de contexto romperÃ­a flujos de taller existentes.

---

## Fase 1 â€” Auth

Resolver implementaciÃ³n/documentaciÃ³n de:

```text
D-001
D-016
D-017
```

Prioridad mÃ¡xima por impacto transversal y seguridad.

---

## Fase 2 â€” Actor / Ownership

Consolidar:

```text
D-003
D-002
D-018
```

D-018 puede mantenerse pendiente si el MVP no requiere co-ownership explÃ­cito.

---

## Fase 3 â€” Active Context

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

D-020 ya estÃ¡ aceptada y debe respetarse desde el comienzo.

---

## Fase 4 â€” CareEpisode

Resolver:

```text
D-022
D-023
```

y posteriormente cerrar la implementaciÃ³n derivada de:

```text
D-005
```

---

# 8. Reglas para agentes

Todos los agentes del proyecto deben seguir estas reglas.

### 8.1 No sobrescribir decisiones aceptadas

Un agente no puede modificar el comportamiento definido por una decisiÃ³n `ACCEPTED` sin:

1. registrar una nueva decisiÃ³n;
2. marcar la anterior como `SUPERSEDED` cuando corresponda;
3. documentar la razÃ³n del cambio.

---

### 8.2 No resolver silenciosamente decisiones pendientes

Una decisiÃ³n `PENDING` no debe ser convertida implÃ­citamente en una decisiÃ³n tÃ©cnica mediante cÃ³digo.

---

### 8.3 Diferenciar legacy de target architecture

El cÃ³digo existente puede no coincidir con la arquitectura objetivo.

Cuando exista contradicciÃ³n:

```text
Accepted Decision
        â†“
Target Architecture
        â†“
Migration Plan
        â†“
Legacy Code
```

No se debe adaptar la arquitectura objetivo al legacy automÃ¡ticamente.

---

### 8.4 Frontend no es autoridad de seguridad

El frontend puede ocultar:

- botones;
- rutas;
- acciones;
- elementos de navegaciÃ³n.

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

solo porque podrÃ­an ser necesarios en el futuro.

Deben existir necesidades concretas y una decisiÃ³n explÃ­cita.

---

# 9. Template para nuevas decisiones

Las nuevas decisiones deben utilizar como mÃ­nimo:

```markdown
# D-XXX â€” Nombre

**Estado:** `PROPOSED`
**Tipo:** Product / Domain / Architecture / Security / Data / UX
**Prioridad:** P0 / P1 / P2

## Problema

Â¿QuÃ© problema necesita resolverse?

## Contexto

Â¿QuÃ© informaciÃ³n relevante existe?

## Opciones

### OpciÃ³n A

...

### OpciÃ³n B

...

## DecisiÃ³n

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
D-020  Invalid Active Context â†’ 403
D-024  VehicleAccessService / access validation (P0)
D-025  Error envelope contract
D-026  Password reset token hashing
D-027  Password reset flow seguro (revocaciÃ³n, atomicidad, lockout)
D-028  Reset password link â†’ FRONTEND_URL
D-029  Email de confirmaciÃ³n post-reset
D-030  Rate limiting diferenciado en auth pÃºblico
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
                     â”‚
                 Vehicle First
                     â”‚
              â”Œâ”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”
              â”‚             â”‚
         Ownership        Access
              â”‚             â”‚
              â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
              Active Context
                     â”‚
             â”Œâ”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”
             â”‚               â”‚
         PERSONAL         WORKSHOP
             â”‚               â”‚
             â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                 CareEpisode
                     â”‚
          â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚          â”‚          â”‚
      Diagnosis   Estimate   WorkOrder
                                  â”‚
                            ServiceRecord
                                  â”‚
                               Timeline
```

Y en tÃ©rminos de arquitectura:

```text
Browser
  â”‚
  â”‚ HttpOnly Cookies
  â–¼
NestJS Modular Monolith
  â”‚
  â”œâ”€â”€ Authentication
  â”œâ”€â”€ Authorization
  â”œâ”€â”€ Active Context
  â”œâ”€â”€ Vehicles
  â”œâ”€â”€ Ownership
  â”œâ”€â”€ Workshops
  â”œâ”€â”€ Appointments
  â””â”€â”€ Maintenance
          â”‚
          â””â”€â”€ CareEpisode
                â”œâ”€â”€ Diagnosis
                â”œâ”€â”€ Estimate
                â”œâ”€â”€ WorkOrder
                â””â”€â”€ ServiceRecord
  â”‚
  â–¼
PostgreSQL + Prisma
```

El registro debe permanecer deliberadamente pequeÃ±o y orientado a decisiones. Las decisiones de implementaciÃ³n menores no deben convertirse automÃ¡ticamente en entradas del Decision Register.

---

# 12. Wave P2 â€” ImplementaciÃ³n registrada (2026-09-08)

## Implementado (QA post-onda: APROBADO CON OBSERVACIONES; 0 defectos corregibles)

| Ãtem | Detalle |
| ---- | ------- |
| D-016 A2 completado | Drop de `adminToken` en claro: migraciÃ³n `prisma/migrations/20260908000000_drop_admin_token_from_impersonation_sessions` (DROP COLUMN) + schema + `impersonate.handler` ya no persiste token. `stop-impersonate` sigue re-firmando token fresco (D-016 A1). Cero lecturas residuales de DB (verificado por QA). |
| exp explÃ­cita | `login`, `refresh` (normal), `impersonate` y `stop-impersonate` firman con exp determinada; impersonaciÃ³n usa exp absoluta de la ventana de 1h. |
| Throttler | `ThrottlerModule` habilitado (envs `THROTTLE_TTL`/`THROTTLE_LIMIT` con defaults) en login, refresh, forgot/reset-password e impersonate. Sin APP_GUARD global (SPA). Sin dependencias nuevas. |
| B2 | `status` tipado a `AppointmentStatus`/`WorkOrderStatus` en maintenance. Sin cambio de contrato runtime. |
| B3 | `fileFilter` MIME en fotos (jpeg/png/webp/avif) y documentos (+pdf), consistente con `isImage` de storage. 400 â†’ envelope D-025. |
| B5 | `jwt.strategy.spec.ts` instancia la estrategia real (elimina `validatePayload` que replicaba lÃ³gica). |
| AsociaciÃ³n vehÃ­culo-taller | Appointments con `status = 'cancelled'` ya NO generan asociaciÃ³n (SQL en `assertWorkshopVehicleAccess`). |
| Dead code | Eliminado `src/common/exceptions/domain.exception.ts` (sin imports). |

VerificaciÃ³n: `tsc --noEmit` exit 0 Â· `npm test` 132 PASS Â· `npm run build` exit 0 (backend y frontend).

## DecisiÃ³n de producto aplicada

- **D-024 A1 regla 3 (asociaciÃ³n, enmienda parcial):** los appointments **cancelados no constituyen atenciÃ³n real** y por lo tanto no generan asociaciÃ³n vehÃ­culo-taller para acceso WORKSHOP.

## DECISIÃ“N DE PRODUCTO PENDIENTE â€” RESUELTA (2026-09-09, PM)

- **D-024 A1 regla 3, Amendment 3 (ACCEPTED):** los **work-orders con `status = 'cancelled'` NO generan asociaciÃ³n** vehÃ­culo-taller (mismo criterio que citas canceladas: no hubo atenciÃ³n real). Los **estimates SÃ mantienen la asociaciÃ³n de forma provisional**: representan la puerta de entrada comercial del taller con un vehÃ­culo nuevo; excluirlos romperÃ­a el journey de primer contacto (sin asociaciÃ³n previa no se puede crear el primer registro). Sujeto a revisiÃ³n con D-019 (semÃ¡ntica de WORKSHOP y "parque de clientes").
- ImplementaciÃ³n: aÃ±adir `status <> 'cancelled'` al leg de `work_orders` en `assertWorkshopVehicleAccess` (Wave P3).

## Observaciones QA post-wave (deuda menor)

- **D-025:** agregar cÃ³digo `RATE_LIMITED` para HTTP 429 (throttler) al catÃ¡logo `error-codes.ts` + `statusToCode`; hoy cae en `INTERNAL_ERROR` (funcional pero engaÃ±oso).
- **Tests faltantes:** `fileTypeFilter()`/MIME (B3) y verificaciÃ³n explÃ­cita del leg `estimates` en el test B6.
- **Entorno:** `.env` local sin `JWT_REFRESH_SECRET` (solo vive en shell del dev); recomendar agregarla a `.env`/`.env.example`.

## MigraciÃ³n requerida

- Aplicar `npm run db:deploy` en el entorno correspondiente (DROP COLUMN `admin_token`; no destructivo, no se lee desde D-016 A1).

---

# 13. IteraciÃ³n registrada (2026-09-09): Flujo completo de Reset Password (D-026 a D-030)

## Objetivo

Completar el flujo de reset password de extremo a extremo: seguridad del token, atomicidad, emails funcionales, frontend operativo y pruebas automatizadas. Las decisiones de producto asociadas son D-026 a D-030.

## Implementado

### Backend â€” Seguridad

| Ãtem | Detalle |
| ---- | ------- |
| D-026 | `PasswordReset.token` (texto plano) â†’ `tokenHash` (SHA-256). MigraciÃ³n `20260909000000_hash_password_reset_token` (add `token_hash`, `pgcrypto`, migrar datos, Ã­ndice Ãºnico, drop `token`). Aplicada en dev. |
| D-027 | `reset-password.handler` con `prisma.$transaction`: update credential (`passwordHash`, `passwordChangedAt`, `failedAttempts=0`, `lockedUntil=null`) + mark token used + revoke sesiones activas. Error unificado `401 'Enlace invÃ¡lido o expirado'`. |
| D-027 | `request-password-reset.handler` revoca tokens previos no usados antes de crear el nuevo; token generado con `randomBytes(32).toString('hex')`. |
| D-030 | Throttling diferenciado: `forgot-password` `@Throttle` 3/10min, `reset-password` 5/5min. |

### Backend â€” Funcional

| Ãtem | Detalle |
| ---- | ------- |
| D-028 | `FRONTEND_URL` en `envs` (URI, default `http://localhost:3000`). `mail.service.sendPasswordResetEmail` construye link `FRONTEND_URL/reset-password?token=...` en lugar de apuntar al backend. |
| D-029 | Nuevo evento `PasswordResetCompletedEvent` (`auth.password_reset.completed`) emitido tras transacciÃ³n exitosa + listener que envÃ­a email de confirmaciÃ³n. |
| Contratos | `forgotPassword`/`resetPassword`/`changePassword` retornan `{ message }`. `ResetPasswordDto` con `@MaxLength(100)` (consistente con change/register). Mensajes de error unificados en espaÃ±ol para el flujo de reset. |

### Frontend (creado desde cero en `frontend/`)

| Ãtem | Detalle |
| ---- | ------- |
| Stack | Next.js 15+ (App Router) + TypeScript strict + Tailwind CSS 4 + shadcn/ui (Base UI) + ky + React Hook Form + Zod + TanStack Query. |
| PÃ¡gina | `/forgot-password` â€” email + Zod; estado success siempre idÃ©ntico (anti-enumeraciÃ³n); maneja 429. |
| PÃ¡gina | `/reset-password` â€” token desde query param, eliminado de la URL con `replaceState`; password + confirmaciÃ³n; 401 â†’ enlace expirado; success â†’ auto-redirect 3s a `/login`. |
| PÃ¡gina | `/login` (stub funcional) y `/profile` (change-password: current + new + confirm, validaciones Zod, 401 â†’ contraseÃ±a actual incorrecta). |
| Componentes | `PasswordInput` (toggle mostrar/ocultar), Card/Button/Input/Label (shadcn). `authApi` (ky) + hooks `useForgotPassword`/`useResetPassword`/`useChangePassword`. |

### Tests (backend)

| Suite | Resultado |
| ----- | --------- |
| `request-password-reset.handler.spec.ts` | 6 tests (email inexistente, revocaciÃ³n previa, token 64 hex, evento, expiraciÃ³n 1h) |
| `reset-password.handler.spec.ts` | 9 tests (invÃ¡lido/usado/expirado, transacciÃ³n, failedAttempts reset, evento, bcrypt rounds) |
| `send-password-reset-completed-email.listener.spec.ts` | 2 tests (usuario existe/no existe) |

VerificaciÃ³n global: `npm test` â†’ **17 suites / 165 tests PASS** Â· `tsc --noEmit` exit 0 Â· backend `npm run build` exit 0 Â· frontend `npm run build` exit 0 (6 rutas generadas).

## Decisiones de producto aplicadas

- **Ruta canÃ³nica frontend de reset:** `/reset-password?token=...` (grupo pÃºblico `(auth)`).
- **Comportamiento post-reset:** revocaciÃ³n total de sesiones + email de confirmaciÃ³n + limpieza de lockout (regla D-027).
- **Idioma:** mensajes de error del flujo en espaÃ±ol (consistente con el email).

## Observaciones / deuda registrada

- **D-025 (deuda previa):** agregar cÃ³digo `RATE_LIMITED` para 429 al catÃ¡logo `error-codes.ts` + `statusToCode` (hoy cae en `INTERNAL_ERROR`).
- **Limpieza de tokens expirados/usados:** no se introdujo cron en MVP (requerirÃ­a `@nestjs/schedule`). MitigaciÃ³n actual: cada nuevo request revoca tokens previos (D-027). Se recomienda revisar cuando la tabla crezca o con decisiÃ³n de arquitectura explÃ­cita.
- **Filas huÃ©rfanas en `_prisma_migrations`:** 2 entradas fallidas de `20260904000000_remove_refresh_token_field_from_user_session` (finished_at NULL) detectadas por Database agent; inofensivas, pueden causar prompt de reset en `prisma migrate dev`. Limpieza opcional documentada: DELETE de esas filas.
- **Login stub y auth real:** ~~el frontend tiene login stub funcional (guarda `access_token` en `localStorage`)~~ **RESUELTO en iteraciÃ³n SecciÃ³n 14** (2026-09-09): el stub fue reemplazado por auth real con cookies HttpOnly (D-001), AuthProvider, refresh automÃ¡tico y protecciÃ³n de rutas vÃ­a `proxy.ts` (Next.js 16).
- **CoordinaciÃ³n backend/frontend pendiente:** el frontend debe exigir `FRONTEND_URL`/`NEXT_PUBLIC_API_URL` en cada entorno; documentado en `frontend/.env.example`.

---

# 14. IteraciÃ³n registrada (2026-09-09): Auth real del frontend (D-001 sin violaciones)

## Objetivo

Eliminar el login stub del frontend (que violaba D-001 guardando `access_token` en `localStorage`) e implementar autenticaciÃ³n real de extremo a extremo: login/registro/verificaciÃ³n de email funcionales, sesiÃ³n persistente vÃ­a cookies HttpOnly, refresh automÃ¡tico del access token, logout y protecciÃ³n de rutas.

## Spec

- `docs/specs/frontend-auth-flow.md` â€” aprobada por PM (RF-1 a RF-10).

## Implementado (frontend)

| Ãtem | Detalle |
| ---- | ------- |
| D-001 | `src/providers/auth-provider.tsx` â€” AuthProvider con `status: loading/authenticated/unauthenticated`, `user: SessionUser`, `refreshSession`, `clearSession`. Bootstrap con `GET /auth/me` al montar. |
| D-001 | `src/lib/api.ts` â€” `authApi.login/logout/me/register/verifyEmail` + estrategia de refresh automÃ¡tico: ky `beforeRetry` (401 â†’ `POST /auth/refresh` â†’ reintento mÃ¡x. 1; refrescos concurrentes coordinados; endpoints pÃºblicos excluidos del refresh). |
| D-001 | `src/app/(auth)/login/page.tsx` â€” reescrito: **sin localStorage**, cookies HttpOnly, redirect respeta `?next=` con protecciÃ³n anti open-redirect. |
| Registro | `src/app/(auth)/register/page.tsx` â€” firstName/lastName/email/password/confirm, Zod, success â†’ pantalla "Revisa tu email". |
| VerificaciÃ³n | `src/app/(auth)/verify-email/page.tsx` â€” `GET /auth/verify-email?token=...`, estados loading/success/error. |
| Rutas | `src/proxy.ts` (convenciÃ³n Next.js 16: middleware â†’ proxy) â€” protecciÃ³n `/dashboard` y `/profile` (sin cookie `access_token` â†’ `/login?next=`); `/login` y `/register` con cookie â†’ `/dashboard`. Matcher excluye API/static/favicon. |
| Layout | `src/app/(dashboard)/layout.tsx` â€” header HCDV con UserNav (avatar inicial + logout); si sesiÃ³n expira â†’ redirect `/login?next=`. |
| Dashboard | `src/app/(dashboard)/dashboard/page.tsx` â€” home mÃ­nima: saludo, email, roles, propietario, talleres. |
| Tipos | `src/types/auth.ts` â€” `SessionUser` (contrato `GET /auth/me`). |

## Decisions tÃ©cnicas del Tech Lead

- **Next.js 16**: `middleware.ts` renombrado a `proxy.ts` (convenciÃ³n oficial de la versiÃ³n instalada, verificada en `node_modules/next/dist/docs`).
- **Sin next-auth**: con D-001 (cookies HttpOnly del backend) un AuthProvider ligero + ky es suficiente; next-auth agregarÃ­a complejidad sin valor (decisiÃ³n de implementaciÃ³n dentro de la autoridad del Tech Lead; alineada con `frontend-auth-flow.md` secciÃ³n 9).
- **Refresh**: ky `beforeRetry` con flag global para no duplicar refrescos concurrentes y exclusiÃ³n de endpoints pÃºblicos.

## VerificaciÃ³n

- `npm run build` â†’ exit 0 (Next.js 16.3.4, Turbopack): 9 rutas generadas + `Æ’ Proxy (Middleware)`.
- Rutas: `/`, `/_not-found`, `/dashboard`, `/forgot-password`, `/login`, `/profile`, `/register`, `/reset-password`, `/verify-email`.

## Observaciones / deuda registrada

- **Pruebas E2E pendientes:** no hay test runner de frontend configurado (deuda conocida). El flujo completo (login con cookies en dev localhost:3000 â†” backend:3001) requiere verificaciÃ³n manual o script E2E; CORS + credentials ya estÃ¡n habilitados en backend.
- **Contrato `/auth/me` a confirmar:** el campo `workshopMemberships` y `roles` fueron tipados en `SessionUser` segÃºn el handler backend; confirmar con Backend Tech Lead antes de construir UI dependiente (p. ej. `/profile` avanzado).
- **Splash global:** AuthProvider muestra splash de carga en toda la app mientras resuelve sesiÃ³n; correcto para evitar flash en pÃ¡ginas autenticadas.
- **Registro no auto-login:** deliberado (verificar email primero); coherente con backend.
- **Deuda previa sin cambios:** RATE_LIMITED para 429 (`error-codes.ts`), cron limpieza de tokens, filas huÃ©rfanas en `_prisma_migrations`, evidente en SecciÃ³n 13.

---

# 15. Registro (2026-09-09): Backend E2E auth + config CORS/FRONTEND_URL (cierre de iteraciÃ³n D-001)

## Objetivo

Cerrar la iteraciÃ³n de auth real del frontend (SecciÃ³n 14) validando el backend de extremo a extremo y documentando la configuraciÃ³n de orÃ­genes. Sin cambios de producto.

## DecisiÃ³n de configuraciÃ³n (Tech Lead)

- **`CORS_ORIGIN`** en `.env.example` pasa de `*` a `http://localhost:3000`. Con `cors.credentials: true` (cookies HttpOnly, D-001) el browser rechaza `*` + credentials; el origen debe ser el real (lista separada por comas permitida). Resuelve el hardening pendiente anotado en `DECISION-PROPOSALS.md` (D-001).
- **`FRONTEND_URL`** agregado a `.env.example` (`http://localhost:3000`, URI validada por Joi). Ya existÃ­a en `src/config/envs.ts` (D-028); el ejemplo del entorno no lo reflejaba. El `.env` local ya tenÃ­a `CORS_ORIGIN=http://localhost:3000` (verificado, sin cambios).
- ImplementaciÃ³n: `.env.example` â€” 2 lÃ­neas de comentario + 1 valor cambiado + bloque nuevo `FRONTEND_URL`. Sin secretos.

## VerificaciÃ³n E2E backend (evidencia registrada)

Backend build + start (`node dist/main.js`, `npm run build` exit 0) sobre PostgreSQL local (50 usuarios seed). Matriz completa en el reporte de cierre del Backend Tech Lead (este Ã­tem). Resumen:

- `POST /api/auth/register` â†’ 201 `{ user }`, sin Set-Cookie (no auto-login). Duplicado â†’ 401 `SESSION_EXPIRED` (no 409 â€” comportamiento existente, ver observaciones).
- `POST /api/auth/login` â†’ 201 + `Set-Cookie access_token` (HttpOnly, SameSite=Lax, Max-Age=1500) + `refresh_token` (HttpOnly, SameSite=Strict, Max-Age=604800); body `{ user }` sin tokens. CORS verificado: `Access-Control-Allow-Origin: http://localhost:3000` + `Access-Control-Allow-Credentials: true`.
- `GET /api/auth/me` â†’ 200 con `{ id, email, firstName, lastName, avatarUrl, language, status, isVehicleOwner, roles[], workshopMemberships[] }` â€” payload coincide con `SessionUser` del frontend (excepto `roles[].type` vs `roles[].code`, ver observaciones).
- `POST /api/auth/refresh` â†’ 201, cookies rotadas (nuevo `refresh_token`), body `{ success: true, impersonated: false }`.
- `POST /api/auth/logout` â†’ 201 `{ message }`, cookies limpiadas (`Max-Age=0`); `/auth/me` posterior â†’ 401 `SESSION_EXPIRED`.
- `POST /api/auth/forgot-password` (email desconocido) â†’ 201 con mensaje fijo anti-enumeraciÃ³n; 4Âº intento â†’ 429 `RATE_LIMITED` (mapeo D-025 confirmado).
- `POST /api/auth/reset-password` (token invÃ¡lido) â†’ 401 `'Enlace invÃ¡lido o expirado'`.
- `GET /api/auth/verify-email?token=...` â†’ 400 `VALIDATION_ERROR` (token no UUID) / 404 `NOT_FOUND 'Token invÃ¡lido'` (UUID inexistente).
- Tests unitarios auth: 6 suites / 37 tests PASS.

## Decisiones de producto aceptadas en el cierre (2026-09-09)

> **Estado: TODAS IMPLEMENTADAS Y VERIFICADAS** (2026-09-09) â€” ver "Cierre de implementaciÃ³n" al final de esta secciÃ³n.

### D-031 â€” Contrato `roles` en `/auth/me`: el backend es la fuente de verdad

- **DecisiÃ³n:** `GET /auth/me` devuelve `roles[]: { id, type, name, permissions[] }`. El frontend `SessionUser.roles[]` se corrige a ese contrato (`type` en lugar de `code`, + `permissions` opcional).
- **RazÃ³n:** el handler y `RoleDto` del backend usan `type` en toda la aplicaciÃ³n; no hay contrato anterior que defina `code`. Frontend debe tipar el payload real.
- **Impacto:** cambio localizado en `frontend/src/types/auth.ts`. Runtime actualmente OK (solo se consume `name`).
- **Alternativas descartadas:** renombrar el campo backend a `code` (cambio breaking sin necesidad real).

### D-032 â€” Register duplicado â†’ 409 `CONFLICT`

- **DecisiÃ³n:** `POST /auth/register` con email ya registrado debe responder **409** con cÃ³digo `CONFLICT` y mensaje claro ("Ya existe una cuenta con este email").
- **RazÃ³n:** 401 `SESSION_EXPIRED` es semÃ¡nticamente incorrecto para un registro duplicado (no es un problema de credenciales); la UI de register ya mapea 409 (cÃ³digo D-025).
- **Impacto:** cambio en el handler de register + tests. Revisar que no rompa el flujo de login.
- **Alternativas descartadas:** mantener 401 (contradice semÃ¡ntica y la UI existente); usar 400 (confunde validaciÃ³n).

### D-033 â€” Limpieza oportunista de tokens de reset expirados/usados (OpciÃ³n A)

- **DecisiÃ³n:** en `request-password-reset`, ademÃ¡s de la revocaciÃ³n previa (D-027), ejecutar `DELETE` oportunista de tokens `usedAt IS NOT NULL OR expiresAt < now` del mismo usuario.
- **RazÃ³n:** mantiene la higiene de `password_resets` sin introducir cron ni dependencia nueva (`@nestjs/schedule`); el endpoint ya estÃ¡ throttled (3/10min), volumen acotado.
- **Impacto:** ~3 lÃ­neas en handler/repository + tests. Cero impacto en contratos.
- **Alternativas descartadas:** `@nestjs/schedule` + cron (dependencia nueva sin necesidad real en MVP â€” rechazada por ahora; revisar cuando la tabla crezca o en staging pre-producciÃ³n); no limpiar (aceptable a corto plazo pero deja la deuda).

### D-034 â€” Email de verificaciÃ³n de cuenta â†’ journey frontend

- **DecisiÃ³n:** el email de verificaciÃ³n de cuenta debe apuntar a `FRONTEND_URL/verify-email?token=...` (pÃ¡gina frontend), no directamente al endpoint backend.
- **RazÃ³n:** consistencia con D-028 (reset ya usa `FRONTEND_URL`); el frontend ya tiene la pÃ¡gina `/verify-email` con UX completa; evitar mostrar texto/JSON del backend al usuario.
- **Impacto:** cambio en `mail.service` (build link con `FRONTEND_URL`) + tests. El endpoint `GET /auth/verify-email` permanece como API consumida por la pÃ¡gina.

### Decisiones menores (aceptadas, sin cambio de cÃ³digo)

- **Status 201 vs 200 en POST:** se documenta en specs que los POST responden 201 (default NestJS). No se agrega `@HttpCode(200)` â€” el frontend maneja cualquier 2xx y el costo de alinear no aporta valor.
- **Mensaje 429 crudo** (`"ThrottlerException: Too Many Requests"`): cosmÃ©tico; el frontend mapea por `code: RATE_LIMITED`, no por mensaje. Se acepta como deuda menor.
- **Drift seedâ†’DB (roles/permissions):** el rol `user` en DB tiene 13 permissions vs `systemRolePermissions.user = []` en seed. Deuda de mantenimiento de seed, fuera del scope de auth.
- **`verify-email` exige token UUID:** comportamiento razonable y ya documentado en el journey.

## Cierre de implementaciÃ³n (2026-09-09)

| DecisiÃ³n | Estado | ImplementaciÃ³n |
| -------- | ------ | -------------- |
| D-031 | âœ… Implementada | `frontend/src/types/auth.ts` â†’ `roles: Array<{ id; type; name; permissions? }>`. Sin referencias residuales a `roles.code`. Frontend build exit 0 + 19 tests PASS. |
| D-032 | âœ… Implementada | `register.handler.ts` â†’ `ConflictException('Ya existe una cuenta con este email')`. `statusToCode` ya mapeaba 409â†’CONFLICT. Nuevo spec: `register.handler.spec.ts` (3 tests). Login intacto (401 INVALID_CREDENTIALS). |
| D-033 | âœ… Implementada | `AuthRepository.deleteCleanupPasswordResets(userId)` + `prisma-auth.repository` (DELETE `usedAt != null OR expiresAt < now`). Orden en handler: revoke â†’ delete â†’ create. Spec actualizado (+2 tests). Sin `@nestjs/schedule`. |
| D-034 | âœ… Implementada | `mail.service.sendVerificationEmail` â†’ link `${FRONTEND_URL}/verify-email?token=...`. Cubre register y resend-verification (mismo evento). Nuevo spec: `mail.service.spec.ts` (3 tests; protege tambiÃ©n D-028). |
| Menores | âœ… Aceptadas | Spec `frontend-auth-flow.md` documenta 201 (POST), D-032 (409), D-031 (roles.type). Mensaje 429 crudo y drift seedâ†’DB registrados como deuda menor. |

VerificaciÃ³n global: `npm test` â†’ **19 suites / 173 tests PASS** (165 previos + 8 nuevos) Â· backend `npm run build` exit 0 Â· frontend `npm run build` exit 0 + `npm test` 19 tests PASS Â· limpieza de migraciones huÃ©rfanas ejecutada (Database) Â· E2E backend con backend real verificado (Backend Tech Lead).

---

# 16. Registro (2026-09-09): F-010 Registrar VehÃ­culo end-to-end (D-035..D-038)

# 22. Registro (2026-09-11): F-020 Crear CareEpisode desde taller end-to-end (D-056..D-061)

## Objetivo

Completar el journey F-010 de extremo a extremo (features.md Fase 1): el propietario registra su vehÃ­culo desde el frontend, el vehÃ­culo queda asociado como owner (VehicleOwnership) y aparece en "Mis vehÃ­culos". El backend ya exponÃ­a el alta; el trabajo real fue el journey frontend + ajustes menores de robustez backend.

## Spec

- `docs/specs/vehicle-register-flow.md` â€” aprobada por PM con las 4 decisiones confirmadas.

## Decisiones de producto aceptadas en el cierre (2026-09-09)

> **Estado: TODAS APROBADAS POR PM; IMPLEMENTADAS** â€” ver "Cierre de implementaciÃ³n" al final de esta secciÃ³n.

### D-035 â€” Registro de vehÃ­culo solo en contexto PERSONAL (MVP)

- **DecisiÃ³n:** el alta de vehÃ­culo se asocia al `user.id` autenticado como owner; solo aplica en contexto PERSONAL en MVP. Los miembros de taller (WORKSHOP) **no** registran vehÃ­culos en esta iteraciÃ³n (post-MVP). El frontend no envÃ­a `X-Context-Type` en estas llamadas (default PERSONAL, D-020 A1).
- **RazÃ³n:** "el taller no es propietario del vehÃ­culo por registrar una atenciÃ³n"; el alta es un acto de propiedad. Evita abrir la semÃ¡ntica WORKSHOP sin una decisiÃ³n explÃ­cita (D-004/D-021).
- **Impacto:** ningÃºn cambio de cÃ³digo requerido en el guard de contexto (el default PERSONAL ya aplica); solo documentaciÃ³n de journey y ausencia del header en el cliente.
- **Alternativas descartadas:** alta en WORKSHOP (requiere Ownership por taller/miembro y semÃ¡ntica de contexto no resuelta â€” post-MVP).

### D-036 â€” VIN opcional en MVP

- **DecisiÃ³n:** `vin` es opcional al crear vehÃ­culo. La UI informa que completarlo mejora la trazabilidad, pero no bloquea el registro. `vin` duplicado â†’ 409 CONFLICT con mensaje especÃ­fico.
- **RazÃ³n:** obligar VIN aumenta fricciÃ³n de alta sin valor probado en MVP; la trazabilidad mejora si se completa, pero el registro con placa es vÃ¡lido.
- **Impacto:** backend â€” capturar P2002 de `vin`/`engine_number` en `create()` y mapearlo a 409 (antes 500). Frontend â€” campo VIN opcional con nota.
- **Alternativas descartadas:** VIN obligatorio (fricciÃ³n); texto libre de VIN (rompe unicidad/trazabilidad).

### D-037 â€” Placa: formato libre + normalizaciÃ³n a mayÃºsculas

- **DecisiÃ³n:** placa alfanumÃ©rica de 2â€“10 caracteres. El backend normaliza `trim().toUpperCase()` tanto al buscar como al guardar, impidiendo duplicados "abc123" vs "ABC123". Sin regex por paÃ­s en MVP.
- **RazÃ³n:** el producto no define un formato nacional Ãºnico; la normalizaciÃ³n canonical evita duplicados case-insensitive con costo mÃ­nimo.
- **Impacto:** validaciÃ³n DTO (`@Matches(/^[A-Za-z0-9]{2,10}$/)`), normalizaciÃ³n en handler (armoniza busca+guarda) y en `findByLicensePlate` (red de seguridad).
- **Alternativas descartadas:** regex por paÃ­s (MVP multi-paÃ­s sin decisiÃ³n); solo trim (no resuelve case-insensitive).

### D-038 â€” CatÃ¡logo opcional, sin texto libre

- **DecisiÃ³n:** el selector marca â†’ modelo â†’ versiÃ³n (catÃ¡logo) es opcional. Si no se selecciona versiÃ³n, el vehÃ­culo se guarda con `versionId: null` y la UI muestra marca/modelo/versiÃ³n como "â€”". No hay campos de texto libre para marca/modelo/versiÃ³n en esta iteraciÃ³n.
- **RazÃ³n:** el catÃ¡logo ya existe; el texto libre degradarÃ­a la consistencia de datos y complicarÃ­a el timeline futuro (F-013).
- **Impacto:** frontend â€” cascada brands/models/versions on-demand; si el catÃ¡logo falla, el registro sigue sin versionId. Backend â€” sin cambios (versionId ya es opcional).
- **Alternativas descartadas:** texto libre (deuda de normalizaciÃ³n de datos); catÃ¡logo obligatorio (bloquea registros cuando el catÃ¡logo estÃ¡ incompleto).

## Implementado

### Backend (robustez, sin migraciÃ³n â€” el schema no cambiÃ³)

| Ãtem | Detalle |
| ---- | ------- |
| D-037 | `register-vehicle.dto.ts` â€” `@Matches(/^[A-Za-z0-9]{2,10}$/)` (mensaje espaÃ±ol). |
| D-037 | `register-vehicle.handler.ts` â€” `trim().toUpperCase()` antes de `findByLicensePlate` y `create`; pre-check placa â†’ 409 conservado. |
| D-037 | `prisma-vehicle.repository.ts` â€” `findByLicensePlate()` normaliza su input (red de seguridad). |
| D-036 | `prisma-vehicle.repository.ts` `create()` â€” captura `PrismaClientKnownRequestError` P2002, inspecciona `meta.target` (`license_plate`/`vin`/`engine_number`) y relanza `ConflictException` con mensaje especÃ­fico en espaÃ±ol; fallback genÃ©rico. |
| Contrato | `list-vehicles.handler.ts` â€” `GET /api/vehicles` devuelve Ã­tems con shape `VehicleResponseDto` (brand/model/version desnormalizados vÃ­a include) + ownerships activas + foto primaria + `meta` (antes raw Prisma). |

### Frontend (journey completo)

| Ãtem | Detalle |
| ---- | ------- |
| API | `src/lib/api.ts` â€” `toApiError` + `vehicleApi` (listVehicles, registerVehicle, listBrands, listModels, listVersions) sobre el cliente ky existente (refresh 401 ya integrado); sin `X-Context-Type` (D-035). |
| Tipos | `src/types/vehicle.ts` â€” `Vehicle`, `VehicleListResponse/Meta`, `VehicleBrand/Model/Version`, `RegisterVehicleInput` (brand/model/version opcionales por tolerancia). |
| Listado | `src/app/(dashboard)/vehicles/page.tsx` â€” listado con estados loading/error/vacÃ­o; CTA "Registrar vehÃ­culo"; paginaciÃ³n con `meta`. |
| Formulario | `src/app/(dashboard)/vehicles/new/page.tsx` â€” RHF + zod (placa 2â€“10 alfanumÃ©rica normalizada; VIN opcional con nota D-036; cascada catÃ¡logo on-demand D-038); 409 mapeado por campo (licensePlate/vin) o general (engineNumber); valores preservados en error; post-201 â†’ invalidate + refreshSession + redirect `/vehicles`. |
| UI | `src/components/ui/select.tsx` + `textarea.tsx` (primitivas nativas, patrÃ³n shadcn existente). |
| NavegaciÃ³n | `src/app/(dashboard)/dashboard/page.tsx` â€” card "Mis vehÃ­culos"; `src/proxy.ts` â€” `/vehicles` en `protectedRoutes`. |

## Decisions tÃ©cnicas del Tech Lead (divergencias a validar)

El Tech Lead emitiÃ³ `DESIGN-F-010` con 7 decisiones (D1 contrato uniforme, D2 normalizaciÃ³n, D3 validaciÃ³n, D4 P2002, D5 sin migraciÃ³n, D6 tests, D7 contrato frontend). Estado de seguimiento:

| Directiva | Estado | Nota |
| --------- | ------ | ---- |
| D1 list vs detail con `VehicleResponseDto` + `meta` | âœ… Implementada | `list-vehicles.handler.ts`. **ValidaciÃ³n TL (2026-09-09):** la sub-instrucciÃ³n `?? []` se descarta deliberadamente â€” el listado NO incluye `documents` en su query de forma intencional (no hay consumidor en MVP; `?? []` mentirÃ­a al consumidor "no tiene documentos" cuando la realidad es "no se consultaron"). Registrada como deuda P2: fix = agregar `documents` al include del list-vehicles handler cuando aparezca un consumidor. |
| D2 normalizaciÃ³n en handler (autoritativa) | âœ… Implementada | + red de seguridad en `findByLicensePlate`. |
| D3 validaciÃ³n DTO | âœ… DecisiÃ³n tÃ©cnica cerrada | **ValidaciÃ³n TL (2026-09-09):** se acepta la normalizaciÃ³n en handler/repository (implementaciÃ³n actual) en lugar de `@Transform` en el DTO. Razones: resultado funcional idÃ©ntico (D-037 satisfecho); mÃ¡s explÃ­cito y testeable; red de seguridad en repository (defensa en profundidad que `@Transform` no brindarÃ­a a llamadas directas al repository); no depende de `transform: true` del ValidationPipe. Sin deuda. |
| D4 P2002 â†’ 409 | âš ï¸ Deuda P1 aceptada (MVP) | **ValidaciÃ³n TL (2026-09-09):** se acepta `ConflictException` (envelope CONFLICT sin `errors.field`) para MVP con un Ãºnico consumidor controlado. El frontend mapea por texto (`conflictField`) â€” frÃ¡gil pero contenido. **Trigger de correcciÃ³n:** segundo consumidor de `POST /api/vehicles` (mobile/API pÃºblica) â†’ bloquear y aplicar fix (~30 lÃ­neas, 5 archivos): `CodedHttpException` + `errors.field` en repository y handler, `expectConflictWithMessage` verifica shape, frontend lee `errors.field` en vez de texto. Inconsistencia con patrÃ³n `record-mileage` (que sÃ­ usa `CodedHttpException` + `errors`) = cosmÃ©tica. |
| D5 sin migraciÃ³n | âœ… Cumplida | Schema intacto; constraints unique ya existÃ­an. |
| D6 tests | âœ… Implementada | 3 specs nuevos (handler, repository, list handler). |
| D7 contrato frontend | âœ… Implementada | SegÃºn D1/D7; el frontend tolera shape opcional de brand/model/version. |

**Resultado del escalamiento al Tech Lead (2026-09-09):** los 3 puntos (D1-DTO, D3, D4) fueron validados y aceptados como estÃ¡n â€” 2 decisiones tÃ©cnicas cerradas sin deuda (D3) o con deuda P2 condicional (D1), y 1 deuda P1 con trigger explÃ­cito (D4). **No se requiriÃ³ implementaciÃ³n adicional del backend-engineer.**

## VerificaciÃ³n

- Backend: `npm test` â†’ **22 suites / 185 tests PASS** (19/173 previos + 3 suites/12 tests nuevos: register-vehicle.handler, prisma-vehicle.repository, list-vehicles.handler) Â· `npm run build` exit 0.
- Frontend: `npm test` â†’ **34/34 PASS** (4 suites nuevas: vehicles list 4, register form 5, proxy +3, api +3) Â· `npm run build` exit 0 (rutas `/vehicles` y `/vehicles/new` prerenderizadas; proxy activo).
- Sin cambios de schema; sin migraciones; sin nuevas dependencias (RHF + zod ya estaban en el proyecto).

## Observaciones / deuda registrada

- **Puntos del Tech Lead a validar** (escalados el 2026-09-09; no los resuelve el PM):
  1. `vehicle-response.dto.ts` `?? []` no aplicado â†’ key-drifting list vs detail persiste en `documents`.
  2. `@Transform` del DTO omitido por el engineer (divergencia deliberada documentada).
  3. Envelope 409 sin `errors.field` tipado (usa `ConflictException` en vez de `CodedHttpException`).
- **Mensajes de error en espaÃ±ol:** el pre-check de placa ahora responde en espaÃ±ol (el snapshot de la spec Â§5 lo tenÃ­a en inglÃ©s â€” el AC Â§10 y el journey 6.2 exigen espaÃ±ol). Sin consumidores previos del mensaje en inglÃ©s; el `code` (`CONFLICT`) no cambia.
- **`engineNumber` no estÃ¡ en el formulario MVP:** su 409 se muestra como error general de submit (no es campo del form).
- **E2E pendiente:** el journey completo aÃºn no se verificÃ³ contra el backend real con base de datos (tests unitarios + build verdes). QA debe correr el flujo completo (registro â†’ listado â†’ dashboard isVehicleOwner) antes del cierre formal.

## Cierre de implementaciÃ³n (2026-09-09)

| DecisiÃ³n | Estado | ImplementaciÃ³n |
| -------- | ------ | -------------- |
| D-035 | âœ… Aprobada e implementada | Frontend sin `X-Context-Type`; ownership automÃ¡tico por el repository existente. |
| D-036 | âœ… Aprobada e implementada | VIN opcional en formulario (nota de trazabilidad); P2002 vin/engine â†’ 409. |
| D-037 | âœ… Aprobada e implementada | `@Matches` 2â€“10 + normalizaciÃ³n trim/UPPER en handler y `findByLicensePlate`. |
| D-038 | âœ… Aprobada e implementada | Cascada catÃ¡logo on-demand; registro sin versionId funciona; UI "â€”" ante ausencia. |
| Contrato list | âœ… Implementada (validaciÃ³n TL pendiente) | `GET /vehicles` con shape `VehicleResponseDto` + `meta`; divergencias D1-DTO/D3/D4 registradas arriba. |

VerificaciÃ³n global: backend `npm test` 22 suites / 185 PASS Â· backend `npm run build` exit 0 Â· frontend `npm test` 34/34 PASS Â· frontend `npm run build` exit 0.

---

# 17. Registro (2026-09-09): QA E2E F-010 + mini-iteraciÃ³n de correcciÃ³n (F-1/F-2)

## Objetivo

Ejecutar el plan de QA E2E de F-010 (Registrar VehÃ­culo) contra backend real + BD local, verificar el journey UI, y corregir los hallazgos detectados antes de dar por cerrada la iteraciÃ³n.

## Cobertura QA (ejecutada 2026-09-09)

### API / BD (backend-engineer) â€” 12 casos en primera pasada
| Resultado | Casos |
|---|---|
| **PASS** (10) | Login seed 201+cookies; ownership en BD correcta; placa duplicada lowercaseâ†’409 (D-037); VINâ†’409 sin 500; engineNumberâ†’409 sin 500; sin sesiÃ³nâ†’401; `GET /vehicles` con `meta` + shape desnormalizado; `GET /:id` 200/403/404; catÃ¡logo cascada 200; POST sin versionIdâ†’201 `versionId:null` (D-038); listado con ownerships activas. |
| **FAIL parcial** (1) | **F-1:** `POST /api/vehicles` con `versionId` vÃ¡lido â†’ 201 pero `brand/model/version: null` (AC Â§10 no cumplido; `create()` sin include). |
| **FAIL integraciÃ³n** (1) | **F-2:** 9/10 versiones del catÃ¡logo seed con IDs `00000000-...-0001..009` rechazadas con 400 por `@IsUUID()` (seed, no DTO). En UI real, elegir la mayorÃ­a de las versiones del catÃ¡logo â†’ 400. |

### UI (frontend-tech-lead) â€” 10 casos
8 PASS Â· 1 PARTIAL (QA-U5: manejo 409 engineNumber/fallback correcto en cÃ³digo, sin tests â€” LOW) Â· 0 FAIL.
4 vacÃ­os de cobertura LOW: test 409 engineNumber, test 409 fallback, test dashboard card "Mis vehÃ­culos", edge cases zod (min/max placa, rango aÃ±os). 34/34 tests PASS + build OK (rutas `/vehicles` y `/vehicles/new` generadas).

## ValidaciÃ³n tÃ©cnica (Tech Lead)

- **F-1:** causa raÃ­z confirmada (`vehicle.create` sin include; el patrÃ³n ya existÃ­a en list/get). DecisiÃ³n: agregar `include: { version: { include: { model: { include: { brand: true } } } } }` en `create()` (Ãºnico round-trip, consistente con list/detail). Descartado refetch tras create (ventana de carrera) y handler-lectura (viola patrÃ³n).
- **F-2:** `@IsUUID()` en class-validator 0.15.1 delega a `validator` con `version='all'` â€” verificado empÃ­ricamente: **`@IsUUID('all')` NO acepta los IDs del seed** (fallan por dÃ­gito de versiÃ³n `0`; solo `'loose'` los aceptarÃ­a). El DTO es correcto; el defecto es del **seed**. Opciones: A) re-seed con v4 deterministas (recomendada), B) re-seed sin id explÃ­cito (rompe idempotencia), C) `@IsUUID('loose')` (deuda fallback, degrada contrato), D) `'all'` (no resuelve).

## Correcciones aplicadas y verificadas (10/10 PASS en re-QA)

### F-1 (commit `f8d6654`) â€” hidrataciÃ³n en create
- `prisma-vehicle.repository.ts` `create()`: + include de `version.model.brand` (idÃ©ntico a list/get).
- `vehicle.repository.ts`: tipo de retorno con relaciÃ³n hidratada (sin mover al DTO para evitar dependencia repositorioâ†’DTO).
- Tests: +1 en `prisma-vehicle.repository.spec.ts` (assert include) + nuevo `vehicle-response.dto.spec.ts` (2 casos: con rama poblada â†’ nombres; sin versiÃ³n â†’ `null`, no rompe).
- VerificaciÃ³n: 23 suites / 188 tests PASS + build OK + e2e 201 con `brand:"Toyota", model:"Corolla", version:"1.8 XLI"`.

### F-2 (commit `e07cf9b`) â€” IDs de catÃ¡logo v4 deterministas
- **Estrategia (Database):** migraciÃ³n de datos versionada (no re-seed directo) porque 2 vehÃ­culos reales referenciaban `...007`/`...008`. Re-key en sitio (`UPDATE vehicle_versions SET id = <v4> WHERE id = <v0>` Ã— 9) aprovechando `ON UPDATE CASCADE` de la FK (actualiza automÃ¡ticamente los vehÃ­culos referenciantes; atÃ³mico; no-op en BD frescas).
- MigraciÃ³n: `prisma/migrations/20260909000001_fix_catalog_version_ids/migration.sql` (SQL puro, sin cambios de schema).
- `prisma/seed.ts`: 9 IDs `00000000-0000-0000-...-0001..009` â†’ `00000000-0000-4000-8000-...-0001..009` (v4 deterministas; `crypto.randomUUID()` descartado por idempotencia).
- VerificaciÃ³n: seed idempotente (doble `db:seed`, sin duplicados), catÃ¡logo expone solo v4, POST 201 con versiÃ³n del catÃ¡logo (antes 400).
- **Regla para el futuro:** el patrÃ³n `00000000-...` determinista es correcto para catÃ¡logo semilla vÃ­a upsert, pero **no debe usarse para entidades de usuario** (vehicles/users).

## Re-QA de cierre (backend-engineer) â€” 10/10 PASS

QA-2 (registro con versiÃ³n â†’ brand/model/version no-null; sin versiÃ³n â†’ null, D-038) Â· QA-5 (placa/VIN/engine duplicados â†’ 409, no 500) Â· QA-6 (listado/detalle desnormalizados, 403/404, catÃ¡logo sin IDs v0). BD restaurada a estado previo (4 vehÃ­culos, 10 versiones; registros de prueba eliminados en transacciÃ³n).

## Deuda / decisiones pendientes detectadas en el cierre

1. **Bug pre-existente `DELETE /api/vehicles/:id` â†’ 500** (descubierto por Database, NO introducido por F-2): el handler borra fÃ­sicamente cuando no hay historial, pero `VehicleOwnership.vehicle` es `onDelete: Restrict` â†’ `prisma.vehicle.delete` falla con P2003 para todo vehÃ­culo creado vÃ­a API. DecisiÃ³n del TL recomendada: **ticket separado** (probablemente ampliar `hasHistory` a ownerships y/o borrar ownerships sin historial en la misma transacciÃ³n). **No bloquea** la iteraciÃ³n F-010; se agenda para F-011 o prÃ³xima iteraciÃ³n de vehÃ­culos.
2. **Baseline QA con datos de prueba previos:** `QA2ZZZ9` y `QA11PLACA` (owner user2) permanecen como vehÃ­culos de desarrollo. DecisiÃ³n de depuraciÃ³n: Database/Tech Lead pueden limpiarlos en una pasada dedicada.
3. **Proceso backend en 3001:** quedÃ³ corriendo el `dist` nuevo con F-1 (PID 25180 al cierre). Entorno de dev; finalizable si no debe quedar procesos colgados.
4. **Datos QA primera pasada vs baseline:** los criterios del QA asumieron baseline "4 vehÃ­culos"; los registros QA previos forman parte de ese conteo. Documentado para no volver a contar como pÃ©rdida.

# 18. Registro (2026-09-11): F-011 Editar Vehï¿½culo end-to-end (D-039..D-043)

## Objetivo

Completar el journey de ediciï¿½n de vehï¿½culo (F-011) de extremo a extremo: el owner edita sus vehï¿½culos desde "Mis vehï¿½culos" con PATCH parcial, duplicados a 409, normalizaciï¿½n de placa, y persistencia de null al vaciar campos opcionales.

## Decisiones de producto confirmadas (2026-09-11)

### D-039 ï¿½ Solo el owner puede editar
- `PATCH /api/vehicles/:id` usa `assertVehicleOwned` (no `assertVehicleAccess`). Usuarios con acceso compartido consultan (GET) pero no editan en MVP.
- La UI solo muestra "Editar" cuando `ownerships` tiene `type: 'owner'` activa (verificado por `o.userId === user.id && o.type === 'owner' && !o.endsAt`).
- Alternativas descartadas: permitir ediciï¿½n a co-owners (equivaldrï¿½a a transferencia informal, fuera de MVP); mantener `assertVehicleAccess` (habilitarï¿½a ediciï¿½n a cualquier acceso compartido).

### D-040 ï¿½ Campos editables = todos los del alta, en PATCH parcial
- Mismos campos de `RegisterVehicleDto`, solo los enviados. Corregir el VIN mal registrado es legï¿½timo: el `id` y el historial permanecen.

### D-041 ï¿½ Duplicados al editar ? 409, no 500
- `P2002` (placa/VIN/engine) en `update()` se traduce igual que en register (mensaje especï¿½fico; reuso de `mapUniqueViolation`).

### D-042 ï¿½ Normalizaciï¿½n de placa tambiï¿½n al editar
- `trim().toUpperCase()` antes de buscar/guardar en el update (igual que D-037).
- Solo condicional: si `licensePlate` no viene en el PATCH, no se toca (guard `typeof === 'string'`; nunca `undefined`?`null`).

### D-043 ï¿½ Vaciar campos opcionales en ediciï¿½n persiste null
- Campo opcional de texto/nï¿½mero vaciado por el usuario (`vin`, `engineNumber`, `color`, `notes`, `manufactureYear`, `modelYear`) se envï¿½a como `null` explï¿½cito ? backend persiste NULL.
- **El catï¿½logo (`versionId`) NUNCA viaja `null`:** si no cambia, se omite (`undefined`) para no borrar la rama (RF-2). `licensePlate` es obligatoria y no se vacï¿½a.
- Comprobado empï¿½ricamente por backend: `class-validator 0.15.1` con `@IsOptional()` acepta `null`; `null` en Prisma = SET NULL (vs `undefined` = no tocar); columnas opcionales son nullable en schema. Sin cambios de producciï¿½n backend necesarios para D-043 ï¿½ solo tests (6 nuevos).

## Decisiones tï¿½cnicas validadas por el Tech Lead (2026-09-11)

1. **Controller PATCH**: `assertVehicleOwned` (D-039) + el 200 DEBE devolver `VehicleResponseDto.from(vehicle)` (mismo patrï¿½n que `create()`/`findOne()`; sin esto el 200 respondï¿½a raw Prisma anidado). Verificado en cï¿½digo y smoke e2e.
2. **P2025 (registro no encontrado en `update()`) ? NO se mapea.** El engineer verificï¿½ con docs oficiales que `prisma.model.update` con `where` inexistente lanza P2025 (no P2001). TL aceptï¿½ el no-mapeo: coherente con el proyecto (0 mapeos P2025 existentes; 404 vï¿½a `findById` pre-operaciï¿½n; race window ï¿½nfimo y solo con hard-delete de vehï¿½culo sin historial).
3. **No-op PATCH `{}` sin hidratar ? aceptado como deuda.** Edge case solo alcanzable con body literal `{}` (el frontend siempre envï¿½a el form completo). Hidratar exigirï¿½a cambiar la interfaz `VehicleRepository.findById`: costo desproporcionado. Deuda registrada.
4. **`brandId`/`modelId` agregados a `VehicleResponseDto` (cambio exigido por el TL).** Riesgo ~0 verificado (specs usan asserts por propiedad, no `toEqual` completo). Elimina el workaround de preselecciï¿½n de catï¿½logo por nombre en el frontend (colisiones de nombres; edge case del no-op). Reemplazo del workaround por IDs en la cascada = follow-up de frontend.

## Cambios tï¿½cnicos aplicados

### Backend (commit `78c2619`)
- `vehicles.controller.ts` PATCH `:id`: `assertVehicleOwned` + `VehicleResponseDto.from` (shape aplanado en 200).
- `update-vehicle.handler.ts`: guard PATCH `{}` ? no-op 200 sin llamar a `update()`; normalizaciï¿½n placa D-042 condicional; sin eventos nuevos.
- `prisma-vehicle.repository.ts` `update()`: include `version.model.brand` (idï¿½ntico a create/list/get), P2002?409 reusando `mapUniqueViolation`, red de seguridad D-042 condicional (`typeof licensePlate === 'string'`).
- `vehicle.repository.ts`: tipo de retorno `update` ? `HydratedVehicle` idï¿½ntico a `create()`.
- `vehicle-response.dto.ts`: + `brandId`/`modelId` (aditivo, desde relaciï¿½n ya hidratada).
- Tests: 24 suites / 206 tests (handler update 8, repository update 17, DTO 2; +6 por D-043).
- Smoke e2e (backend 3001): 200 aplanado con brand/model/version ï¿½ 409 placa duplicada ï¿½ 403 no-owner ï¿½ 404 inexistente ï¿½ PATCH `{}` 200 no-op ï¿½ `{ color: null }` persiste NULL. Registros QA limpiados en transacciï¿½n.

### Frontend (commit `8f518c1`)
- `api.ts`: + `getVehicle`/`updateVehicle`; `types/vehicle.ts`: `UpdateVehicleInput` con opcionales `string | null`.
- Pï¿½gina `/vehicles/[id]/edit`: precarga GET /:id, cascada con preselecciï¿½n, PATCH parcial, manejo 409/403/404/401, invalidate + redirect.
- `vehicle-form-schema.ts` (mï¿½dulo compartido): `vehicleFormSchema` extraï¿½do de `new/page.tsx` (alta y ediciï¿½n no divergen) + `toEditVehicleInput` (regla D-043: vacï¿½o con prefill contenido ? `null`; vacï¿½o sin prefill ? omitido; `versionId` cambia solo si se modificï¿½).
- Listado: botï¿½n "Editar" solo owner (D-039).
- Tests: 6 files / 51 tests (+4 D-043: `color: null`, omitir vacï¿½os, `manufactureYear: null` no `0`, `versionId` omitido si no cambia) + build OK (ruta dinï¿½mica `/vehicles/[id]/edit`).

## Deuda / decisiones pendientes detectadas en el cierre

1. **Deuda de contrato: no-op PATCH `{}`** ? 200 con `versionId` poblado pero `brand/model/version: null` (fix = hidratar retorno del no-op, follow-up barato; no alcanzable por consumidor MVP).
2. **Deuda preexistente (nueva, TL): `findById` no filtra `deletedAt`** ? PATCH sobre vehï¿½culo soft-deleted (ADR-005) editarï¿½a el registro. Backlog; NO accionar en la misma iteraciï¿½n.
3. **Deuda de validaciï¿½n (backend-engineer, escalada): `PartialType()` agrega `@IsOptional()` a TODOS los campos, incluido `licensePlate`** ? `PATCH` con `{ licensePlate: null }` pasarï¿½a validaciï¿½n y reventarï¿½a en `null.trim()` ? 500 (deberï¿½a ser 400). El frontend nunca lo envï¿½a (zod bloquea vacï¿½o; D-043 no aplica a placa). Fix sugerido (fuera de alcance): rechazar null en `licensePlate` en `UpdateVehicleDto` (ej. `@ValidateIf` + `@IsNotEmpty()`) + test de validaciï¿½n. Backlog.
4. **Detecciï¿½n de owner en frontend por `ownerships`** (`userId` + `type` + `!endsAt`): depende del shape real del listado; verificado en tests. Si el contrato del listado cambia, revisitar.
5. **Bug pre-existente `DELETE /api/vehicles/:id` ? 500** (Secciï¿½n 17): sigue como ticket separado, NO tocado en F-011.
6. **Proceso backend en 3001:** quedï¿½ corriendo el `dist` nuevo (PID 10364 al cierre). Entorno de dev; finalizable si no debe quedar procesos colgados.

# 19. Registro (2026-09-11): F-012 Buscar Vehï¿½culo end-to-end (D-044..D-045)

## Objetivo

Permitir al propietario encontrar un vehï¿½culo dentro de su lista escribiendo parte de la placa (bï¿½squeda en vivo con debounce), manteniendo el shape y contrato existentes del listado.

## Decisiones de producto confirmadas (2026-09-11)

### D-044 ï¿½ Bï¿½squeda por placa parcial en la lista del propietario
- `GET /api/vehicles?q=` filtra por `licensePlate` con `contains` + `mode: 'insensitive'` (case-insensitive), combinado con AND al scope de ownership existente.
- `q` se normaliza con `trim()`; mï¿½nimo 2 caracteres tras trim para filtrar; con menos, se comporta como sin `q`.
- Param aditivo en la ruta existente (NO se creï¿½ `/vehicles/search`: `@Get(':id')` ya registrado en `vehicles.controller.ts` L356 harï¿½a que una ruta `/vehicles/search` mal ordenada fuera capturada por `:id` ? 404/400).
- Sin permiso nuevo: el listado es ownership-scoped, no permission-gated (verificado).
- Alternativas descartadas: bï¿½squeda por VIN/nï¿½mero de motor (no son datos que el dueï¿½o recuerde de memoria); filtros marca/modelo/aï¿½o (navegaciï¿½n de catï¿½logo, no "encontrar mi vehï¿½culo"); ruta separada; query-DTO en esta feature.

### D-045 ï¿½ Filtros de catï¿½logo post-MVP
- Filtros por marca/modelo/aï¿½o quedan post-MVP (el owner busca por placa, dato que ya conoce). Cuando lleguen, es el momento coordinado de introducir `ListVehiclesQueryDto` (hoy params crudos + interfaz interna, decisiï¿½n TL).

## Decisiones tï¿½cnicas validadas por el Tech Lead (2026-09-11)

1. **Param aditivo en `GET /api/vehicles?q=`** (no ruta separada) ï¿½ evita foot-gun de `@Get(':id')`.
2. **Donde: `licensePlate: { contains, mode: 'insensitive' }` combinado con AND con `ownerships.some(userId, endsAt: null)`** ï¿½ preserva la frontera IDOR (solo se busca dentro de la lista del owner). `meta.total` filtrado automï¿½ticamente (`count({ where })` reusa la misma variable).
3. **Mantener params crudos + interfaz interna** (`q?: string` en `ListVehiclesQuery`). NO crear query-DTO: serï¿½a el primero del codebase, sumarï¿½a casos 400 nuevos (rompiendo "sin 4xx nuevos") y crearï¿½a patrï¿½n nuevo a mitad de feature. Cuï¿½ndo sï¿½: con filtros marca/modelo (D-045).
4. **Guard `typeof query.q === 'string'`** obligatorio: `?q=a&q=b` entrega array y `.trim()` explotarï¿½a. Normalizaciï¿½n en el handler (testeable sin HTTP). Hardening `slice(0, 20)` (placa VarChar(20)).
5. **Frontend: `placeholderData: keepPreviousData` OBLIGATORIO** (React Query v5): con queryKey dinï¿½mico cada cambio de `q` crea una query sin cachï¿½; sin el placeholder, `isLoading` desmontarï¿½a la lista en cada tipeo (regresiï¿½n UX). Hook `useDebounce` propio en `frontend/src/hooks/` (sin dependencias).
6. **`contains` (`%q%`) no usa el ï¿½ndice B-tree** (ni `@unique` ni `@@index([licensePlate])` ï¿½ ese ï¿½ndice es redundante con el unique y no da soporte de bï¿½squeda). Riesgo Baja en MVP: volumen post-ownership es de docenas de filas. Trigram/full-text = decisiï¿½n aparte si crece.
7. **Quirk LIKE wildcards** (`%`/`_` en la entrada actï¿½an como wildcards; `q="A_B"` matchea "AXB"): semï¿½ntica inesperada, no es issue de seguridad (parametrizado), aceptada y documentada en spec ï¿½12.

## Cambios tï¿½cnicos aplicados

### Backend (commit `f9c6917`)
- `vehicles.controller.ts` `findAll`: + `@Query('q') q?: string` ? handler.
- `list-vehicles.handler.ts`: `q?: string` en `ListVehiclesQuery`; normalizaciï¿½n (guard `typeof` + `trim()` + mï¿½nimo 2 + `slice(0,20)`); `where` tipado `Prisma.VehicleWhereInput` combinando ownership AND `licensePlate contains/insensitive`; orden/include/paginaciï¿½n intactos. Import `Vehicle` sin uso limpiado.
- Tests: 24 suites / 214 tests (6 nuevos: composiciï¿½n AND, insensitive, trim, <2 chars, no-string sin crash, sin match ? data [] + meta.total 0). Los 3 tests de regresiï¿½n F-010 del listado pasan sin modificaciï¿½n (RF-2).

### Frontend (commit `ae6dae8`)
- `frontend/src/hooks/use-debounce.ts` (nuevo): debounce genï¿½rico ~300ms, sin dependencias.
- `api.ts` `listVehicles`: firma `{ page?, limit?, q? }`; `searchParams` con `q` solo si estï¿½ presente (no enviar `q=""`).
- `/vehicles/page.tsx`: input controlado (label sr-only, placeholder "Buscar por placaï¿½", `maxLength={20}`, botï¿½n limpiar con aria-label), `useDebounce` ? `effectiveQ` (trim >= 2), queryKey dinï¿½mico `["vehicles", PAGE, LIMIT, effectiveQ]`, `placeholderData: keepPreviousData`, estados vacï¿½os ramificados por `effectiveQ` ("No se encontraron vehï¿½culos con esa placa" + CTA limpiar vs. vacï¿½o real). Invalidaciï¿½n de F-011 intacta (match por prefijo).
- Tests: 6 files / 56 tests (pï¿½gina +3 con fake timers y `settle()` 4-pass; api +2 con/sin q). `/vehicles` sigue estï¿½tica en build.

## Deuda / decisiones pendientes detectadas en el cierre

1. **Soft-deleted en listado/bï¿½squeda** sigue abierto: ticket follow-up sistï¿½mico de soft-delete filtering (Secciï¿½n 18, ï¿½tem 2). La bï¿½squeda hace los vehï¿½culos retirados levemente mï¿½s "descubribles" (un owner puede buscar una placa dada de baja); mismo defecto que el listado, no es nuevo. Decisiones de producto pendientes: archivo/retirados, reactivaciï¿½n, 404 vs 410.
2. **`?page=abc` ? NaN** en el listado (deuda preexistente): se arreglarï¿½ con el query-DTO cuando lleguen los filtros marca/modelo (D-045 post-MVP). NO se tocï¿½ en F-012.
3. **Import `Vehicle` limpiado** en `list-vehicles.handler.ts` (deja `import { Prisma }`), tras el escaneo del engineer ï¿½ sin cambio funcional.

# 20. Registro (2026-09-11): F-013 Vista de Detalle del Vehículo end-to-end (D-046..D-049)

## Objetivo

Completar el journey de visualización y gestión de la información del vehículo: el usuario abre el detalle desde "Mis vehículos" (click en la card), ve ficha + galería de fotos + documentos + últimos kilometrajes, y (si es owner) gestiona fotos/documentos/km. El backend de fotos/documentos/mileage ya existía; F-013 consumió ese contrato, ajustó autorización y agregó URLs firmadas en batch.

## Decisiones de producto confirmadas (2026-09-11)

### D-046 — La vista de detalle es accesible a owner y usuarios con acceso compartido (lectura)

- `GET /api/vehicles/:id` mantiene `assertVehicleAccess` (owner OR shared OR super_admin). Toda la card del listado es cliqueable → `/vehicles/:id`.
- El botón "Editar" sigue solo para owners (D-039).

### D-047 — La vista de detalle MVP muestra: ficha + galería de fotos + documentos + últimos 5 kilometrajes

- Los últimos 5 km vienen en GET /:id (sin llamada extra). El timeline/historia completa (transfers, mileages completos, ownerships) es F-014 (`GET :id/history` ya existe, sin consumir en la UI).

### D-048 — Escritura de fotos/documentos/mileage desde la vista: solo el owner

- Writes (`POST`/`PATCH`/`DELETE` de photos y documents, `POST mileage`) pasan de `assertVehicleAccess` a `assertVehicleOwned`; los reads se mantienen con `assertVehicleAccess`.
- Consistente con D-039 (el acceso compartido es solo lectura en MVP). Alternativa descartada: mantener el comportamiento actual (shared escribe) — contradice el principio de que solo el propietario modifica su vehículo en el MVP.
- **Matiz confirmado por el usuario (2026-09-11):** las fotos del vehículo las carga el dueño en el MVP. El flujo "el mecánico sube fotos del antes/después de un servicio" es **post-MVP**: requiere contexto workshop + vínculo foto ↔ service record + autorización por membresía + posible campo de actor en `VehiclePhoto`. D-048 NO lo bloquea (ver spec §8).

### D-049 — Limpiar el vencimiento de un documento al editarlo borra el vencimiento (NULL en BD)

- `expiresAt: null` en `PATCH :id/documents/:docId` → `expiresAt: null` en BD (three-way `undefined` = no tocar / `null` = borrar / string = `new Date`). Coherente con D-043.
- Corrige bug real verificado: `new Date(null)` = epoch 1970 (el DTO con `@IsOptional()` dejaba pasar `null`).

## Decisiones técnicas validadas por el Tech Lead (2026-09-11)

1. **D-048 es EXCLUSIVAMENTE del controller.** Los handlers de photos/documents/mileage no contienen lógica de autorización interna ni acceden a `VehicleAccess`; `recordedByUserId` se persiste tal cual. No se modifican handlers. No se rompe ningún test existente (no había tests de autorización; se crearon — obligatorio).
2. **Batch signed URLs con query param `?signed=true` en los listados** (backward compatible): `GET :id/photos?signed=true` → `+url +expiresAt`; `GET :id/documents?signed=true` → `+url +urlExpiresAt` (nombre `urlExpiresAt` para no chocar con `expiresAt` del documento). Sin el param, el contrato queda intacto. **NO se modifica `VehicleResponseDto`** (el listado no necesita URLs firmadas; no pagar costo de firmado).
3. **La vista de detalle hace 3 llamadas:** `GET /:id` (ficha + ownerships + km 5 + photos/documents crudos) + `GET photos?signed=true` + `GET documents?signed=true` (estas dos en paralelo). URLs firmadas expiran (`SIGNED_URL_EXPIRES_SECONDS`, default 3600s).
4. **Navegación sin `<Link>` anidado** (Next.js no lo soporta): card como `div role="link"` + `router.push`, botón "Editar" con `e.stopPropagation()`.
5. **NO se agrega `PermissionsGuard`** en esta iteración: los códigos `vehicle.photos.*`, `vehicle.documents.*`, `vehicle.history.*` existen en seed pero no se verifican en ninguna ruta; la autorización sigue ownership-scoped. Los permisos granulares se activarán con el contexto workshop (post-MVP).
6. **Tests de autorización como blocker de cierre** (§12 spec): no existían; se crearon para las 7 rutas de escritura (403 shared / 200 owner / handler NO ejecutado tras 403) + signed URLs (presencia/ausencia de `url`, `?signed=false` tratado como unsigned).

## Cambios técnicos aplicados

### Backend (commit `ccfba59`)

- `vehicles.controller.ts`: 7 rutas de escritura → `assertVehicleOwned`; `listPhotos`/`listDocuments` con `?signed=true` (url + expiresAt/urlExpiresAt, patrón exacto de `getPhoto`/`getDocument`).
- `update-document.dto.ts`: `expiresAt?: string | null`; `update-document.handler.ts`: three-way `undefined|null|string`.
- Tests: `vehicles.controller.spec.ts` (29 tests: D-048 por ruta, reads intactos, signed URLs) + `update-document.handler.spec.ts` (4 tests: NotFound, omitido, null→null, fecha→Date). **26 suites / 247 tests PASS**, build OK.

### Frontend (commit `c5aed5a`)

- Página `/vehicles/[id]` (nueva): ficha + titular actual (ownership activo, sin PII extra), galería de fotos (grid, primary destacada, upload con progress, set-primary, delete con confirmación), documentos (upload con metadata, edición inline, delete, thumbnail imagen o icono PDF), kilometraje (últimos 5 + registrar km con manejo de monotonicidad). Controles de escritura SOLO owner (D-048); badge "Acceso compartido" para non-owners; errores 404/403/401/4xx con retry; 3 queries en paralelo con progressive rendering; sin dependencias nuevas.
- `api.ts`: +9 funciones (listPhotos/uploadPhoto/setPrimaryPhoto/deletePhoto, listDocuments/uploadDocument/updateDocument/deleteDocument, recordMileage) con multipart + signed URLs + `onUploadProgress`.
- `types/vehicle.ts`: + `VehiclePhoto`, `VehicleDocument`, `VehicleMileage` + `MileageSource`; `photos` tipado (ya no `unknown[]`).
- Listado: cards cliqueables al detalle (sin `<Link>` anidado). Edición: post-guardado redirige a `/vehicles/:id` (antes `/vehicles`).
- Tests: 7 files / 80 tests PASS (detalle 11, api +13, listado +2 navegación, edit redirect) + build OK (ruta dinámica `/vehicles/[id]` registrada).

### Spec (commit `2d1806f`)

- `docs/specs/vehicle-detail-flow.md` (nueva): problema, objetivos, actores, D-046..D-048 + matiz taller post-MVP, contrato backend, journeys owner/shared, RF-1..RF-7, alcance dentro/fuera, decisiones técnicas, criterios de aceptación (11), dependencias, riesgos (incluye blocker de tests de autorización).

## Deuda / decisiones pendientes detectadas en el cierre

1. **Fotos de taller (mecánico) antes/después del servicio — post-MVP (decisión del usuario 2026-09-11):** requiere contexto workshop + vínculo foto ↔ service record/work order + autorización por membresía + posible campo de actor/origen en `VehiclePhoto` (hoy solo `key`/`caption`/`isPrimary`). No bloquea D-048; se habilita cuando exista el flujo de taller.
2. **Soft-deleted en `GET /:id` sigue abierto** (ticket follow-up sistémico de soft-delete filtering, Sección 18 ítem 2). F-013 NO lo empeora: los guards validan ownership/access, no el estado del vehículo. Decisiones de producto pendientes: archivo/retirados, reactivación, 404 vs 410.
3. **Lint del controller (pre-existente):** `ForbiddenException` importado sin uso (presente en HEAD) y patrón `this.storage.getSignedUrl!(key)` con `no-unnecessary-type-assertion` replicado del código original (L221/L294). Ticket cosmético de limpieza aparte; no se ejecutó lint global (`--fix`) fuera de scope.
4. **URLs firmadas expiran (3600s):** el frontend degrada a placeholder si la URL venció; refresh planificado con `expiresAt`/`urlExpiresAt` (futuro).
5. **`?page=abc` → NaN** (deuda preexistente): se arreglará con el query-DTO cuando lleguen los filtros marca/modelo (D-045 post-MVP). NO se tocó.

# 21. Registro (2026-09-11): F-014 Timeline del Vehículo end-to-end (D-050..D-055)

## Objetivo

Mostrar en la vista de detalle una sección "Historial" con los eventos del vehículo ordenados cronológicamente (más reciente primero): transfers, kilometrajes y cambios de propiedad. F-014 es el "Timeline vacío" del roadmap (sin episodios de taller, que son F-020+). El backend ya existía (`GET /api/vehicles/:id/history`); esta iteración fue **frontend puro** (cero cambios de backend).

## Decisiones de producto confirmadas (2026-09-11)

### D-050 — Alcance del timeline: solo transfers, mileages y ownerships

- Consistente con el roadmap (F-014 = "Timeline vacío"). Service records, appointments, work orders y estimates son F-020+ (CareEpisodes, Fase 2). El módulo maintenance tiene su propio endpoint (`GET /maintenance/vehicles/:vehicleId/history`) que se consumirá cuando lleguen los CareEpisodes.

### D-051 — Ubicación: sección "Historial" dentro de la página de detalle (`/vehicles/[id]`)

- Quinta Card debajo de Kilometraje (Ficha → Fotos → Documentos → Km → Historial). Ruta separada `/timeline` descartada: sin beneficio en MVP y agrega navegación.

### D-052 — Orden y desempate: cronológico desc

- Timestamp canónico: `createdAt` (transfers), `recordedAt` (mileages), `startsAt` (ownerships). Sort estable por fecha desc; empates conservan orden de inserción (transfers → mileages → ownerships).

### D-053 — Sin filtros, sin paginación, sin rango de fechas en MVP

- El volumen en MVP es bajo. Los filtros (tipo, rango, actor, búsqueda) son post-MVP.

### D-054 — Transfers: todos los estados se muestran como entries

- `completed`/`pending`/`rejected`/`cancelled`/`expired` → "Transferencia completada/pendiente/rechazada/cancelada/expirada" (cada transfer es un evento visible). Si el volumen se vuelve ruidoso, filtrar post-MVP.

### D-055 — Ownerships: entries de cambio de titular

- "Inicio de propiedad" (primer ownership, lógica asc por `startsAt`) o "Propiedad transferida a [nombre]" (si hay previa). Actor = titular; notas si existen.

## Decisión técnica validada (2026-09-11)

1. **Merge en frontend (lógica pura testeable):** `mergeHistory()` vive en `frontend/src/lib/vehicle-history.ts` (no inline en la página de ~1200 líneas), transforma los 3 arrays del backend en `TimelineEntry[]` ordenados desc. El backend NO se toca (el endpoint ya trae todo; no paginar/filtrar en MVP).
2. **Consulta de history paralela** al patrón existente de photos/documents (`["vehicle", id, "history"]`, `retry: false`), sin `enabled` guard (consistencia con la página).
3. **`VehicleOwnership.notes` agregado al tipo frontend** (aditivo, lo expone el backend en history). `VehicleTransferStatus` como union de los 6 valores del enum Prisma.
4. **PII:** el frontend solo renderiza lo que llega; el backend ya controla emails (Security Review #13). Sin emails en la UI.

## Cambios técnicos aplicados — Frontend (commit `e7fab73`)

- `types/vehicle.ts`: + `VehicleTransferStatus`, `VehicleTransfer`, `VehicleHistoryResponse`; `VehicleOwnership.notes?: string | null`.
- `api.ts`: + `getVehicleHistory(vehicleId)`.
- `src/lib/vehicle-history.ts` (nuevo): `mergeHistory()` + `mileageSourceLabel()` (helper de labels movido del componente para evitar tablas divergentes) + `formatTimelineDate()`.
- Página `/vehicles/[id]`: quinta Card "Historial" con loading (spinner + `role="status"`), error + Reintentar, empty ("Sin eventos registrados"), lista `<ol>` con icono/título/fecha/actor/notas.
- Tests: 9 files / 98 tests (+18: merge 11 → 5 estados D-054 + orden desc + Inicio de propiedad vs transferida; sección 6 → render/loading/error/empty; api 1). Build OK.

### Spec (commit `d4f0f86`)

- `docs/specs/vehicle-timeline-flow.md` (nueva): problema, objetivos, actores, D-050..D-055, contrato backend sin cambios, user journey, RF-1..RF-7, alcance dentro/fuera, criterios de aceptación (6), dependencias, riesgos.

## Deuda / decisiones pendientes detectadas en el cierre

1. **Service records / appointments / work orders / estimates fuera del timeline** (F-020+, CareEpisodes): el propietario que ya tiene actividad de taller registrada no la verá en "Historial" hasta esa fase. Es el alcance decidido (D-050), no un bug.
2. **`vehicle.transferred` event muerto:** la clase `VehicleTransferredEvent` existe pero no se emite en ningún handler. Cuando lleguen los CareEpisodes (F-020+) o una UI de transfers completa, decidir si la timeline consume eventos o sigue leyendo la tabla directamente (read-path actual).
3. **Decisiones pendientes registradas en UNIFIED-BASELINE:** si `history.view` / `vehicle.history.read` deben gatear los endpoints de history (hoy ownership-scoped sin PermissionsGuard) — se resolverá con el contexto workshop.
4. **Todos los estados de transfer visibles (D-054):** si el usuario los encuentra ruidosos (ej. transfers rejected/expired), filtrar post-MVP.
5. **Emails en transfers:** `fromUser`/`toUser` se muestran sin email en todos los casos (el handler solo expone email en ownerships para owner activo). Si una futura UI de transfers lo requiera, revisar PII.
## Objetivo

Completar el journey **"el taller registra el ingreso (check-in) de un vehículo"** end-to-end: selector de contexto WORKSHOP en el frontend + crear CareEpisode (`open`) con datos de check-in. Primera iteración de la Fase 2 (F-020), la única del roadmap que introduce la entidad central `CareEpisode` (D-005, resuelto parcialmente con policy MVP). El propietario sigue sin poder registrar servicios propios (iteración 2-2).

## Decisiones de producto confirmadas (2026-09-11) — P2-1..P2-6 (usuario)

### D-056 — F-020 alcance: solo el taller crea CareEpisodes (P2-1)

- El registro de atenciones es actividad del taller (D-024 A2 ACCEPTED, contexto WORKSHOP obligatorio). El propietario registrando servicios propios (`source=owner`) es la iteración 2-2 (requiere amendar D-024 A2 parcialmente — decisión aparte).

### D-057 — Walk-in permitido: appointment NO obligatorio (P2-2)

- `Appointment = reserva`; `CareEpisode = atención efectivamente iniciada` (D-023). El episodio nace en el check-in (el vehículo ingresa), con o sin appointment previo. `appointmentId` opcional; si viene, debe pertenecer al vehículo y al taller del contexto.

### D-058 — Primer contacto taller↔vehículo por placa (P2-3)

- El taller puede crear un episodio sobre cualquier vehículo existente (lookup por placa exacta) aunque no tenga historial previo. Es el onboarding natural (el taller atiende el vehículo de un cliente). El episodio crea la asociación taller↔vehículo (derivada, D-019 PENDING), visible en la timeline del propietario. Mitigaciones: WorkshopOnly + Throttler 30/60s en el lookup + auditoría vía `createdByMemberId`. El handler valida existencia por `findUnique`, SIN `assertVehicleAccess` full mode (ampliación deliberada de superficie, documentada en AC de la spec).

### D-059 — Permiso `care-episode.create` para owner + mechanic (P2-4)

- Employee NO (se queda solo con appointment). Convención: `module: 'care-episode', resource: 'care-episode', action: 'create'`. Seed idempotente (upsert por code + links por roleId_permissionId).

### D-060 — Trust / nivel de confianza: DIFERIDO (P2-5)

- El Trust Profile es conceptual (ROADMAP 0); no se implementa infraestructura de confianza en esta iteración. La UI puede mostrar "Registrado por {taller}" como dato informativo (sin sistema de trust).

### D-061 — Frontend mínimo de taller (P2-6)

- Selector de contexto (dropdown en header, desde `workshopMemberships`) + página "Nueva atención" (lookup por placa → check-in). Contexto en memoria (D-021 PENDING), por-request vía headers (D-020 A1). SIN la UI completa de taller (Fase 4: F-040..F-045).

## Decisiones técnicas validadas por el Tech Lead (2026-09-11)

1. **Módulo nuevo `src/modules/care-episodes/`** (no extender MaintenanceModule): CareEpisode es entidad central del dominio (ADR-005/D-005), no "un write más de maintenance". Controller + commands + queries + events; sin repository (handler usa `PrismaService`, patrón maintenance).
2. **Lookup fuera de vehicles:** `GET /api/care-episodes/lookup?plate=` (no `GET /vehicles/lookup`). Evita el foot-gun de `@Get(':id')` (F-012) y no contamina el controller PERSONAL-strict (D-035). Guards: Jwt+Context (clase) + WorkshopOnly + Throttler 30/60s (método). Sin permiso granular (el ContextResolver ya valida membership activa).
3. **FKs aditivas con `onDelete: Restrict`** (ServiceRecord/WorkOrder/Estimate.careEpisodeId): ADR-005 T3 clasifica estas entidades como categoría histórica (NO delete físico); `SetNull` destruiría la trazabilidad. Columnas NULLABLE (aditivas, sin backfill); T4 (`careEpisodeId` requerido) se satisface en F-021/F-022 (deuda registrada, no es error). Solo `Appointment` del episodio conserva `SetNull` (patrón `WorkOrder.appointmentId`).
4. **Guard order:** WorkshopOnlyGuard ANTES de PermissionsGuard (evita bypass de super_admin desde PERSONAL; verificado por test de matriz).
5. **Rate-limit existente:** `@nestjs/throttler` (add-on por endpoint, NO global en app.module). `@Throttle({ default: { limit: 30, ttl: 60_000 } })` en lookup: 30/60s mitiga enumeración sin romper UX de check-in (el default 10/60s sería demasiado agresivo para búsquedas legítimas).
6. **Evento `care-episode.created`** (extiende BaseEvent) emitido SOLO tras éxito de persistencia; in-process EventEmitter2 sin outbox (decisión de arquitectura existente).
7. **Frontend:** store `active-context` puro + `useSyncExternalStore` (sin librería nueva); inyector `beforeRequest` de ky; **exclusión de TODAS las rutas `auth/*`** (más amplia que las 5 enumeradas en la spec — aceptada: el ciclo de cuenta nunca debe arrastrar contexto, un contexto stale en `/auth/me` rompería el bootstrap con 403 INVALID_CONTEXT); `logout()/.clearSession()` resetean el contexto a `null` (próximo login en PERSONAL limpio).

## Cambios técnicos aplicados — Backend (commit `feat(care-episodes)`)

- `schema.prisma` + migración `20260911180704_add_care_episodes` (ADITIVA, sin backfill): modelo `CareEpisode` (`care_episodes`), enum `CareEpisodeStatus { open delivered cancelled }`, FKs Restrict (vehicle/workshop/branch/createdByMember), appointment SetNull, índices `[vehicleId, createdAt]`/`[workshopId, createdAt]`/`[status]`, FK nullable `careEpisodeId` en ServiceRecord/WorkOrder/Estimate (Restrict).
- `src/modules/care-episodes/` (nuevo): controller (`POST /api/care-episodes` guard chain Jwt+Context+WorkshopOnly→Permissions+`care-episode.create`; `GET /api/care-episodes/lookup?plate=` con Throttler 30/60s y datos mínimos sin VIN/engineNumber/owner), command + handler create (validaciones vehículo/branch/appointment, status open, checkedInAt), query lookup (placa normalizada trim+uppercase), evento, DTO.
- `app.module.ts`: `CareEpisodesModule` registrado después de MaintenanceModule.
- `seed.ts`: permiso `care-episode.create` (62 total) + links owner/mechanic (employee NO); idempotente.
- Tests: +17 (handler 7, lookup 4, controller matriz 6) → **29 suites / 264 tests**; build OK; smoke test de arranque OK (rutas mapeadas, sin errores).

## Cambios técnicos aplicados — Frontend (commit `feat(frontend)`)

- `src/lib/active-context.ts` + `src/hooks/use-active-context.ts`: store `null` = PERSONAL | `{ type: 'WORKSHOP', workshopId }` con `useSyncExternalStore`.
- `src/lib/api.ts`: inyector `beforeRequest` (headers workshop, excluye rutas `auth/*`); `careEpisodeApi.lookupVehicleByPlate()` + `careEpisodeApi.createCareEpisode()`; `workshopApi.getWorkshop()` (branches reales del backend).
- `auth-provider.tsx`: `clearSession()` resetea contexto; `authApi.logout()` también en `.finally` (incluye fallo de red).
- `components/layout/workshop-selector.tsx` + header del dashboard (dropdown por taller + link "Nueva atención" visible solo con WORKSHOP activo; sin membresías no renderiza — journey PERSONAL intacto).
- Página `/(dashboard)/atenciones/nueva`: lookup por placa → branch preseleccionada (GET /workshops/:id) → check-in (RHF+zod) → POST → éxito ("Atención ingresada OK — vehículo {placa}"); estados 404/429+Reintentar/5xx/403; sin taller seleccionado → guía. Ruta protegida en proxy.
- Tests: +24 → **13 files / 122 tests**; build OK (Next 16.3.4, TypeScript estricto).

### Spec (commit `docs: spec F-020`)

- `docs/specs/care-episode-create-flow.md` (nueva, v2): problema, objetivo, actores, P2-1..P2-6, journey, flujos alternativos, RF-1..RF-6, contrato backend validado por TL (correcciones 1-7 incorporadas), alcance dentro/fuera, criterios de aceptación (backend + frontend + calidad), dependencias, riesgos. Aprobada por TL antes de implementar.

## Deuda / decisiones pendientes detectadas en el cierre

1. **PDP — Selector no filtra por permiso `care-episode.create`:** el dropdown muestra todas las membresías; el backend enforcea con 403 controlado. Filtrar por permiso (¿global o por-taller?) es decisión de F-021/F-023.
2. **PDP — Branches en sesión:** la página usa `GET /api/workshops/:id` para las sucursales (no están en `/auth/me`). Si el producto quiere evitar esa llamada por sesión, agregar sucursales a `/auth/me` (decisión para iteración 2-2 / contexto taller completo).
3. **Transitoriedad ADR-005 T4:** `careEpisodeId` NULLABLE en ServiceRecord/WorkOrder/Estimate; la vinculación obligatoria llega con F-021/F-022 (ciclo de vida del episodio).
4. **`mileageIn` vs `VehicleMileage`:** ¿el kilometraje de ingreso del check-in debe registrar también un `VehicleMileage` con `source: workshop`? Afecta al timeline F-014 → decidir en iteración 2-2.
5. **¿Un vehículo puede tener más de un episodio `open` simultáneo?** (partial unique index si aplica) → F-021.
6. **`vehicle.transferred` event muerto** (deuda previa, F-014): se mantiene abierta; decidir con CareEpisodes/F-024 si la timeline consume eventos o sigue leyendo la tabla.
7. **Permisos fantasma de workshops (deuda pre-existente):** `workshop.roles.create/update/delete` y `workshop.specialties.manage` existen en controllers pero no en seed → 403 para no-super_admin. Fuera de F-020; registrar para una pasada de workshops.
8. **Build warnings multi-lockfile** (backend + frontend): cosmético; considerar `turbopack.root` o consolidar lockfiles al abordar el build.

# 23. Registro (2026-09-12): Iteración 2-2 — Servicios del propietario + verificación del taller (D-062..D-068)

## Objetivo

Amendar parcialmente D-024 A2 para habilitar el journey **"el propietario registra un servicio propio y el taller lo verifica"** (F-020+): el origen (`source`) del episodio se declara en la creación y **nunca cambia**; la confirmación del taller es una afirmación auditable superpuesta. Incluye búsqueda pública de talleres y cola de verificaciones del taller.

## Decisión de producto (usuario, 2026-09-12): del puntaje al modelo discreto

- El usuario propuso un "nivel de veracidad" numérico (4/10) para los servicios registrados por el propietario. El PM reformuló: **el origen no se puntúa, se declara** (`source='owner' | 'workshop'`); la verificación es una afirmación binaria (`unverified | verified`) que se superpone sin mutar el origen. **Puntaje 4/10 descartado explícitamente.**

## Decisiones de producto confirmadas (2026-09-12)

### D-062 — Amend parcial de D-024 A2: el owner crea servicios propios

- Nuevo `POST /api/care-episodes/owner` (contexto PERSONAL): el propietario vigente crea `care_episode` `source='owner'` SOLO sobre vehículos owned (`assertOwnership`, no acceso compartido). El resto de los writes del módulo maintenance sigue WORKSHOP-only (D-024 A2 ACCEPTED inalterado). Los episodios del propietario son *ingresos de servicio*, no atenciones de taller.

### D-063 — `source` derivado del contexto/path; origen inmutable

- El source es constante del path (`/owner` → `owner`, `/` → `workshop`). Cualquier `source` en el body es **stripped silenciosamente** por whitelist (decisión PM; el TL propuso rechazo duro → descartado para no acoplar el contrato al enum). Un episodio jamás cambia de origen.

### D-064 — Confianza discreta, no puntaje

- `CareEpisodeVerification { unverified | verified }` (minúsculas). UI source-aware: episodio owner sin verificar → "Registrado por el propietario"; verificado → "Verificado por {taller}". Sin puntajes numéricos.

### D-065 — Estado de nacimiento según origen

- Owner: `status='delivered'` (serviceDate retroactivo por naturaleza; sin check-in). Workshop: `status='open'` (F-020 intacto).

### D-066 — Taller responsable: XOR `workshopId` | `workshopName`

- `workshopId` proviene de la búsqueda pública acotada `GET /api/workshops/search?q=` (sin membresía; PII mínima `{id, name, logoUrl?, city}`; sin taxId/email/branches); `workshopName` es texto libre ≤150. Ambos o ninguno → 400.

### D-067 — Permiso `care-episode.verify` para owner + mechanic

- Employee NO. Convención `module/resource: 'care-episode', action: 'verify'`. Seed idempotente.

### D-068 — `mileageIn` del propietario: informativo

- No genera `VehicleMileage` (a diferencia del flujo taller). El timeline F-014 sigue sin kilometrajes de taller — deuda de la iteración.

## Decisiones validadas por el Tech Lead (2026-09-12) — ajustes #1–#9 de la spec

1. **Dos rutas separadas** (no dualidad en un POST): `/` (F-020, guards intactos) + `/owner` (sin PermissionsGuard; `assertOwnership`; Throttler 30/60s).
2. **Enums minúsculas** + mapping UI source-aware (contrato, no decisión de frontend).
3. **Migración aditiva** `20260911201057_add_care_episode_owner_source`: FKs debilitadas a NULLABLE exigen relaciones opcionales + back-relations (`User.careEpisodesCreated`, `WorkshopMember.verifiedCareEpisodes`); enums con defaults constantes (source='workshop', verification='unverified') — sin backfill manual.
4. **Search anti-colisión:** controller nuevo registrado ANTES de `WorkshopsController` (foot-gun `@Get(':id')`, patrón F-012); `escapeLike()`; `q` min 2 chars; sin match → `200 []`; limit 10; Throttle 30/60s.
5. **Strip silencioso por whitelist** (decisión PM; ver D-063).
6. **Verify atómico** con `updateMany` condicional: 404 otro taller (no revelar existencia), 200 idempotente mismo taller, 409 ya verificado por otro, 403 `source='workshop'`.
7. **Cola con `limit` default 50 / max 100**, orden `serviceDate` asc.
8. **`serviceDate` ≤ fin de día UTC** (sin `user.timezone`).
9. **Ruta frontend propietario** `(dashboard)/vehicles/[id]/servicios/nueva` gated `isVehicleOwner && PERSONAL`; página taller "Verificaciones" gated WORKSHOP. **Sin CHECKs SQL** (enforcement en handlers + tests de matriz).

## Cambios técnicos aplicados — Backend (commit `feat(care-episodes): owner service records + verification`)

- `schema.prisma` + migración aditiva `20260911201057_add_care_episode_owner_source`: enums `CareEpisodeSource`/`CareEpisodeVerification`; campos `source`, `verification`, `title`, `serviceDate`, `workshopName`, `createdByUserId` (FK User), `verifiedByMemberId` (FK WorkshopMember, relación `VerifiedCareEpisodes`), `verifiedAt`; `workshopId`/`branchId`/`createdByMemberId`/`checkedInAt` → NULLABLE; back-relations; índices `(workshopId, source, verification)` y `(createdByUserId)`. BD aplicada (12 migraciones), sin `db:reset`.
- `src/modules/care-episodes/`: `POST /api/care-episodes/owner` (contexto PERSONAL obligatorio → 403; ownership; XOR taller; `serviceDate` ≤ fin de día UTC; persiste `source='owner'`+`delivered`+`unverified`+`createdByUserId`; emite `care-episode.created` con payload extendido), `GET /api/care-episodes/verifications` (cola owner+unverified del taller; limit 50/100; PII mínima sin email/teléfono), `POST /api/care-episodes/:id/verify` (updateMany atómico; 404/200/409/403; evento nuevo `care-episode.verified`).
- `src/modules/workshops/`: `GET /api/workshops/search?q=` en controller nuevo registrado ANTES de `WorkshopsController`; `contains`+insensitive con `escapeLike`; solo activos; `{id, name, logoUrl, city}`.
- `seed.ts`: permiso `care-episode.verify` (63 total) + links owner/mechanic (employee NO); re-ejecutado idempotente.
- Tests: +6 suites / +42 → **35 suites / 306 tests**; build OK. POST `/` de F-020 intacto (solo la firma del evento `care-episode.created` se extendió, sin listeners afectados).

## Cambios técnicos aplicados — Frontend (commit `feat(frontend): owner services + verifications`)

- Página `(dashboard)/vehicles/[id]/servicios/nueva`: form RHF+Zod (título, fecha máx hoy, km, notas), taller XOR (`workshopId` vía búsqueda con debounce 400ms | `workshopName` texto libre), estados 400/403/404/429+Reintentar/5xx/red, éxito con mensaje de confianza (D-064) + "Registrar otro".
- Botón "Registrar servicio" en `/vehicles/[id]` visible solo `isVehicleOwner && PERSONAL` (UX; enforcement real en backend).
- Página `(dashboard)/atenciones/verificaciones` (link en header gated WORKSHOP): cola `GET /care-episodes/verifications`, confirmar vía `window.confirm` → `POST /:id/verify`, badge "Verificado por {taller}", errores por item (403/404/409), empty/loading/error+Reintentar, sin taller → guía.
- Tipos `CareEpisodeSource`/`CareEpisodeVerification`/`CreateOwnerCareEpisodeInput`/`CareEpisodeVerificationItem`/`WorkshopSearchResult`; API `careEpisodeApi.createOwnerCareEpisode/getCareEpisodeVerifications/verifyCareEpisode` + `workshopApi.searchWorkshops`.
- Sin dependencias nuevas; inyector de contexto y `/atenciones/nueva` intactos. Tests: +31 → **16 files / 153 tests**; build OK.

### Spec (commit `docs: spec owner service records verification flow`)

- `docs/specs/owner-service-records-verification-flow.md` (nueva, v2 aprobada por TL con ajustes #1–#9 incorporados): problema, objetivo, actores, D-062..D-068, journey owner + taller, flujos alternativos (404/200 idempotente/409/403), RF-1..RF-8, contrato backend validado, alcance dentro/fuera, criterios de aceptación (backend + frontend + calidad, 14), dependencias, riesgos.

## Deuda / decisiones pendientes detectadas en el cierre

1. **Contrato del 200 de `POST /api/care-episodes/:id/verify`:** el frontend tipa la respuesta como `CareEpisode` (`ky.json()`); fijar en la spec el body exacto del 200 (si el backend responde 200 sin body, `ky.json()` fallaría). Verificación E2E pendiente.
2. **`q` URL-encoded en search (workshops):** comportamiento correcto (ky encodea el search param); solo nota de test, sin break.
3. **PDP-1 / PDP-2 heredadas de F-020** siguen abiertas (selector sin filtro por permiso `care-episode.create`; branches no están en `/auth/me`).
4. **T4 heredada:** `careEpisodeId` NULLABLE en ServiceRecord/WorkOrder/Estimate (vinculación obligatoria con F-021/F-022).
5. **`vehicle.transferred` event muerto + `mileageIn` de taller → `VehicleMileage`:** abiertas (D-068 difiere solo para el owner).
6. **Permisos fantasma de workshops** (deuda pre-existente): se mantiene para la pasada de workshops.

---

# 24. Registro (2026-09-15): CareEpisodes en el Timeline del Vehículo (D-069..D-076)

## Objetivo

Cerrar la deuda F-014 §1: mostrar los **CareEpisodes** del vehículo (tanto `source=owner` como `source=workshop`) dentro de la sección "Historial" del detalle (`/vehicles/[id]`), integrados al merge cronológico existente (D-052), con su estado de verificación visible. Trabajo end-to-end backend + frontend, sin migración de base de datos (los datos ya existen desde F-020 / 2-2).

Decisión de producto confirmada por el usuario 2026-09-15; especificación: `docs/specs/care-episode-timeline-flow.md` (validada por Tech Lead, ajustes §4.1–§4.4 incorporados).

## Decisiones de producto

### D-069 — Incluir CareEpisodes en el timeline del vehículo (ambos sources)

- La "historia clínica" del vehículo incluye los episodios del propietario (`source=owner`) y los de talleres (`source=workshop`).
- Fuente: `GET /api/vehicles/:id/history` se amplía con un 4º array `careEpisodes` (Opción A aprobada por TL; endpoint paralelo descartado). El endpoint de maintenance (`GET /maintenance/vehicles/:id/history`) NO se toca (F-021+, otra capa).

### D-070 — Timestamp canónico del episodio para ordenar (merge)

- `serviceDate` cuando existe; workshop sin `serviceDate` (nace `open` en check-in) → `checkedInAt ?? createdAt`.
- El resto del merge no cambia (D-052): transfers `createdAt`, mileages `recordedAt`, ownerships `startsAt`.
- Implementación validada: sort en JS post-query con clave `serviceDate ?? checkedInAt ?? createdAt` desc + tiebreak `createdAt` desc (el `orderBy` compuesto de Prisma NO equivale al coalesce — rechazado por TL).

### D-071 — Título y actor del episodio en el timeline (fallbacks definidos)

- Contrato: `title: string | null` (no se normaliza en el handler).
- Fallback de UI: `title` presente → se usa; `title` null + workshop → "Atención de taller"; `title` null + owner → "Servicio registrado".
- Owner: actor "Registrado por el propietario"; badge **solo si `verification === "verified"`** → "Verificado por {nombre del taller}".
- Fuente del taller: **`workshop?.name ?? workshopName`** (relación viva con fallback al snapshot de texto libre). El gate del badge es `verification === "verified"` — nunca por presencia de `workshop`.
- Workshop: actor "Taller {workshop?.name ?? workshopName}"; sin badge de verificación (origen confiable, D-064).
- Se muestran todos los estados (`open/delivered/cancelled`), consistente con D-054. Episodio `cancelled` → título con sufijo "(cancelada)".
- Copy de la Card Historial: "Atenciones, transferencias, kilometraje y cambios de propiedad."

### D-072 — PII y acceso compartido

- El historial ya controla emails (Security Review #13). Los episodios solo exhiben: título, fechas, km, estado, taller (nombre), notas del cliente — sin exposición nueva.
- Acceso compartido ve los episodios (consistente con D-046). Sin cambios de guard en `assertVehicleAccess`.

### D-073 — Sin paginación ni filtros en MVP

- Igual que el resto del timeline (D-053): volumen esperado bajo; los episodios se traen completos (orden desc por timestamp canónico).

### D-074 — Modal de confirmación al crear servicio (owner)

- Al confirmar el registro de un servicio desde el form del propietario, se muestra un modal antes de enviar.
- Texto: **"No podrás editar ni cancelar este registro desde tu cuenta. Solo el taller asignado podrá gestionarlo. ¿Confirmás el registro?"**
- Cancelar → el form vuelve editable (no envía). Confirmar → se envía `POST /api/care-episodes/owner`.
- Sin cambios backend (el propietario ya no puede editar: no existe endpoint de edición). Modal = pura UX de transparencia, integrado en 2-3 por costo bajo.

### D-075 — Edición y cancelación de episodios: solo el taller asignado — *regla capturada, fuera de 2-3*

- Regla de producto confirmada (2026-09-15): editar/cancelar un care-episode es operación exclusiva del taller asignado (`workshopId`), desde contexto workshop (WorkshopGuard). El propietario nunca edita ni cancela sus propios registros.
- No se implementa en 2-3. Iteración candidate 2-5: requiere `PATCH /api/care-episodes/:id` o `POST /:id/cancel`, decisiones sobre campos editables (nunca source/verification/workshopId), invalidación de verificación al editar, auditoría, seed de permisos y Security review.

### D-076 — Vehículos anteriores (ex-propietarios): corte por propiedad — *Opción B, fuera de 2-3*

- Regla confirmada (2026-09-15, Opción B): un ex-propietario puede acceder a la ficha e historial de un vehículo que ya no posee, pero **solo ve los eventos hasta el final de su ownership** (no ve atenciones futuras del nuevo dueño).
- No se implementa en 2-3. Iteración candidate 2-4: cambio en `assertVehicleAccess`/`VehicleAccessService`, regla de filtrado (fechas ≤ `endsAt` del último ownership), vista "Vehículos anteriores", acciones bloqueadas, Security review.

## Decisiones técnicas validadas por el Tech Lead (2026-09-15)

1. **Opción A — ampliar `GET /api/vehicles/:id/history`** (mismo guard `assertVehicleAccess`, D-046 + super_admin); endpoint paralelo descartado. Arrays existentes byte-compatibles.
2. **`select` explícito en `careEpisode.findMany`** (defensa en profundidad, patrón Security Review #13): `id, title, serviceDate, status, source, verification, mileageIn, customerNotes, checkedInAt, createdAt, workshopName, workshop { id, name }`. Excluidos: `internalNotes` (PII taller, NUNCA en payload), `customerComplaint`, `closedAt`, `updatedAt`, `createdByUserId`, `createdByMemberId`, `verifiedByMemberId`, `verifiedAt`, `branchId`, `appointmentId`, `vehicleId`.
3. **Sin `orderBy` en Prisma** — orden en JS post-query por clave D-070 desc + tiebreak `createdAt` desc; `orderBy` compuesto rechazado por TL (no equivale al coalesce cuando `serviceDate` es null y `checkedInAt` está seteado).
4. **Sin mapper**: el `select` de Prisma elimina los campos sensibles en la frontera de la query; los specs existentes hacen property-checks, no `toEqual` del objeto completo.
5. **Frontend:** tipos nuevos (`VehicleCareEpisode` ligero — NO reutilizar el modelo del crear, `title` es `string | null`); `TimelineEntryType` gana `"care"`; inserción de cares después de ownerships en `mergeHistory` (empates por orden estable desc); factory `makeHistory()` del test unitario devuelve `careEpisodes: []` por defecto (si no, rompen los 153 tests frontend en compile).

## Cambios técnicos aplicados

### Backend

- `get-vehicle-history.handler.ts`: 4º `careEpisode.findMany` en el `Promise.all` (select explícito, sin filtro por status), `sortCareEpisodes()` privado (clave `serviceDate ?? checkedInAt ?? createdAt` desc + tiebreak `createdAt` desc).
- `get-vehicle-history.handler.spec.ts`: `prismaMock.careEpisode` agregado + stubs `[]` en los tests existentes + tests nuevos (sort con nulls mixtos, tiebreak, select sin keys sensibles, shape `workshop`, episodio `cancelled` incluido).

### Frontend

- `types/vehicle.ts`: `VehicleCareEpisode` nuevo + `careEpisodes` en `VehicleHistoryResponse`.
- `lib/vehicle-history.ts`: `mergeHistory()` integra cares (timestamp D-070, inserción tras ownerships), `TimelineEntryType` gana `"care"`, `mileageSourceLabel`/format helpers extendidos.
- Página `/vehicles/[id]`: render de episodios en la Card Historial (fallbacks D-071, badge "Verificado por...", actor taller/propietario, sufijo "(cancelada)", notas), íconos lucide reemplazan emojis.
- `servicios/nueva`: modal de confirmación D-074 (Dialog) antes de enviar.
- Componentes nuevos reutilizables: `components/ui/empty-state.tsx`, `components/ui/badge.tsx`, `components/ui/dialog.tsx`, `components/vehicle/vehicle-card.tsx`, `components/vehicle/vehicle-header.tsx`.
- Layout dashboard: nav móvil (hamburguesa), items por contexto.

## Deuda / decisiones pendientes detectadas en el cierre

1. **Editar/cancelar episodios** (D-075) → iteración candidate 2-5.
2. **Ex-propietarios corte por propiedad** (D-076) → iteración candidate 2-4 (cambia `assertVehicleAccess`, listado, UI; Security review).
3. **Timeline muestra TODOS los episodios del vehículo que el caller puede ver** (D-069 no filtra por ownership del caller); el filtrado por propiedad es exclusivo de 2-4.
4. **`careEpisodes` del history: sin paginación** (D-073); si escala, TL propone paginar el timeline completo, no un endpoint paralelo.

---

# 25. Registro (2026-09-15): Panel de Transferencias, Alias y QR (D-077..D-091)

## Objetivo

Definir las decisiones de producto para la funcionalidad de **transferencia de propiedad de vehículo** de extremo a extremo, incluyendo el panel de transferencias (Fase 1), el alias de usuario tipo billetera virtual (Fase 2) y la transferencia por QR presencial/concesionaria (Fase 3). Se trabaja en coordinación con UX/UI, Frontend Tech Lead y Backend Tech Lead.

## Contexto

- El backend de transferencias ya está implementado: `POST /vehicles/:id/transfer`, `GET /vehicles/transfers/incoming`, `GET /vehicles/transfers/outgoing`, `PATCH /vehicles/transfers/:id/accept|reject|cancel`.
- Modelos existentes: `VehicleTransfer`, `VehicleOwnership` (con `startsAt`/`endsAt`), `VehicleTransferEvent`.
- El frontend tiene los tipos y el timeline, pero falta la integración con las APIs de transferencia.
- Se elige el flujo **Panel dedicado** (Flujo 2) por sobre el Modal directo (Flujo 1) para el MVP.

---

### D-077 — Alias de usuario editable (tipo billetera virtual)

**Estado:** `ACCEPTED`
**Tipo:** Product / Domain / Data
**Prioridad:** P1

#### Decisión

El usuario posee un **alias público editable** (`@usuario`, formato `^[a-z0-9._-]{3,30}$`), único case-insensitive, que se utiliza como identificador humano en transferencias en lugar del email (PII). El alias es **inmutable mientras exista una transferencia pendiente** que lo use como identificador.

#### Razón
- El email es PII que no debe exponerse en contratos de transferencia.
- El alias es estable frente a cambios de email y da control sobre la identidad pública.
- Consistente con D-003 (User = cuenta + actor en MVP).

#### Impacto
- Backend: columna `User.alias` (unique, guardado en lowercase) + `lastAliasChangedAt`.
- Frontend: campo en perfil, validación en vivo, display en transferencias y timeline.

#### Alternativas descartadas
- Derivado del email (expone PII, se rompe al cambiar email).
- Autogenerado `@firstName-randomNumber` (impersonal, difícil de recordar).

---

### D-078 — Respuestas simétricas de transferencia (fromUser + toUser)

**Estado:** `ACCEPTED`
**Tipo:** Backend Contract / Frontend
**Prioridad:** P1

#### Decisión

Todos los endpoints de transferencia (`incoming`, `outgoing` y mutaciones) retornan **ambos** `fromUser` y `toUser` con `{ id, firstName, lastName, alias }`. **Nunca** el email de la contraparte (solo la sesión ve su propio email).

#### Razón
- El contrato actual es asimétrico (incoming solo `fromUser`, outgoing solo `toUser`), obligando al frontend a inferir el actor local desde la sesión — conocimiento procedural frágil.
- Un contrato simétrico es determinista y permite un único renderer.

#### Impacto
- Backend: ampliar includes en `get-incoming-transfers`, `get-outgoing-transfers` y mutaciones.
- Frontend: eliminar la inferencia de sesión; menos casos especiales.

#### Alternativas descartadas
- Mantener asimetría (conocimiento implícito frágil).
- Simetría solo en queries (mutaciones inconsistentes).

---

### D-079 — Conflicto QR pendiente: rechazar con error (1 QR activo por vehículo)

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

#### Decisión

Si al generar un QR ya existe uno pendiente para el vehículo, el sistema **rechaza con error 409 CONFLICT** y mensaje claro (ya existe un QR pendiente, su vencimiento y CTA de revocación explícita). El invariante es **un solo QR pendiente activo por vehículo**.

#### Razón
- Un QR es un bearer con capacidad transaccional real. Auto-revocar puede inutilizar silenciosamente un QR legítimo ya entregado (ej. QR de concesionaria impreso), destruyendo una transacción en curso: erosiona la confianza.
- La revocación es una acción explícita del owner, no un efecto secundario silencioso.

#### Impacto
- Backend: 409 CONFLICT con detalle.
- Frontend: estado de error en el panel con acción "Revocar QR existente".

#### Alternativas descartadas
- Auto-revocar el anterior (riesgo de romper transacciones legítimas).
- Warning y elegir (complejidad para caso raro).

#### Nota de implementación
- Revocar un QR pendiente debe cancelar el intento de transferencia asociado, registrando `VehicleTransferEvent` tipo `cancelled` (trazabilidad D-014).

---

### D-080 — Deep link HTTPS canónico para QR

**Estado:** `ACCEPTED`
**Tipo:** Product / Architecture / Backend Contract
**Prioridad:** P1

#### Decisión

El QR codifica la URL canónica:

```text
${FRONTEND_URL}/transfer/qr/{token}
```

El token es el identificador canónico (path param). La ruta requiere autenticación (JwtAuthGuard).

#### Razón
- HTTPS universal funciona con todos los scanners y en desktop; custom schemes fallan en muchos.
- Ruta auto-descriptiva; el segmento `/qr` permite distinguir el origen (copia contextual).

#### Impacto
- Backend: `FRONTEND_URL` (precedente D-028) como base del deep link.
- Frontend: ruta `(auth)/transfer/qr/[token]` con pantalla de preview/confirmación.

#### Alternativas descartadas
- `/t/{token}` (ahorro de densidad irrelevante, ruta opaca).
- Custom scheme `hcdv://` (incompatible con scanners y desktop).

#### Nota de implementación
- Mantener el token fuera del query string cuando sea posible; si se usa query param, aplicar `history.replaceState` (precedente D-028).

---

### D-081 — QR aceptado → `completed` directo

**Estado:** `ACCEPTED`
**Tipo:** Product / Domain
**Prioridad:** P1

#### Decisión

La aceptación de un QR confirma la transferencia en **un solo paso**: `VehicleTransfer` se crea con `status='completed'` al momento de aceptar, dentro de una transacción atómica que registra los eventos `requested → ownership_closed → ownership_created → completed`.

#### Razón
- El escaneo + confirmación de identidad (D-082) **es** el acto de aceptación; QR implica consentimiento explícito.
- El flujo ya es totalmente trazable vía `VehicleTransferEvent`; un estado `pending` intermedio no agrega granularidad.

#### Impacto
- Backend: el command de aceptación QR replica la transacción de `accept-transfer`.
- Frontend: una única pantalla de confirmación.

#### Alternativas descartadas
- `pending` → auto-complete (estado intermedio sin valor de trazabilidad adicional).

#### Nota de implementación
- El valor `accepted` del enum `TransferStatus` permanece sin uso por diseño (mismo comportamiento que el aceptar actual). Documentarlo para evitar "correcciones" futuras.

---

### D-082 — Cualquier usuario autenticado escanea + confirmación de identidad

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

#### Decisión

Cualquier usuario autenticado puede escanear/resolver un QR. Tras el escaneo, el receptor debe **confirmar explícitamente su identidad** antes de aceptar. El QR jamás nombra al destinatario.

#### Razón
- El QR existe precisamente para el escenario donde el emisor **no conoce la cuenta del receptor** (comprador walk-in en concesionaria, venta presencial).
- Un escaneo sin confirmación convertiría la posesión del QR en consentimiento — inaceptable ante un QR filtrado.

#### Impacto
- Backend: resolución del token exige autenticación; la aceptación opera contra el usuario de sesión.
- Frontend: flujo escanear → preview del vehículo y emisor → confirmación → aceptar.
- Seguridad: mitigaciones = TTL corto (D-086) + confirmación explícita + aceptación de un solo uso.

#### Alternativas descartadas
- QR nominativo (invalida el escenario walk-in; redundante con el email).
- Escaneo sin confirmación (posesión = consentimiento; inaceptable).

---

### D-083 — Preview reutilizable; solo la aceptación consume

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

#### Decisión

El token QR tiene estados `pending → consumed | revoked | expired`. El **preview (GET) es idempotente y reutilizable**; solo el accept (mutation) consume el token en la misma transacción.

#### Razón
- El journey real (D-082) requiere al menos dos interacciones: escanear → preview y confirmar → aceptar. El comprador puede revisar y decidir minutos después (o re-escanear).
- Precedente `VehicleShare` (maxViews/currentViews) ya establece tokens de sharing view-reusable.

#### Impacto
- Backend: preview idempotente; accept one-shot.
- Frontend: manejar caso "QR ya consumido" con estado claro.

#### Alternativas descartadas
- Consumir en primer escaneo (rompe el journey de preview + confirmación).

#### Nota de implementación
- Riesgo de QR filtrado acotado por TTL + confirmación + consumo al aceptar. Proteger el preview con throttling (anti-enumeración).

---

### D-084 — "Transferir" en detalle del vehículo Y en el panel

**Estado:** `ACCEPTED`
**Tipo:** Product / UX
**Prioridad:** P1

#### Decisión

La acción "Transferir" existe en **ambos** lugares: la página de detalle del vehículo y el panel de transferencias, compartiendo el **mismo diálogo/formulario**.

#### Razón
- Vehicle First (D-012): la acción debe existir donde vive el vehículo.
- El panel necesita un CTA de inicio para su estado vacío.

#### Impacto
- Frontend: `TransferDialog` compartido usado desde `/vehicles/[id]` y desde el panel.
- Backend: sin cambios — `POST /vehicles/:id/transfer` ya existe.

#### Alternativas descartadas
- Solo detalle del vehículo (el panel vacío queda muerto).
- Solo panel (rompe el journey principal del vehículo).

---

### D-085 — Diferencia concesionaria: solo TTL + metadata

**Estado:** `ACCEPTED`
**Tipo:** Product
**Prioridad:** P1

#### Decisión

La transferencia vía concesionaria **no es un rol ni un flujo de UI distinto**. La única diferencia es el **TTL de expiración** del QR (D-086) y la **metadata de origen** (`source: 'presencial' | 'concesionaria'`) persistida en el evento/token para trazabilidad.

#### Razón
- El journey del receptor (escanear → confirmar → aceptar) es idéntico sin importar quién imprimió el QR.
- Modelar concesionaria como rol/usuario arrastra sobrealcance severo de MVP (roles, onboarding, permisos).

#### Impacto
- Backend: comando de generación recibe `source` que determina el TTL y se persiste como metadata.
- Frontend: el lado emisor cambia solo el contexto de presentación; el lado receptor no cambia.

#### Alternativas descartadas
- Expiración + UI distinta (duplicación sin valor).
- Rol de concesionaria (sobrealcance; se evalúa cuando el producto soporte dealers como actores).

---

### D-086 — TTLs QR: presencial 1h / concesionaria 48h

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

#### Decisión

| Origen | TTL |
| ------ | --- |
| Presencial | **1 hora** |
| Concesionaria | **48 horas** |

El vencimiento se enforce server-side sobre el token (`expiresAt`), nunca solo en cliente.

#### Razón
- Presencial: 15min es insuficiente para preview → decisión → confirmación; 24h deja el QR vivo toda la noche.
- Concesionaria: 24h no cubre "el comprador vuelve al día siguiente"; 72h deja el QR stale durante 3 días.
- Ambos TTLs son más cortos que los 7 días del flujo por email → reduce exposición del modelo bearer.

#### Impacto
- Backend: constantes `QR_TTL_PRESENCIAL = 3600s`, `QR_TTL_CONCESIONARIA = 172800s`.
- Frontend: countdown visible en el panel; estado expirado con acción de regenerar.

#### Alternativas descartadas
- Presencial 15min (rompe journey) y 24h (ventana de leak nocturna).
- Concesionaria 24h (ajustado) y 72h (QR stale).

#### Nota de implementación
- El TTL es propiedad del token QR, no del intento de transferencia. La expiración dispara la lógica de D-088.

---

### D-087 — Notificaciones: email solamente (MVP)

**Estado:** `ACCEPTED`
**Tipo:** Product
**Prioridad:** P1

#### Decisión

Las notificaciones de transferencia utilizan **email solamente** para el MVP (reutilizando los listeners existentes: `TransferRequestEmailListener`, `TransferAcceptedEmailListener`). El panel de transferencias es la superficie in-app pasiva.

#### Razón
- El email ya está implementado; notificaciones in-app requieren un subsistema nuevo (tabla, estado no-leído, campana, UI); push requiere infraestructura mobile.
- La no-aceptación no daña el historial (expira y queda `expired` trazable).

#### Impacto
- Backend: reutilizar listeners de email existentes para el flujo QR.
- Frontend: sin cambios de notificación; el panel incoming ya muestra las solicitudes.

#### Alternativas descartadas
- In-app (subsistema completo sin usuario validado que lo exija).
- Push (requiere app/PWA; fuera de alcance).

#### Nota de implementación
- Registrar como roadmap: "notification center" post-MVP gatillado por actividad del vehículo.

---

### D-088 — Expiración de transferencia: auto-cancelar + notificar solo al emisor

**Estado:** `ACCEPTED`
**Tipo:** Product / Security
**Prioridad:** P1

#### Decisión

Toda transferencia/QR pendiente más allá de `expiresAt` eventualmente queda `expired`: se registra el evento `expired` en `VehicleTransferEvent` (trazabilidad) y se notifica **solo al emisor** con email template "Tu transferencia expiró" + CTA regenerar.

#### Razón
- El emisor es el único actor que **puede actuar** (regenerar QR o reenviar el pedido); el receptor no comprometido no necesita ruido.
- Silencio arriesga un QR de concesionaria muerto sin detección — problema comercial real.

#### Impacto
- Backend: detección de expiración (mecanismo a criterio del Tech Lead: job periódico vs lazy-on-read), evento `expired`, email al emisor.
- Frontend: el panel renderiza el estado `expired` con copy de acción "Reintentar".

#### Alternativas descartadas
- Silencioso (transacciones comerciales muertas sin detección).
- Notificar a ambos (ruido para el receptor no comprometido).

#### Nota de implementación
- La marca `expired` lazy que hoy hace `AcceptTransferHandler` debe coexistir con la detección proactiva. El mecanismo (job vs lazy) es decisión del Tech Lead; el requisito de producto es el definido aquí.

---

### D-089 — Tabs con `@base-ui/react` (patrón existente)

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Frontend
**Prioridad:** P1

#### Decisión

El componente Tabs del panel de transferencias se construye envolviendo el primitive **`@base-ui/react/tabs`** (ya instalado, v1.8.0) en `components/ui/tabs.tsx` con estilos shadcn. **Cero dependencias nuevas.**

#### Razón
- El patrón establecido del codebase es envolver primitives de Base UI en `components/ui/*` con estilos shadcn (button, input, dialog).
- Instalar Tabs de shadcn/ui arrastraría Radix como segunda capa de primitives — inconsistente.

#### Impacto
- Frontend: `components/ui/tabs.tsx` (nuevo).

#### Alternativas descartadas
- shadcn Tabs + Radix (segunda biblioteca de primitives).
- Custom (duplica trabajo accesible).

#### Nota de implementación
- Verificar la API exacta de Tabs en la versión instalada (Context7/paquete local) antes de codificar.

---

### D-090 — Librerías QR: `qrcode.react` (generación) + `html5-qrcode` (escaneo)

**Estado:** `ACCEPTED`
**Tipo:** Architecture / Frontend
**Prioridad:** P1

#### Decisión

| Función | Librería |
| ------- | -------- |
| Generación QR | `qrcode.react` (componente React, SVG/Canvas) |
| Escaneo QR | `html5-qrcode` (cámara + upload) |

Ambas en el frontend. El payload del QR = la URL de D-080.

#### Razón
- `qrcode.react` encaja directamente con Next.js; `html5-qrcode` ofrece escaneo listo para usar.
- Alternativa A (`qrcode` + `jsqr`) obliga a cablear canvas y cámara manualmente (más código, más bugs).

#### Impacto
- Frontend: 2 dependencias nuevas; manejo de permiso de cámara (requiere HTTPS en producción).
- Backend: sin cambios (el QR es solo un payload de URL).

#### Alternativas descartadas
- `qrcode` + `jsqr` (wiring manual, costo alto).
- `qr-code-styling` + cámara custom (estética ornamental, anti-MVP).

#### Nota de implementación
- Agregar fallback de "ingresar token manualmente" en la UI de escaneo (cámara denegada, desktop, testing).

---

### D-091 — Cooldown de alias: 15 días

**Estado:** `ACCEPTED`
**Tipo:** Product
**Prioridad:** P1

#### Decisión

El alias solo puede cambiarse **cada 15 días**. El **alta inicial** (registro) es gratuita; el cooldown aplica a cambios posteriores.

#### Razón
- 15 días cubre con holgura la ventana del flujo por email (7 días) y las de QR (1h/48h).
- 7 días es demasiado corto para disuadir churn/impersonation; 30 días es opresivo para corregir un typo.

#### Impacto
- Backend: enforcement de cooldown — 409 CONFLICT con código estable y mensaje con los días restantes.
- Frontend: copy en perfil ("Podés cambiar tu alias cada 15 días"), contador de días restantes.

#### Alternativas descartadas
- 30 días (demasiado restrictivo para correcciones legítimas).
- 7 días (insuficiente como disuasión).

#### Nota de implementación
- Override de soporte: post-MVP.

---

## Resumen de las decisiones de transferencia

| ID | Decisión |
|----|----------|
| D-077 | Alias editable por usuario (billetera virtual) |
| D-078 | Respuestas simétricas (fromUser + toUser) |
| D-079 | Rechazar QR duplicado (1 QR activo por vehículo) |
| D-080 | Deep link HTTPS `FRONTEND_URL/transfer/qr/{token}` |
| D-081 | QR aceptado → `completed` directo (transacción atómica) |
| D-082 | Cualquier usuario autenticado escanea + confirma identidad |
| D-083 | Preview reutilizable; solo la aceptación consume |
| D-084 | "Transferir" en detalle del vehículo Y en el panel |
| D-085 | Diferencia concesionaria = solo TTL + metadata source |
| D-086 | TTLs: Presencial 1h / Concesionaria 48h |
| D-087 | Notificaciones: email solamente (MVP) |
| D-088 | Expiración: auto-cancel + notificar solo al emisor (+ evento `expired`) |
| D-089 | Tabs con `@base-ui/react` (cero dependencias nuevas) |
| D-090 | `qrcode.react` + `html5-qrcode` |
| D-091 | Cooldown de alias = 15 días |

## Pendientes de implementación (por fase)

### Fase 1 — Panel de Transferencias (backend listo; frontend a implementar)
- D-078: ampliar includes en handlers de transferencias.
- D-084: `TransferDialog` compartido (detalle + panel).
- D-089: `components/ui/tabs.tsx` con `@base-ui/react`.

### Fase 2 — Alias
- D-077: migración `User.alias` + `lastAliasChangedAt`; endpoints `GET/PATCH /users/me/alias`; extender search por alias.
- D-091: enforcement de cooldown 15 días (409).
- D-078: incluir `alias` en respuestas de transferencias.

### Fase 3 — QR
- D-079: rechazo 409 si QR pendiente; revocación explícita del owner.
- D-080: deep link con `FRONTEND_URL`.
- D-081: aceptación directa `completed` en transacción atómica.
- D-082: preview autenticado + confirmación de identidad.
- D-083: preview idempotente; accept one-shot.
- D-085: `source: 'presencial' | 'concesionaria'` (metadata).
- D-086: TTLs 1h/48h server-side.
- D-088: detección de expiración + evento `expired` + email al emisor.
- D-090: `qrcode.react` + `html5-qrcode` en frontend.

## Decisiones delegadas al Tech Lead (no resueltas por producto)

1. **Mecanismo de detección de expiración** (D-088): job periódico vs lazy-on-read. El producto define el requisito; la implementación es decisión del Tech Lead sin introducir infraestructura innecesaria (AGENTS.md §6).
2. **Contrato exacto de respuesta de mutaciones** (D-078): shape del DTO de transferencia.