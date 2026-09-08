# Unified Baseline

**Propósito:** Determinar el estado real desde el cual debe continuar el desarrollo, cruzando intención de producto, arquitectura documentada y código implementado.

**Estado:** Baseline aprobado para iniciar la etapa de decisiones y convergencia.

**Criterio de verdad:**

- Las decisiones de producto explícitamente confirmadas prevalecen sobre la implementación observable.
- La arquitectura documentada representa la intención técnica, pero una propuesta arquitectónica todavía pendiente no debe tratarse como una decisión cerrada.
- El código y el schema representan el estado actual de implementación, no necesariamente el estado objetivo.
- Ninguna capa debe modificar silenciosamente la intención de otra.
- Cuando exista una contradicción, debe hacerse explícita y resolverse mediante una decisión registrada.

---

# 1. Matriz de Alineación Producto ↔ Arquitectura ↔ Código

## 1.1 Elementos alineados

| Decisión de Producto                                       | Arquitectura                                                  | Código/Schema                                                                                           | Estado        |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| Vehicle First: vehículo como entidad central               | ADR-005 define CareEpisode como raíz de la historia vehicular | `Vehicle` existe con identidad UUID, ownership histórico, photos, documents y mileage                   | **Sólido**    |
| Ownership histórico                                        | ADR-001 establece separación entre usuario y contexto         | `VehicleOwnership` utiliza `startsAt`/`endsAt`; `VehicleTransfer` implementa flujo de transferencia     | **Funcional** |
| Workshop como contribuyente, no propietario de la historia | ADR-005 establece que los talleres aportan información        | `Workshop`, `WorkshopMember`, `WorkshopRole`, `WorkshopBranch` implementados                            | **Sólido**    |
| Roles y permisos contextuales                              | ADR-001 define permisos asociados al contexto                 | Permissions, SystemRole, WorkshopRole y WorkshopMember implementados                                    | **Funcional** |
| Active Context obligatorio                                 | ADR-001/002 establecen el concepto de contexto activo         | Existe resolución parcial e implícita mediante guards; no existe todavía un resolver/contexto explícito | **Parcial**   |
| EventEmitter2 para eventos de negocio                      | AGENTS.md / ARCHITECTURE.md                                   | `EventEmitterModule.forRoot()` activo y eventos emitidos generalmente después de persistencia           | **Sólido**    |
| CQRS ligero sin framework                                  | AGENTS.md lo establece explícitamente                         | Controllers → Commands/Queries → handlers `execute()`, repositories mediante tokens                     | **Sólido**    |
| Multiple workshop membership                               | ADR-001 permite pertenencia a múltiples talleres              | `WorkshopMember` con unique constraint `[workshopId, userId]`                                           | **Sólido**    |
| Catálogo vehicular                                         | ADR-007 / producto                                            | `VehicleBrand`, `VehicleModel`, `VehicleVersion` y seed implementados                                   | **Funcional** |
| Plataforma administrativa                                  | ADR-004 / producto                                            | `Administration`, `VehicleCatalog`, `Dashboard` y permisos `admin.*` implementados                      | **Funcional** |

---

# 1.2 Brechas críticas

| Decisión de Producto                               | Estado de Código                                                                                                    | Impacto                                                                | Severidad                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| **CareEpisode como unidad central de historia**    | No existe en schema ni código. Maintenance gira alrededor de `Appointment` → `WorkOrder` → `ServiceRecord`          | El concepto central del producto no está modelado                      | **Bloqueante para convergencia del dominio** |
| **Active Context como fundamento de autorización** | No existe `CurrentContext` ni `ContextResolver`; los guards derivan contexto parcialmente desde `request.params.id` | Autorización inconsistente y potencialmente incorrecta                 | **Crítico**                                  |
| **Identity separada conceptualmente de User**      | No existe entidad `Identity`; `User` actualmente cumple funciones de cuenta y actor                                 | Existe una brecha entre el modelo conceptual y el modelo implementado  | **Alto**                                     |
| **Identificación progresiva del Vehicle**          | `licensePlate` es actualmente `UNIQUE NOT NULL`; VIN es nullable                                                    | Contradicción con la decisión de permitir identidad externa incompleta | **Alto**                                     |
| **Preservación de la historia vehicular**          | Existen cascadas que pueden eliminar registros relacionados con Vehicle, Ownership y Maintenance                    | Riesgo de pérdida de historia que el producto considera permanente     | **Crítico**                                  |

> **Nota:** La preservación histórica es una decisión de producto confirmada. La estrategia técnica concreta para lograrla —soft delete, archive, restricciones de DELETE, tombstones u otra— continúa pendiente.

---

# 1.3 Brechas parciales

| Decisión de Producto              | Estado de Código                                                                                 | Impacto                                                                    | Severidad |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------- |
| Diagnóstico dentro de CareEpisode | No existe modelo `Diagnosis`; WorkOrder posee notas pero no representa diagnóstico como concepto | El concepto diagnóstico todavía no está modelado                           | **Medio** |
| Evidencias por episodio           | Existen fotos/documentos vinculados a Vehicle, pero no a una intervención concreta               | No existe trazabilidad de evidencia por atención                           | **Medio** |
| Garantías por episodio            | No existe `Warranty`                                                                             | Sin trazabilidad de garantías                                              | **Medio** |
| Recomendaciones por episodio      | No existen                                                                                       | Sin seguimiento post-atención                                              | **Bajo**  |
| Trust Profile                     | No existe como concepto explícito en código                                                      | La confianza actualmente se expresa principalmente mediante roles/permisos | **Medio** |
| Timeline                          | No existe servicio/proyección específica de Timeline; existe historial basado en ServiceRecords  | La representación actual no corresponde todavía al modelo CareEpisode      | **Medio** |

