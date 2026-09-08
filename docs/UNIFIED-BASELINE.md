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
| Autorización inconsistente                                            | Media        | Crítico | Security               |
| Pérdida accidental de historia mediante CASCADE                       | Baja         | Crítico | Data Integrity         |
| Active Context ambiguo                                                | Baja         | Alto    | Architecture           |
| Ausencia de tests                                                     | Alta         | Alto    | Technical Debt         |
| Build roto                                                            | Resuelto     | Medio   | Bug / Blocker          |
| Divergencia entre documentación y código                              | Media        | Medio   | Technical Debt         |
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

1. ~~Corregir el build roto en `prisma-auth.repository.ts`.~~ ✅ RESUELTO
2. Incorporar `ValidationPipe` global.
3. Establecer una infraestructura mínima de tests.
4. ~~Revisar las cascadas destructivas.~~ ✅ Schema corregido (FKs históricas → RESTRICT); migración pendiente de ejecutar en DB.

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

**Build:** resuelto (Fase 1).

**Authorization:** parcialmente implementada y necesita convergencia contextual.

**Core product domain:** significativamente incompleto.

**CareEpisode:** no implementado.

**Active Context:** Fases A (ContextModule), B (controllers) y C (endurecimiento autorización) implementadas; Fase D (cache de contexto) pendiente.

**Identity:** conceptualmente definido; decisión T1 registrada (evolución progresiva, sin tabla).

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

# 14. Registro de Avance de Convergencia

Actualización: **2026-09-04**

## Fase 1 — Foundation (avance)

### Decisiones arquitectónicas formales T1-T5

Todas las decisiones del PM fueron evaluadas y formalizadas en ADRs:

| # | Decisión | Registro | Estado |
|---|----------|----------|--------|
| T1 | Identity = evolución progresiva, sin tabla ahora | `ADR-001` | ✅ Decidida |
| T2 | Active Context explícito con ContextResolver | `ADR-002` | ✅ Fase A implementada |
| T3 | DELETE por entidad (históricas → RESTRICT) | `ADR-005` | ✅ Schema; migración pendiente |
| T4 | ServiceRecord dentro de CareEpisode | `ADR-005` | ✅ Decidida (implementación futura) |
| T5 | No usar @nestjs/cqrs | `ADR-008` (nuevo) | ✅ Confirmada |

### Implementado

1. **Build corregido** — `prisma-auth.repository.ts`: `createSession` ahora guarda el hash correctamente; métodos de búsqueda usan `refreshTokenHash`.
2. **Schema simplificado** — `UserSession.refreshToken` (token crudo) eliminado; solo `refreshTokenHash`. Migración pendiente.
3. **ContextModule implementado (Fase A)** — `src/common/context/` con `CurrentContext`, `ContextResolver`, `ContextGuard`, `@ActiveContext()`. Guards migrados a `request.context` con fallback.
4. **FKs históricas → RESTRICT** — `vehicle_ownerships`, `vehicle_transfers`, `vehicle_mileages`, `work_orders`, `service_records`, `estimates` protegidas contra delete en cascada. Migración pendiente.
5. **ValidationPipe global incorporado** — `src/main.ts`: `whitelist: true`, `forbidNonWhitelisted: false`, `transform: true` + `enableImplicitConversion`. `forbidNonWhitelisted` se deja en false temporalmente por falta de test suite E2E (riesgo documentado de romper endpoints).
6. **Migraciones Prisma aplicadas** (DB disponible):
   - `remove_refresh_token_field_from_user_session` (renombra `refresh_token` → `refresh_token_hash`)
   - `protect_vehicle_history_fks` (16 FKs históricas → RESTRICT)
   - La migración existente `add_ondelete_strategies` quedó aplicada.
   - `prisma migrate status` → up to date; `prisma generate` + `npm run build` → OK.
7. **Fase B T2 (controllers → ActiveContext)**:
   - **maintenance:** `@UseGuards(JwtAuthGuard, ContextGuard)` + `@ActiveContext()` en create/list; validación IDOR (workshop mismatch → Forbidden); `@Permissions('appointment.create' | 'workorder.create' | 'estimate.create')` en creates.
   - **vehicles:** agregado `ContextGuard` + `@ActiveContext()` en create/findAll/transfer (aditivo, sin permisos nuevos).
   - **dashboard:** agregado `ContextGuard` + `@ActiveContext()` en workshop/mechanic dashboards.
   - Módulos importan `AuthorizationModule`.
8. **Fase C T2 (endurecer autorización)**:
   - **maintenance:** todos los endpoints ahora inyectan `@ActiveContext()` y validan pertenencia al workshop del contexto. Permisos aplicados: `appointment.update`, `appointment.cancel`, `workorder.close`, `estimate.approve`. `addWorkOrderItem` quedó con validación de pertenencia pero sin permiso (no existe permiso apto en seed → escalado).
   - **vehicles:** helper `assertVehicleAccess()` centralizado en el controller (ownership activo via `VehicleOwnership.endsAt === null`, O `VehicleAccess` no revocado, O super_admin). Aplicado a ~16 endpoints (findOne, update, remove, photos/documents read/write, grantAccess, history, transfer).
   - **delete-vehicle:** implementa soft-delete según ADR-005 — si el vehículo tiene historia (workOrders/serviceRecords/estimates) se marca `deletedAt`, si no se borra físicamente.
   - **Build + typecheck OK.**

### Migraciones aplicadas (DB disponible)

- ✅ `remove_refresh_token_field_from_user_session`
- ✅ `protect_vehicle_history_fks`
- ✅ `add_ondelete_strategies` (existente, quedó aplicada)

### Próximos pasos Fase 1

- [ ] **Fase D T2:** invalidación de cache de contexto por eventos.
- [ ] **Permiso `service_record.create`** (DECISIÓN DE PRODUCTO PENDIENTE).
- [ ] **Permiso `workorder.update` / `workorder.item.create`** para `addWorkOrderItem` (DECISIÓN DE PRODUCTO PENDIENTE).
- [ ] **Permisos `vehicle.*` por vehículo** — existen en seed pero NO se aplican porque `PermissionsGuard` no evalúa `VehicleAccessPermission`. Requiere extensión de guard (DECISIÓN DE ARQUITECTURA PENDIENTE).
- [ ] **Enforcement de escritura a nivel repository** (quitar TOCTOU) — scope `update` por `workshopId` en capa de repositorio (DECISIÓN DE ARQUITECTURA PENDIENTE).
- [ ] **Reads de maintenance** — `GET /appointments/:id`, `GET /work-orders/:id` están scoped a workshop pero sin permiso de lectura y accesibles desde contextos PERSONAL y WORKSHOP. Confirmar si `history.view` debe gatearlos (DECISIÓN DE PRODUCTO PENDIENTE).
- [ ] **Vehicles soft-deleted** — decidir si las queries de read/list deben excluir vehículos con `deletedAt` (DECISIÓN DE PRODUCTO PENDIENTE).
- [ ] **Infraestructura mínima de tests.**
- [ ] **Activar `forbidNonWhitelisted: true`** una vez existan tests E2E que validen contratos.
- [ ] **Definir contexto personal vs taller** para vehicles photos/documents (DECISIÓN DE ARQUITECTURA PENDIENTE).