---

# 2. Estado Real de los Módulos

## 2.1 Módulos funcionalmente operativos

| Módulo             | Funcionalidad                                                                                    | Autorización                     | Calidad       |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------- | ------------- |
| **Auth**           | Registro, login, refresh, logout, verificación email, reset contraseña, impersonación y sesiones | JWT + cookies                    | **Buena**     |
| **Users**          | CRUD de usuarios, settings y eventos                                                             | JWT                              | **Aceptable** |
| **Workshops**      | CRUD, branches, roles, memberships, invitations, hours y specialties                             | WorkshopGuard + PermissionsGuard | **Buena**     |
| **Administration** | Usuarios, talleres, roles/permisos, catálogo e impersonación                                     | PermissionsGuard / `admin.*`     | **Buena**     |
| **VehicleCatalog** | Brands, models y versions                                                                        | JWT / permisos administrativos   | **Buena**     |

## 2.2 Módulos funcionales pero con brechas de autorización

| Módulo          | Funcionalidad                                                     | Autorización                                     | Calidad                                              |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Vehicles**    | CRUD, ownership, transfers, mileage, access, photos y documents   | JWT + checks parciales en handlers               | **Aceptable pero insuficiente**                      |
| **Maintenance** | Appointments, work orders, estimates, service records e historial | JWT; recibe workshopId/vehicleId desde DTO/query | **Funcional pero requiere revisión de autorización** |
| **Dashboard**   | Estadísticas por rol/contexto                                     | JWT; autorización contextual insuficiente        | **Mínimo**                                           |

## 2.3 Conceptos requeridos por producto todavía no implementados

| Concepto                              | Estado                            |
| ------------------------------------- | --------------------------------- |
| **CareEpisode / Atención**            | No existe                         |
| **Diagnosis**                         | No existe                         |
| **Warranty**                          | No existe                         |
| **Evidence vinculada a episodio**     | No existe                         |
| **Recommendations**                   | No existe                         |
| **Timeline como proyección**          | No existe                         |
| **Active Context / Context Resolver** | No existe explícitamente          |
| **Identity como entidad separada**    | No existe                         |
| **Scheduling como módulo separado**   | No existe                         |
| **Billing**                           | No existe                         |
| **Notifications como módulo**         | No existe; existen emails básicos |

---

# 3. Gap Analysis por Dominio

## 3.1 Dominio Vehicle

```text
Producto exige                     Código contiene
─────────────────                 ────────────────
UUID canónico interno             ✓ UUID como PK
Patente opcional al alta          ✗ licensePlate UNIQUE NOT NULL
VIN opcional                      ✓ vin nullable
Ownership Identity → Vehicle      ~ User → VehicleOwnership
Ownership histórico               ✓ startsAt / endsAt
Transferencia                     ~ Flujo básico implementado
Preservación histórica            ✗ Existen CASCADE peligrosos
Acceso compartido                 ✓ VehicleAccess / VehicleShare
Photos                             ✓ VehiclePhoto
Documents                         ✓ VehicleDocument
Mileage                           ✓ Mileage
```

La decisión de preservar la historia está confirmada.

La estrategia técnica para impedir su pérdida deliberada o accidental queda pendiente.

---

# 3.2 Dominio Maintenance / CareEpisode

```text
Producto exige                     Código contiene
─────────────────                 ────────────────
CareEpisode como raíz              ✗ No existe
Ingreso / check-in                 ✗ No existe como concepto explícito
Diagnóstico                        ✗ No existe
Evidencias por episodio            ~ VehiclePhoto / VehicleDocument
Presupuestos múltiples             ✓ Estimate
Órdenes múltiples                  ✓ WorkOrder
Servicios ejecutados               ✓ ServiceRecord
Garantías                          ✗ No existe
Recomendaciones                    ✗ No existe
Appointment como pre-episodio      ✓ Appointment
Turno → Check-in → Episodio        ~ Check-in no modelado explícitamente
Timeline                           ✗ No existe como proyección de CareEpisode
```

El modelo actual de Maintenance debe considerarse **implementación existente potencialmente reutilizable**, no automáticamente modelo definitivo ni automáticamente descartable.

Antes de refactorizarlo debe decidirse qué conceptos sobreviven y cuál será su relación con `CareEpisode`.

---

# 3.3 Dominio Authorization / Active Context

```text
Producto exige                     Código contiene
─────────────────                 ────────────────
Active Context obligatorio         ~ Concepto documentado, resolución parcial
CurrentContext por request         ✗ No existe
ContextResolver                    ✗ No existe
Permisos por contexto activo       ~ Inferidos parcialmente
WorkshopGuard por membership       ✓ Existe
Ownership/resource checks           ~ Parciales
VehicleAccess                       ✓ Existe
Workshop permissions               ✓ Existe
Super admin bypass                 ✓ Existe
Permission cache                   ✓ Existe
```

El concepto de Active Context está confirmado.

**El mecanismo concreto para resolverlo y transportarlo todavía es una decisión arquitectónica.**

Los ADRs proponen un mecanismo basado en contexto explícito, pero no debe considerarse cerrado hasta registrar la decisión correspondiente.

---

# 3.4 Dominio Identity / Trust

```text
Producto exige                     Código contiene
─────────────────                 ────────────────
Identity como actor real           ✗ No existe
User como cuenta de acceso         ~ User cumple ambos roles
Trust Profile                      ✗ No existe
Verificación de Workshop           ✗ No existe
Clasificación de contribuyentes    ✗ No existe
Autoría preservada                 ✗ No existe en CareEpisode
```

La distinción conceptual `Identity ≠ User` está confirmada por producto.

La forma concreta de implementarla en MVP continúa siendo una decisión arquitectónica.

---

# 4. Clasificación de las Brechas

Las diferencias encontradas deben clasificarse antes de modificarse:

- **ALIGNED** — producto, arquitectura y código son coherentes.
- **PARTIAL** — existe una implementación parcial.
- **LEGACY / TRANSITIONAL** — implementación válida históricamente que deberá converger hacia otro modelo.
- **OUTDATED DOC** — documentación que ya no representa la arquitectura actual.
- **TECHNICAL DEBT** — implementación válida pero que requiere mejora.
- **BUG / BLOCKER** — defecto que impide continuar o genera comportamiento incorrecto.
- **SECURITY RISK** — brecha que puede comprometer autorización, datos o integridad.
- **PRODUCT DECISION REQUIRED** — no debe resolverse unilateralmente mediante código.
- **ARCHITECTURE DECISION REQUIRED** — requiere decisión técnica explícita.
- **UNKNOWN** — falta evidencia suficiente.

Esta clasificación debe utilizarse para evitar tratar toda diferencia como "bug".

---

# 5. Decisiones Arquitectónicas que Actualmente Requieren Resolución

## T1 — Identity ↔ User

El producto confirma conceptualmente:

```text
Identity ≠ User
```

Pero la implementación concreta sigue abierta:

- entidad `Identity` separada;
- extensión progresiva de `User`;
- otra estrategia de transición.

**Estado:** ARCHITECTURE DECISION REQUIRED.

No implementar ninguna de las alternativas hasta registrar la decisión.

---

## T2 — Active Context

El concepto de Active Context está confirmado.

Los ADRs proponen contexto explícito, incluyendo mecanismos como `X-Context-*`, `CurrentContext` y un resolver.

Sin embargo, el mecanismo técnico definitivo todavía debe decidirse.

**Estado:** ARCHITECTURE DECISION REQUIRED.

---

## T3 — Preservación y eliminación de historia

La preservación de la historia vehicular es una decisión de producto.

La estrategia técnica continúa abierta:

- soft delete;
- archive;
- restricción de eliminación;
- tombstones;
- combinación de estrategias;
- otra alternativa.

**Estado:** ARCHITECTURE / DATA POLICY DECISION REQUIRED.

---

## T4 — ServiceRecord ↔ CareEpisode

Debe decidirse si:

- `ServiceRecord` sobrevive como concepto;
- representa servicios ejecutados dentro de un `CareEpisode`;
- se absorbe conceptualmente;
- o se convierte en una proyección histórica.

**Estado:** PRODUCT + ARCHITECTURE DECISION REQUIRED.

---

## T5 — CQRS ligero

El patrón actual:

```text
Controller
   ↓
Command / Query
   ↓
Handler.execute()
   ↓
Repository / Prisma
```

está funcionando y es coherente con las restricciones del proyecto.

No existe actualmente una razón suficiente para introducir `@nestjs/cqrs`.

**Estado:** DECISIÓN PRÁCTICAMENTE CERRADA.

Se mantiene el patrón actual salvo nueva evidencia.

---

# 6. Riesgos Principales

| Riesgo                                                                | Probabilidad | Impacto | Clasificación          |
| --------------------------------------------------------------------- | ------------ | ------- | ---------------------- |
| Construir nuevas funcionalidades sobre modelos que serán reemplazados | Alta         | Crítico | Architecture / Product |
| Autorización inconsistente                                            | Alta         | Crítico | Security               |
| Pérdida accidental de historia mediante CASCADE                       | Media        | Crítico | Data Integrity         |
| Active Context ambiguo                                                | Alta         | Alto    | Architecture           |
| Ausencia de tests                                                     | Alta         | Alto    | Technical Debt         |
| Build roto                                                            | Confirmado   | Medio   | Bug / Blocker          |
| Divergencia entre documentación y código                              | Alta         | Medio   | Technical Debt         |
| MVP deriva hacia un ERP de talleres                                   | Media        | Alto    | Product                |

---

# 7. Estado de Partida

## 7.1 Capacidades que debemos preservar

1. Infraestructura NestJS.
2. Prisma + PostgreSQL.
3. Auth y sesiones.
4. Workshop management.
5. Vehicle registration.
6. Vehicle ownership/transfers/access.
7. Administration.
8. Vehicle Catalog.
9. Storage y Mail.
10. EventEmitter2.
11. Repository pattern.
12. CQRS ligero basado en handlers.

---

## 7.2 Capacidades que requieren convergencia

1. CareEpisode.
2. Active Context.
3. Identity.
4. Vehicle identification progresiva.
5. Ownership ↔ Access.
6. Historia vehicular y retención.
7. Maintenance.
8. Timeline.
9. Autoría y confianza.
10. Autorización contextual.

---

# 8. Bloqueadores Antes de una Convergencia Significativa

### Inmediatos

1. Corregir el build roto en `prisma-auth.repository.ts`.
2. Incorporar `ValidationPipe` global.
3. Establecer una infraestructura mínima de tests.
4. Revisar las cascadas destructivas.

### Requieren decisión de Producto

1. Política de creación de CareEpisode.
2. Política de autores y contribuyentes.
3. Política de Vehicle identification.
4. Política de Ownership / Access.
5. Política de visibilidad de historia.
6. Política de corrección y cierre de episodios.
7. Destino conceptual de Appointment / Estimate / WorkOrder / ServiceRecord.

### Requieren decisión de Arquitectura

1. Implementación concreta de Identity.
2. Mecanismo definitivo de Active Context.
3. Estrategia de preservación/eliminación histórica.
4. Estrategia de convergencia de Maintenance hacia CareEpisode.

---

# 9. Roadmap de Convergencia

## FASE 0 — Estabilización

```text
├─ Corregir build
├─ ValidationPipe global
├─ Tests mínimos
└─ Revisar cascadas destructivas
```

Esta fase puede comenzar inmediatamente porque no depende de decisiones de dominio.

---

## FASE 1 — Decisiones de Producto

```text
├─ Política de CareEpisode MVP
├─ Vehicle identification
├─ Ownership / Access
├─ Visibilidad de historia
├─ Corrección / cierre / autoría
└─ Destino conceptual de Maintenance
```

---

## FASE 2 — Decisiones y Foundation Arquitectónica

```text
├─ Identity ↔ User
├─ Active Context
├─ Vehicle schema
├─ Historical retention strategy
└─ Migration/convergence strategy
```

No asumir que las alternativas propuestas en ADRs son automáticamente las decisiones finales.

---

## FASE 3 — Core Domain

```text
├─ CareEpisode
├─ Intake / Check-in
├─ Diagnosis
├─ Evidence
├─ Estimate
├─ WorkOrder
├─ Service execution
├─ Warranty / Recommendations según MVP
└─ Timeline
```

---

## FASE 4 — Authorization

```text
├─ Context resolution
├─ Resource authorization
├─ Vehicle access
├─ Workshop authorization
├─ Ownership authorization
└─ Endpoint audit
```

La autorización debe acompañar el desarrollo del core y no tratarse únicamente como una etapa posterior cuando el nuevo dominio ya esté expuesto.

---

## FASE 5 — Trust & Quality

```text
├─ Trust Profile mínimo
├─ Contributor classification
├─ Correction/audit mechanisms
└─ Integration tests críticos
```

---

# 10. Principio de Convergencia

> **No construir funcionalidad nueva sobre modelos que sabemos que contradicen el modelo objetivo.**

> **No convertir propuestas arquitectónicas en decisiones sin registrarlas explícitamente.**

> **No resolver mediante código una decisión que pertenece al producto.**

> **No refactorizar infraestructura por anticipación.**

> **Preservar lo que funciona mientras se reemplaza progresivamente lo que no representa el modelo objetivo.**

---

# 11. Estado Actual Resumido

El proyecto se encuentra en un estado de:

**Infraestructura:** sólida.

**Auth:** funcional.

**Workshop management:** funcional.

**Vehicle management:** funcional pero con brechas de autorización y algunas contradicciones de modelo.

**Administration:** funcional.

**Persistence:** funcional pero con riesgos de integridad histórica.

**Events:** establecidos.

**Testing:** insuficiente.

**Build:** bloqueado por un error conocido.

**Authorization:** parcialmente implementada y necesita convergencia contextual.

**Core product domain:** significativamente incompleto.

**CareEpisode:** no implementado.

**Active Context:** conceptualmente definido, técnicamente incompleto.

**Identity:** conceptualmente definido, técnicamente inexistente.

**Timeline:** no implementado.

---

# 12. Regla Operativa para los Agentes

Antes de implementar cualquier feature significativa, el agente debe determinar:

1. ¿Esta funcionalidad está respaldada por una decisión de producto?
2. ¿Existe una decisión arquitectónica que la condicione?
3. ¿El código actual representa el modelo objetivo o es legacy/transicional?
4. ¿La implementación requiere una decisión todavía pendiente?
5. ¿Puede implementarse incrementalmente sin consolidar el modelo legacy?
6. ¿Afecta autorización, identidad, ownership, historia o datos sensibles?
7. ¿Debe escalarse al Tech Lead, PM, Database o Security?

Si existe una decisión pendiente que cambie significativamente el modelo, **el agente debe detener la implementación y escalar la decisión**.

---

# 13. Próximo Estado Deseado

El siguiente objetivo no es "terminar el proyecto".

Es llegar a un estado donde exista:

```text
PRODUCT BASELINE
       +
UNIFIED BASELINE
       +
DECISION REGISTER
       +
ARCHITECTURE
       ↓
CONVERGENCE PLAN
       ↓
FIRST VERTICAL SLICE
```

El primer vertical slice deberá construirse únicamente después de cerrar las decisiones que condicionan su modelo.

---

# Unified Baseline — HCDV

**Fecha:** 2026-09-02  
**Autores:** Tech Lead + PM (colaborativo)  
**Propósito:** Determinar el estado real desde el cual debe continuarse el desarrollo, cruzando intención de producto, arquitectura documentada y código implementado.

**Criterio de verdad:** Las decisiones confirmadas de producto prevalecen sobre la implementación observable. El código evidencia dónde estamos, no dónde debemos estar.

---

## 1. Matriz de Alineación Producto ↔ Arquitectura ↔ Código

### 1.1 Elementos ALINEADOS

| Decisión de Producto                         | Arquitectura                                           | Código/Schema                                                                        | Estado        |
| -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------- |
| Vehicle First: vehículo como entidad central | ADR-005 define CareEpisode como raíz                   | `Vehicle` existe con identidad UUID, ownership histórico, photos, documents, mileage | **Sólido**    |
| Ownership histórico                          | ADR-001 establece separación User/contexto             | `VehicleOwnership` con `startsAt`/`endsAt`, `VehicleTransfer` con eventos            | **Funcional** |
| Workshop como contribuyente, no propietario  | ADR-005: talleres aportan información                  | Workshop, WorkshopMember, WorkshopRole, WorkshopBranch implementados                 | **Sólido**    |
| Roles/permisos contextuales                  | ADR-001: permisos pertenecen al contexto               | Permissions, SystemRole, WorkshopRole, WorkshopMember con cache de permisos          | **Funcional** |
| Active Context obligatorio                   | ADR-001/002 definen `CurrentContext`                   | Guards resuelven contexto parcialmente desde `params.id`                             | **Parcial**   |
| EventEmitter2 para eventos de negocio        | AGENTS.md, ARCHITECTURE.md                             | `EventEmitterModule.forRoot()` activo, handlers emiten post-persistencia             | **Sólido**    |
| CQRS ligero sin framework                    | AGENTS.md explícito                                    | Controllers → Commands/Queries con `execute()`, repos con tokens `*_REPOSITORY`      | **Sólido**    |
| Multiple workshop membership                 | ADR-001: usuario puede pertenecer a infinitos talleres | `WorkshopMember` unique constraint `[workshopId, userId]`                            | **Sólido**    |
| Catálogo vehicular                           | ADR-007 implícito                                      | `VehicleBrand`, `VehicleModel`, `VehicleVersion` con seed                            | **Funcional** |
| Plataforma administrativa                    | ADR-004, PRODUCT                                       | Administration, VehicleCatalog, Dashboard modules con permisos `admin.*`             | **Funcional** |

### 1.2 Elementos en BRECHA CRÍTICA

| Decisión de Producto                      | Estado de Código                                                                                                                      | Impacto                                                                | Severidad      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------- |
| **CareEpisode como unidad de historia**   | **No existe** en schema ni código. Maintenance gira en torno a `Appointment`→`WorkOrder`→`ServiceRecord`                              | Todo el dominio core del producto no está modelado                     | **Bloqueante** |
| **Active Context como motor de permisos** | `PermissionsGuard` infiere workshop desde `request.params.id`. Sin `X-Context-*` headers, sin `CurrentContext`, sin `ContextResolver` | Autorización inconsistente e incorrecta en múltiples módulos           | **Crítico**    |
| **Identity separada de User**             | No existe tabla `Identity`. `User` representa tanto cuenta como persona                                                               | El producto requiere que la confianza pertenezca a Identity, no a User | **Alto**       |
| **Patente/VIN opcionales al alta**        | `licensePlate` es `@unique @db.VarChar(20)` y campos NOT NULL en el modelo observado                                                  | Contradice la decisión de identificación progresiva                    | **Alto**       |
| **Historia vehicular preservada**         | Migración 005 aplica `CASCADE` masivo sobre vehículos, ownership, transfers, maintenance                                              | Eliminar un vehículo borra su historia completa                        | **Crítico**    |

### 1.3 Elementos en BRECHA PARCIAL

| Decisión de Producto              | Estado de Código                                                                             | Impacto                                             | Severidad |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------- |
| Diagnóstico dentro de CareEpisode | No existe modelo `Diagnosis`. WorkOrder tiene notas internas pero sin estructura diagnóstica | Diagnóstico como concepto separado no existe        | **Medio** |
| Evidencias por episodio           | Fotos y documentos existen en `Vehicle`, no vinculados a intervención específica             | Evidencias se asocian al vehículo, no a la atención | **Medio** |
| Garantías por episodio            | No existe modelo `Warranty`                                                                  | Sin trazabilidad de garantías                       | **Medio** |
| Recomendaciones por episodio      | No existen                                                                                   | Sin seguimiento post-atención                       | **Bajo**  |
| Trust Profile                     | No existe como concepto en código                                                            | Confianza se reduce a roles del sistema             | **Medio** |
| Timeline como representación      | No existe endpoint de timeline, sólo `getVehicleHistory` que retorna service records         | Timeline no expresa CareEpisodes                    | **Medio** |

---

## 2. Estado Real de los Módulos

### Módulos funcionalmente operativos (con autorización contextual inconsistente)

| Módulo             | Funcionalidad                                                                                 | Autorización                                  | Calidad       |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------- |
| **Auth**           | Registro, login, refresh, logout, verificación email, reset contraseña, impersonación, sesión | JWT + cookies                                 | **Buena**     |
| **Users**          | CRUD usuarios, settings default, eventos                                                      | JWT only                                      | **Aceptable** |
| **Workshops**      | CRUD, branches, roles, membresías, invitaciones, horarios, especialidades                     | WorkshopGuard + PermissionsGuard              | **Buena**     |
| **Administration** | Usuarios, talleres, roles/permisos, catálogo, impersonación                                   | PermissionsGuard con permisos `admin.*`       | **Buena**     |
| **VehicleCatalog** | Brands, models, versions (admin + público)                                                    | JWT + PermissionsGuard (admin), JWT (público) | **Buena**     |

### Módulos funcionalmente operativos (con autorización mínima)

| Módulo          | Funcionalidad                                                    | Autorización                                          | Calidad                         |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| **Vehicles**    | CRUD, ownership, transfers, mileage, access, photos, documents   | JWT only en controller, ownership check en handlers   | **Aceptable pero insuficiente** |
| **Maintenance** | Appointments, work orders, estimates, service records, historial | JWT only, acepta workshopId/vehicleId desde DTO/query | **Funcional pero inseguro**     |
| **Dashboard**   | Stats por rol (super-admin, workshop, mechanic, owner)           | JWT only, sin verificación de rol/permiso             | **Mínimo**                      |

### Módulos sin implementación significativa

| Módulo requerido por producto                     | Estado actual                                   |
| ------------------------------------------------- | ----------------------------------------------- |
| **CareEpisode / Atención**                        | **No existe**                                   |
| **Diagnosis**                                     | **No existe**                                   |
| **Warranty**                                      | **No existe**                                   |
| **Evidence (vinculada a episodio)**               | **No existe** (fotos/docs vinculados a Vehicle) |
| **Recommendations**                               | **No existe**                                   |
| **Timeline**                                      | **No existe** como servicio                     |
| **Active Context / Context Resolver**             | **No existe** como módulo                       |
| **Identity (entidad separada)**                   | **No existe**                                   |
| **Scheduling** (mencionado en ARCHITECTURE.md)    | **No existe** como módulo separado              |
| **Billing** (mencionado en ARCHITECTURE.md)       | **No existe**                                   |
| **Notifications** (mencionado en ARCHITECTURE.md) | **No existe** (sólo emails básicos)             |

---

## 3. Gap Analysis por Dominio

### 3.1 Dominio Vehículo

```
Producto exige                     Código contiene
─────────────────                  ────────────────
UUID canónico interno              ✓ UUID como PK
Patente opcional al alta           ✗ licensePlate UNIQUE NOT NULL
VIN opcional al alta               ✓ vin nullable
Ownership como Identity→Vehicle    ~ User→VehicleOwnership (sin Identity)
Ownership histórico                ✓ startsAt/endsAt
Transferencia end-to-end           ~ Transfer flujo básico existe
Preservación histórica             ✗ CASCADE masivo en migración 005
Acceso compartido diferenciado     ✓ VehicleAccess + VehicleShare
Photos como evidencia de vehículo  ✓ VehiclePhoto
Documents como documentación       ✓ VehicleDocument
```

### 3.2 Dominio Maintenance / CareEpisode

```
Producto exige                     Código contiene
─────────────────                  ────────────────
CareEpisode como raíz              ✗ No existe
  └ Ingreso / check-in             ✗ No existe
  └ Diagnóstico                    ✗ No existe
  └ Evidencias                     ~ Asociadas a Vehicle, no a episodio
  └ Presupuestos (múltiples)       ✓ Estimate, pero sin CareEpisode padre
  └ Órdenes (múltiples)            ✓ WorkOrder, pero sin CareEpisode padre
  └ Servicios ejecutados           ✓ ServiceRecord, pero como tabla independiente
  └ Garantías                      ✗ No existe
  └ Recomendaciones                ✗ No existe
Appointment como pre-episodio      ✓ Appointment existe
Turno → Check-in → Episodio       ~ Appointment existe, check-in implícito
Timeline del vehículo              ✗ No existe servicio
```

### 3.3 Dominio Autorización

```
Producto exige                     Código contiene
─────────────────                  ────────────────
Active Context obligatorio         ✗ Sin X-Context-*, sin ContextResolver
CurrentContext por request         ✗ No existe
Permisos por contexto activo       ~ PermissionsGuard infiere desde params.id
WorkshopGuard por membresía        ✓ Existe, pero params.id = workshopId
Ownership check por recurso        ~ Parcial en handlers, no uniforme
Permisos de vehículo               ✓ VehicleAccess + permissions
Permisos de taller                 ✓ WorkshopRole + WorkshopRolePermission
Super admin bypass                 ✓ PermissionsGuard checka super_admin
Cache de permisos                  ✓ PermissionCache con TTL 5min
```

### 3.4 Dominio Identity / Confianza

```
Producto exige                     Código contiene
─────────────────                  ────────────────
Identity como actor real           ✗ No existe
Trust Profile                      ✗ No existe
Verificación de taller             ✗ No existe
Clasificación de contribuyentes    ✗ No existe
Autoría preservada en episodios    ✗ No hay episodios
```

---

## 4. Decisiones Arquitectónicas que el Código Viola

### DECISIÓN

**Problema:** El código implementa patrones que contradicen decisiones arquitectónicas y de producto confirmadas.

**Decisiones violadas:**

1. **ADR-002 Active Context.** No existe `CurrentContext`, `ContextResolver`, ni headers `X-Context-*`. Los guards derivan contexto de forma no consistente.

2. **ADR-005 CareEpisode.** La implementación de maintenance se centra en `Appointment`→`WorkOrder`→`ServiceRecord` sin el aggregate `CareEpisode` que el producto confirmó.

3. **Blueprint Vehicle First.** La restricción `licensePlate UNIQUE NOT NULL` contradice la decisión de identificación progresiva.

4. **Preservación histórica.** La migración 005 aplica `CASCADE` masivo sobre relaciones de ownership, transferencias y maintenance, lo cual destruye historia al eliminar registros padre.

**Decisión:** Las decisiones de producto confirmadas prevalecen. El código debe evolucionar hacia el modelo, no el modelo adaptarse al código.

**Razón:** El producto define la identidad del sistema; el código es una implementación iterativa que debe convergir.

**Alternativas:**

- A) Reescribir desde cero → Riesgo alto, pérdida de funcionalidad operativa.
- B) Evolución incremental → Preserva lo que funciona, introduce CareEpisode y Active Context progresivamente.
- C) Adaptar producto al código → Rechazado; viola la premisa fundamental.

**Decisión tomada:** **Opción B — evolución incremental**, con roadmap de convergencia definido.

**Trade-offs:** Más pasos, más tiempo, pero menor riesgo y preservación de funcionalidad existente.

**Impacto:** Requiere un roadmap de convergencia claro que priorice los módulos que bloquean el journey MVP.

---

## 5. Mapa de Riesgos

| Riesgo                                                                                           | Probabilidad   | Impacto     | Mitigación                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------- | ----------- | --------------------------------------------------------------------------------------- |
| Construir funcionalidades sobre modelos que serán reemplazados (ej: maintenance sin CareEpisode) | **Alta**       | **Crítico** | No agregar funcionalidad nueva a maintenance actual sin plan de migración a CareEpisode |
| Autorización inconsistente expone datos                                                          | **Alta**       | **Crítico** | Estabilizar autorización antes de abrir endpoints a más usuarios                        |
| Pérdida de historia vehicular por CASCADE                                                        | **Media**      | **Crítico** | Revisar política de eliminación; probablemente soft delete para entidades de historia   |
| Active Context no implementado genera confusión en permisos                                      | **Alta**       | **Alto**    | Implementar ContextResolver antes de agregar nuevos módulos contextuales                |
| Sin tests, cualquier cambio puede introducir regresiones silenciosas                             | **Alta**       | **Alto**    | Establecer suite mínima antes de grandes refactorings                                   |
| Build fallido bloquea CI/CD                                                                      | **Confirmado** | **Medio**   | Corregir `prisma-auth.repository.ts` inmediatamente                                     |

---

## 6. Definición del Estado de Partida

### Lo que ESTÁ listo para construir sobre

1. **Infraestructura NestJS:** módulos, inyección de dependencias, guards, decorators, events, storage, mail, logger — funcional.
2. **Persistencia Prisma:** schema extenso, migraciones controladas, repositorios con token injection — funcional.
3. **Auth completa:** JWT, cookies, refresh, registro, verificación, reset, impersonación — funcional.
4. **Workshop management:** talleres, sucursales, roles, membresías, invitaciones, horarios, especialidades — funcional.
5. **Vehicle registration:** alta con catálogo, ownership, transfers, acceso, photos, documents, mileage — funcional.
6. **Administration:** usuarios, talleres, roles/permisos, catálogo vehicular admin — funcional.
7. **Patrón arquitectónico:** CQRS ligero, repositories por módulo, events post-persistencia — establecido y consistente.

### Lo que DEBE resolverse antes de avanzar significativamente

| #   | Prioridad         | Problema                                                                                                | Esfuerzo estimado |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **Inmediato**     | Build roto (`prisma-auth.repository.ts` falta `refreshTokenHash`)                                       | Bajo              |
| 2   | **Inmediato**     | Sin `ValidationPipe` global — sin validación HTTP                                                       | Bajo              |
| 3   | **Corto plazo**   | Definición de **política de CareEpisode MVP** (autores, estados, cierre, corrección) — requiere PM      | N/A (producto)    |
| 4   | **Corto plazo**   | Definición de **política Vehicle–Ownership–Access** (alta, transferencia, visibilidad) — requiere PM    | N/A (producto)    |
| 5   | **Corto plazo**   | Decidir **identificación mínima del Vehicle** (¿patente opcional o requerida en MVP?) — requiere PM     | N/A (producto)    |
| 6   | **Corto plazo**   | Establecer **política de eliminación/archivado** vs. CASCADE actual                                     | Medio             |
| 7   | **Mediano plazo** | Implementar **Active Context** mínimo (`X-Context-*` headers, `ContextResolver`, `CurrentContext`)      | Alto              |
| 8   | **Mediano plazo** | Introducir **CareEpisode** como aggregate raíz de maintenance                                           | Alto              |
| 9   | **Mediano plazo** | Definir relación **Identity ↔ User** para MVP (¿Identity como tabla separada o como extensión de User?) | Medio             |
| 10  | **Continuo**      | Agregar autorización contextual uniforme a módulos Vehicles, Maintenance y Dashboard                    | Medio             |

---

## 7. DECISIONES PENDIENTES REQUERIDAS ANTES DEL PRIMER SPRINT DE CONVERGENCIA

### Del lado de Producto

| #   | Decisión                                                                                                                        | Urgencia  | Impacto arquitectónico                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| P1  | ¿Quién puede crear CareEpisodes en MVP? (¿solo talleres verificados? ¿propietarios también?)                                    | **Alta**  | Define modelo de permisos y autoría                           |
| P2  | ¿Qué journeys actuales (Appointment, WorkOrder, Estimate, ServiceRecord) sobreviven, se reemplazan o se vinculan a CareEpisode? | **Alta**  | Define si el módulo maintenance se refactura o se reconstruye |
| P3  | ¿Patente es obligatoria, opcional o requerida solo en ciertos journeys?                                                         | **Alta**  | Define schema de Vehicle                                      |
| P4  | ¿Qué es un "taller verificado" y quién lo verifica?                                                                             | **Media** | Define Trust Profile mínimo                                   |
| P5  | ¿Qué propietario puede ver vs. contribuir en la historia?                                                                       | **Media** | Define permisos de lectura/escritura por contexto             |
| P6  | ¿Qué permiso necesita un taller para atender un vehículo que no es suyo?                                                        | **Media** | Define modelo de consentimiento/acceso                        |

### Del lado de Arquitectura

| #   | Decisión                                                                                                                    | Urgencia  | Impacto                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------- |
| T1  | ¿Identity se implementa como tabla separada en MVP o User absorbe la función de Identity temporalmente?                     | **Alta**  | Define si hacemos migración de datos o refactor gradual |
| T2  | ¿Active Context se resuelve mediante headers (`X-Context-*`) como proponen los ADRs, o mediante contexto derivado del path? | **Alta**  | Define patrón de guards y contratos API                 |
| T3  | ¿Vehicle usa soft delete (preservando historia) o se define política de retención?                                          | **Alta**  | Define schema y migraciones                             |
| T4  | ¿ServiceRecord se mantiene como concepto independiente o se absorbe en CareEpisode?                                         | **Media** | Define módulo maintenance                               |
| T5  | ¿Se introduce `@nestjs/cqrs` o se mantiene el patrón actual de handlers con `execute()`?                                    | **Baja**  | El patrón actual funciona; preferir no cambiar          |

---

## 8. Roadmap de Convergencia

```
FASE 0 — Estabilización (inmediata)
├─ Corregir build
├─ ValidationPipe global
├─ Revisar DELETE cascades
└─ Suite mínima de tests críticos

FASE 1 — Decisiones de Producto (requiere PM)
├─ Política de CareEpisode MVP
├─ Política de Vehicle identification
├─ Política de Ownership y acceso
└─ Política de eliminación/archivado

FASE 2 — Foundation (arquitectura)
├─ Active Context mínimo (headers + resolver + guard)
├─ Identity como extensión o tabla separada
├─ Vehicle schema: licensePlate nullable, VIN nullable
└─ Soft delete para entidades de historia

FASE 3 — Core Domain
├─ CareEpisode como aggregate raíz
├─ Diagnosis, Evidence, Warranty, Recommendations
├─ Maintenance refactor sobre CareEpisode
└─ Timeline como servicio

FASE 4 — Authorization Uniforme
├─ WorkshopGuard/PermissionsGuard con contexto real
├─ Ownership check en Vehicle operations
├─ Consentimiento/acceso para talleres
└─ Auditoría de todos los endpoints

FASE 5 — Trust & Quality
├─ Trust Profile mínimo
├─ Clasificación de contribuyentes
├─ Auditoría de correcciones
└─ Tests de integración críticos
```

---

## 9. Regla de Oro

> **No construir funcionalidad nueva sobre modelos que serán reemplazados.**  
> **No refactorizar infraestructura sin decisiones de producto claras.**  
> **No avanzar a Fase 3 sin completar Fase 1 y Fase 2.**

El estado desde el que debemos continuar es:

- **Sólido en infraestructura** (NestJS, Prisma, Auth, Storage, Events).
- **Funcional en módulos operativos** (Workshops, Administration, Vehicle Catalog).
- **Gap significativo en dominio core** (CareEpisode, Active Context, Identity, Timeline).
- **Riesgo activo en autorización** (inconsistente, basada en inferencia de path params).
- **Bloqueado en build** (1 error de tipos en Prisma Auth Repository).

**El primer sprint debe combinar:** estabilización técnica (build + validación + tests) **y** decisiones de producto que desbloqueen las fases siguientes.

---

## 10. Referencia Cruzada

### 10.1 Fuentes del Producto

| Fuente                                              | Contenido relevante                                          |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `AGENTS.md`                                         | Convenciones de producto, dominio, roles, permisos, workflow |
| `docs/ADR/ADR-001--Modelo de Usuario.md`            | Modelo de usuario, contextos, permisos por contexto          |
| `docs/ADR/ADR-002--Active Context.md`               | Active Context, CurrentContext, cache, invalidación          |
| `docs/ADR/ADR-005--Vehicle Care Lifecycle.md`       | CareEpisode, timeline, ciclo de vida de atención             |
| `docs/ADR/ADR-007--Vehicle Digital Twin.md`         | Identidad del vehículo, catálogo                             |
| `docs/ROADMAP/0-vision del producto.md`             | Visión general del producto                                  |
| `docs/ROADMAP/03-modelo de Dominio.md`              | Modelo de dominio                                            |
| `docs/PM/001--pm.md` a `005--doc funcional-2-db.md` | Documentos funcionales del PM                                |
| `docs/features.md`                                  | Features del producto                                        |
| `README.md`                                         | Permisos y especialidades (parcialmente desactualizado)      |

### 10.2 Fuentes Técnicas

| Fuente                               | Contenido relevante                                            |
| ------------------------------------ | -------------------------------------------------------------- |
| `ARCHITECTURE.md`                    | Arquitectura documentada (parcialmente desactualizada)         |
| `src/app.module.ts`                  | Módulos activos (fuente de verdad del estado actual)           |
| `prisma/schema.prisma`               | Modelo de persistencia                                         |
| `prisma/migrations/`                 | Historial de migraciones                                       |
| `prisma/seed.ts`                     | Datos iniciales: permisos, roles, catálogo, usuarios, talleres |
| `src/config/envs.ts`                 | Variables de entorno requeridas                                |
| `src/common/guards/`                 | Guards de autorización implementados                           |
| `src/common/authorization.module.ts` | Módulo de autorización compartido                              |
| `src/main.ts`                        | Bootstrap y configuración HTTP                                 |
| `package.json`                       | Dependencias y scripts                                         |
