# HCDV — Decision Proposals

Documento de trabajo colaborativo elaborado por:

- Product Manager
- Backend Tech Lead
- Frontend Tech Lead

## Purpose

Este documento contiene el análisis, alternativas, argumentos,
riesgos y recomendaciones elaboradas por los agentes responsables
antes de que una decisión sea formalmente aceptada en
`DECISION-REGISTER.md`.

Este documento NO constituye la fuente oficial de decisiones.

La fuente oficial del estado de cada decisión es:

`DECISION-REGISTER.md`

> ⚠️ **SUPERSEDED / Documento histórico de trabajo (2026-09-04)**
>
> Este documento contiene las propuestas originales previas a la aprobación. El estado oficial y vigente es **`DECISION-REGISTER.md`**.
>
> Discrepancias conocidas con el registro vigente:
> - **D-017 fue invertida**: este documento recomendaba ignorar el header Bearer en producción; la decisión aceptada es **no deshabilitarlo**.
> - **D-002 suavizada**: este documento exigía exponer ownerships en `/auth/me`; el registro acepta `isVehicleOwner` como proyección booleana en el contrato de sesión.
> - **D-001/D-004** perdieron o reformularon implicaciones (403 centralizado, política SSR, `availableContexts` diferido a D-004/D-021).
> - Referencias cruzadas con IDs antiguos (D-006/D-008 como Ownership/Access) quedaron inválidas con la renumeración del register.
>
> No debe utilizarse como fuente de decisión.
>
> Documento de trabajo elaborado por el PM en coordinación con **Backend Tech Lead** y **Frontend Tech Lead**.
> Su propósito es presentar las propuestas para que el usuario (PM/equipo) las evalúe y apruebe.
> Ninguna decisión aquí es `ACCEPTED` todavía. Al aprobarse, se registra en `DECISION-REGISTER.md`.

---

# Resumen ejecutivo

| ID    | Tema                           | Tipo                                       | Recomendación conjunta                                                                                       | Bloqueante principal                                                |
| ----- | ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| D-001 | Modelo de autenticación        | ARCHITECTURE / SECURITY / BACKEND_CONTRACT | **A. HttpOnly Cookies** como modelo oficial para el web; Bearer solo para consumidores no-browser (M2M)      | Ninguno técnico; es formalizar + limpieza                           |
| D-002 | Definición de `isVehicleOwner` | DOMAIN / PRODUCT                           | Derivar de **Ownership**, exponiendo flag en `/auth/me`                                                      | Contrato de sesión (mínimo)                                         |
| D-003 | Separación Identity vs User    | DOMAIN / ARCHITECTURE                      | **Sin modelo Identity en MVP** (ratifica ADR-001 T1); separación conceptual en contrato de sesión            | Ninguno (ya decidido en ADR)                                        |
| D-004 | Active Context                 | PRODUCT / DOMAIN / ARCHITECTURE            | Completar como **eje de autorización**: headers `X-Context-*` + `availableContexts` + semántica por contexto | **Producto**: significado de `GET /vehicles` y recursos en WORKSHOP |
| D-005 | CareEpisode central            | PRODUCT / DOMAIN                           | **CareEpisode como entidad nueva** (ratifica ADR-005 T3/T4), no renombrar ServiceRecord                      | **Producto**: P1/P2 journeys del MVP                                |

**Hallazgo transversal (fix independiente e inmediato):**

- Frontend `src/hooks/use-vehicles.ts:2` importa `getAuthHeaders` de `@/lib/api` que **no existe** → el build falla hoy. Debe corregirse (quitar el import) al momento de aceptar D-001, no después.

---

# D-001 — Modelo de autenticación (Backend ↔ Frontend)

**Tipo:** `ARCHITECTURE` / `SECURITY` / `BACKEND_CONTRACT`
**Estado (propuesto):** `PROPOSED → ACCEPTED`

## Contexto real verificado

- **Backend** (`src/modules/auth/`): JWT strategy acepta **ambos** — `Authorization: Bearer` **o** cookie `access_token`. Token HS256 con solo `sub`. Refresh token **opaco** (32 bytes aleatorios, guardado hasheado SHA-256 en `user_sessions`) con rotación en cada refresh y reuse-detection (revoca todas las sesiones).
- **Cookies:** HttpOnly, Secure en prod, SameSite strict/lax. Nombres: `access_token`, `refresh_token`.
- **Impersonation:** el admin guarda su token original en `impersonation_sessions`; recibe token de 1h con `impersonated: true`; stop-impersonate restaura el token original desde DB. El mecanismo depende de **cookies** para funcionar limpio.
- **Frontend** (`web-follow-app`): NextAuth v5 JWT strategy que **no** almacena tokens del backend — solo identidad (id, role, roles, impersonation flags). `apiClient` usa `credentials: "include"`; `serverFetch` reenvía cookies desde `next/headers`; refresh con single-flight y retry en el cliente.
- **Discrepancia:** la documentación (`docs/frontend-auth-flow.md`, `auth-roles.md`) describe Bearer; el código implementa cookies. `FRONTEND_ALIGNMENT.md` ya lo marca HIGH.

## Comparación para ESTA arquitectura (flujo completo: NextAuth ↔ Browser ↔ NestJS ↔ refresh ↔ impersonation ↔ autorización)

| Criterio                              | A. Cookies HttpOnly                                                   | B. Bearer                                                                               | C. Híbrido            |
| ------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| XSS (robo de token)                   | ✅ Token nunca toca JS                                                | ❌ Token en memoria/NextAuth JWT → vulnerable                                           | ⚠️ Depende            |
| CSRF                                  | ⚠️ SameSite + validación de origen                                    | ✅ No aplica                                                                            | ⚠️ Igual que cookies  |
| **Impersonación**                     | ✅ Ya resuelto (cookie sobrescrita/restaurada, frontend no se entera) | ❌ Reemplazar header por cada cambio de identidad + refresh impersonado roto            | ❌ Doble complejidad  |
| **NextAuth v5**                       | ✅ NextAuth = solo sesión de UI                                       | ❌ Forzaría almacenar/refrescar access token en JWT de NextAuth (duplicación de sesión) | ❌                    |
| Refresh con rotación                  | ✅ Implementado y robusto                                             | ❌ Refresh token debe almacenarse manualmente                                           | ⚠️ Duplica maquinaria |
| SSR (`serverFetch`)                   | ✅ Reenvía cookies                                                    | ⚠️ Requiere extraer token de NextAuth + reinyectar                                      | ⚠️ Mixto              |
| **Consumidores futuros (mobile/M2M)** | ❌ Cookies poco estándar en mobile/server                             | ✅ Bearer natural para M2M                                                              | ✅ Bearer para M2M    |
| Documentación                         | ❌ Dice Bearer, implementa cookies                                    | ✅ Alinearía                                                                            | ⚠️ Más docs           |

**Punto crítico confirmado por ambos TL:** el mecanismo de **impersonación** existente depende de cookies. Con Bearer puro, impersonar en el browser exigiría reemplazar el access token en memoria + en el JWT de NextAuth en cada cambio → receta para bugs de sesión cruzada. Con cookies, el backend sobrescribe/restaura la cookie y el frontend no interviene.

## Decisión propuesta

> **Opción A — HttpOnly Cookies como modelo oficial para el tráfico browser/Next.js.**
> El backend **conserva el soporte Bearer** (ya implementado en `jwt.strategy.ts`) **exclusivamente** para consumidores no-browser (integraciones M2M, tests e2e, futuro mobile) — **nunca en el web**.

## Justificación

1. Es la implementación actual, verificada y funcional. No hay razón técnica para migrar a Bearer: ninguna ventaja de seguridad relevante para este producto y sí pérdida del mecanismo de impersonación probado.
2. NextAuth v5 ya no gestiona tokens del backend — tocar eso para meter Bearer es complejidad sin consumidor.
3. La inconsistencia es **de documentación, no de arquitectura**. Se resuelve documentando, no reescribiendo.
4. La ruta Bearer existente no se elimina; se declara **no-oficial para browser** (útil para tests e2e con Supertest y futuras integraciones).

## Consecuencias / implicaciones

**Backend** (cero cambios de mecanismo de auth):

- Limpiar dead config: `JWT_REFRESH_SECRET` y `JWT_REFRESH_EXPIRES_IN` existen en `envs.ts` pero no se usan. Consolidar TTL del refresh (hoy hardcodeado a 7 días en dos lugares) en una constante única `REFRESH_TOKEN_TTL_DAYS = 7`.
- Unificar las 4 variantes de opciones de cookie (`accessTokenCookieOptions`, `refreshTokenCookieOptions`, `impersonationTokenCookieOptions`, clear variants) en un helper.
- Documentar el contrato de auth (cookies, endpoints, errores 401/403, `POST /auth/refresh` como único punto de rotación).
- **Hardening pendiente:** `CORS_ORIGIN` default `*` con `credentials: true` es incompatible (browsers rechazan `*` + credentials) — fijar el origen real del frontend en prod. Re-habilitar Throttler (comentado en `app.module.ts`) en `/auth/login` y `/auth/refresh`.

**Frontend:**

- **BLOCKER:** quitar `getAuthHeaders` de `src/hooks/use-vehicles.ts:2`.
- Reescribir `docs/frontend-auth-flow.md` y `docs/auth-roles.md` al modelo de cookies (o marcarlos `SUPERSEDED`).
- Agregar manejo centralizado de **403** en `apiClient` (hoy no existe; solo 401).
- Decidir y documentar política de 401 en SSR (`serverFetch` — hoy no tiene refresh).
- (Opcional) eliminar dependencias huérfanas (`zustand`, `ky`, `jwt-decode`).

## Riesgos

- **CSRF:** mitigado por SameSite strict/lax, pero si el frontend se sirve desde origen distinto en prod, validar `origin` en mutaciones sensibles.
- **CORS mal configurado:** `CORS_ORIGIN` default `*` + credentials rompe en prod.
- **Throttler deshabilitado:** riesgo de fuerza bruta / refresh bombing en `/auth/login` y `/auth/refresh`.
- **Bearer "por compatibilidad":** si un atacante logra XSS, la ruta Bearer es otro vector. Decidir si en producción el strategy ignora el header Bearer (solo cookies).

## Decisiones derivadas (se registran)

> **DECISIÓN DE ARQUITECTURA PENDIENTE (D-016):** Comportamiento del refresh durante impersonación — ¿bloquear (expira a 1h, admin re-impersona) o crear sesión ligada en `user_sessions` con flag `impersonated`? Recomendación conjunta: **bloquear para MVP** (más simple y seguro).

> **DECISIÓN DE ARQUITECTURA PENDIENTE (D-017):** ¿En producción el strategy debe ignorar el header Bearer (solo aceptar cookie) para reducir superficie de ataque? Recomendación conjunta: **sí**, Bearer solo con toggle explícito/entorno no-prod.

---

# D-002 — Definición de `isVehicleOwner`

**Tipo:** `DOMAIN` / `PRODUCT`
**Estado (propuesto):** `PROPOSED`

## Contexto real verificado

- **Backend ya está adelantado:** existe `VehicleOwnership` (tabla `vehicle_ownerships`, con `startsAt`/`endsAt`, `type`, `acquiredByTransferId`; FK `Restrict` para preservar historia). `list-vehicles.handler.ts` ya filtra por `ownerships: { some: { userId, endsAt: null } }`. `assertVehicleAccess` del controller usa ownership activo **OR** `VehicleAccess` no revocado **OR** super_admin.
- **El patrón `role === "user" && memberships.length === 0` existe SOLO en el frontend** (`src/hooks/use-auth.ts:19`). No es parte del backend.
- **Falta de contrato:** `GET /auth/me` devuelve `workshopMemberships` pero **no** devuelve ownerships — el frontend no tiene fuente para derivar "owner" correctamente, así que inventó la inferencia.

## Decisión propuesta

> `isVehicleOwner` se deriva **exclusivamente de `VehicleOwnership` activa** (`endsAt: null`). El backend expone la información de ownership en el contrato de sesión. Se elimina la inferencia `role === "user" && memberships.length === 0`.

Aclaraciones:

1. **Una membresía de taller NO anula ownership.** Un mecánico también es propietario de su auto. La inferencia actual lo rompe.
2. **`isVehicleOwner` como boolean es una vista, no un concepto.** El dominio tiene ownership (temporal), access (puntual), transfer (historial). El backend no debe exponer un boolean calculado suelto si ya expone las relaciones.
3. Frontend no debe inventar la derivación mientras no exista el contrato; la inferencia actual se marca `TRANSITIONAL`.

## Implicaciones

**Backend:**

- `GET /auth/me`: agregar ownerships activas al payload de sesión.
- Incluir ownership en `VehicleResponseDto` (ya viene en listado crudo, falta en DTOs).
- Consolidar `assertVehicleAccess` (hoy helper privado del controller, 3 queries por request) hacia un `OwnershipService`/guard reutilizable.

**Frontend:**

- `use-auth.ts:19` → reemplazar por `me?.isVehicleOwner ?? false` (vía `useMe`).
- Revisar el **fallthrough "default = owner"** en `dashboard/page.tsx:23` (un usuario sin ownership no debe caer automáticamente al dashboard de owner).
- `use-dashboard.ts`: `ownerQuery` cambia su `enabled`.
- `sidebar.tsx`: eliminar el código muerto `ownerOnly` o activarlo con el flag oficial.

## Dependencias

- D-003 (Identity/USer) — para definir el contrato de datos.
- Modelo de Ownership (D-006).
- Access vs Ownership (D-008).

## Decisión derivada (producto)

> **DECISIÓN DE PRODUCTO PENDIENTE (D-018):** ¿Un co-owner (`type: co_owner`) tiene los mismos derechos de gestión que el owner? Esto define el contrato y los permisos `vehicle.*`.

---

# D-003 — Separación Identity vs User

**Tipo:** `DOMAIN` / `ARCHITECTURE`
**Estado (propuesto):** `PROPOSED → ACCEPTED` (ratifica ADR-001 T1)

## Contexto real verificado

- **ADR-001, Decisión T1 (2026-09-04) ya decidió:** _"Evolución progresiva, sin tabla Identity ahora. `User` representa cuenta+actor para el MVP. No migrar ninguna FK a Identity en este ciclo"_, con criterios de activación:
  1. Exista un caso real de actor sin cuenta, o
  2. Se modele Trust Profile/confianza por actor, o
  3. Se introduzca multi-tenancy que separe identidad del login.
- Candidatos a migración futura: `VehicleOwnership.userId`, `VehicleTransfer.from/toUserId`, `Appointment.customerId`, `WorkOrder.customerId`, `Estimate.customerId`.
- Verificación técnica: `User` está referenciada por ~20 relaciones. Introducir Identity ahora implicaría migrar decenas de FKs sin consumidor real → costo alto, beneficio cero para el MVP.
- El modelo actual ya expresa la separación mediante **relaciones** (`WorkshopMember`, `VehicleOwnership`, `VehicleAccess`, `Appointment.customer`).

## Decisión propuesta

> **Ratificar ADR-001 T1 como la decisión de D-003**: sin modelo Identity en MVP, con separación conceptual documentada y contrato de sesión que distinga `user` (cuenta) de `relationships` (memberships, ownerships, accesses). Revisar activación al entrar a multi-tenancy o actores sin cuenta.

## Implicaciones

**Backend:**

- Cero cambios de schema y migraciones.
- Reorganizar contrato de sesión: `{ user: {...}, roles: [...], memberships: [...], ownerships: [...] }` en `GET /auth/me` — prepara Identity sin romper nada.
- Documentar los triggers de activación para que no se pierdan.

**Frontend:**

- En MVP: **no crear abstracción paralela de Identity** (regla provisional del register §D-003). Solo adaptar tipos y `MeResponse` cuando exista el contrato.
- La sesión NextAuth sigue autenticando la cuenta (User) — no meter Identity en el JWT por defecto.
- `MeResponse` sumaría `identityId` cuando el backend lo exponga.
- Impersonation sigue operando sobre la cuenta, no sobre una identity sin cuenta.

## Riesgo

- Si el producto escala a "actor sin cuenta" (un taller registra un cliente sin user) el modelo actual no lo soporta. Trade-off aceptado para MVP; el trigger ya está definido y se escala a Tech Lead si aparece.

---

# D-004 — Active Context

**Tipo:** `PRODUCT` / `DOMAIN` / `ARCHITECTURE`
**Estado (propuesto):** `PROPOSED`

## Contexto real verificado

**Backend — infraestructura madura (Phase A-C), semántica de datos incompleta:**

- `src/common/context/` completo: `CurrentContext` (union type), `ContextResolver` (headers `X-Context-Type`/`X-Context-Id` → path fallback → PERSONAL), `ContextGuard`, `@ActiveContext()`.
- Controllers de maintenance, vehicles y dashboard ya usan `@UseGuards(JwtAuthGuard, ContextGuard)`.
- PermissionsGuard/WorkshopGuard leen `request.context` con fallback a `params.id`.
- **Fallos estructurales:** (1) `ContextResolver.resolveWorkshopContext` hace 1 query por request + PermissionsGuard 2-3 queries con cache 5min — sin invalidación por eventos (Phase D **no implementada**). (2) `GET /vehicles` ignora el contexto (siempre filtra por userId). (3) `maintenance` no valida contexto PERSONAL en reads → **IDOR potencial**. (4) **No existe `availableContexts`** en login/session — el frontend infiere contextos. (5) El path fallback (`:id` como workshopId) es heurística frágil. (6) Mecanismo HTTP sin decidir formalmente.

**Frontend — no hay modelo de contexto, se infiere:**

- Rol global + sesión + segmento URL + `workshopMembers[0]?.workshopId` (primer taller, sin elección) + query params.
- `GET /vehicles` para un usuario con 2 talleres = contexto que el backend infiera (probablemente PERSONAL). El dashboard de taller usa `workshopMembers[0]` sin que el usuario elija.

## Decisión propuesta

> Completar Active Context como **el eje de autorización del backend**:

### 1. Mecanismo HTTP oficial

**Headers `X-Context-Type` / `X-Context-Id` por request** (sin estado server-side) + devolver **`availableContexts`** en login/session. (Header por request → coincide con ADR-001 Opción C y lo ya implementado.)

### 2. Semántica de recursos por contexto (la pregunta clave del PM)

- **PERSONAL** → recursos por **ownership/access** de la identity.
- **WORKSHOP** → recursos por **pertenencia al taller** del contexto. El `workshopId` del contexto **siempre gana** al `workshopId` de body/query — con `ForbiddenException` si difieren (patrón que maintenance ya usa).
- **PLATFORM** → recursos globales, solo con roles de sistema.

### 3. Completar Phase D

Cache de contexto + **invalidación por eventos** (`WorkshopMemberRemoved/Added`, `RoleChanged`, `AssignmentChanged` → ya existen los eventos en administration) antes de escalar el número de módulos.

### 4. Eliminar el path-fallback

Como mecanismo de compatibilidad en un plazo acotado (último vestigio de ambigüedad).

## Implicaciones

**Backend:**

- `availableContexts` en `LoginResponse`/`AuthResponseDto` + `GET /auth/me`.
- Pasar `CurrentContext` a handlers de listado (vehicles, maintenance) y definir filtrado por contexto. `ListVehiclesHandler` decide: ownership para PERSONAL; relación workshop→vehículo para WORKSHOP.
- Cerrar el IDOR de maintenance en contexto PERSONAL.
- Phase D (cache invalidación por eventos).

**Frontend:**

- Nuevo `use-active-context` (React Context) + `ContextSwitcher` en header cuando >1 contexto.
- Persistencia de UX en `localStorage` (nunca autoridad).
- `apiClient` y `serverFetch` inyectan `X-Context-Type` / `X-Context-Id` centralizados (`src/lib/context.ts`).
- **queryKey de TanStack Query DEBEN incluir el contexto activo** (hoy no lo incluyen) — el cambio más invasivo/fácil de olvidar.
- Sidebar → configuración de navegación por contexto (no heurísticas).
- `/dashboard` resuelve por contexto activo, no por `workshopMembers[0]`.

## Decisiones derivadas (producto/arquitectura)

> **DECISIÓN DE PRODUCTO PENDIENTE (D-019):** ¿Qué significa "vehículos" en contexto WORKSHOP para el MVP: solo vehículos con historia en el taller (derivado de appointments/OTs/service records) o un registro explícito de vehículos de clientes (junction `workshop_vehicles`)? Recomendación técnica: **derivado** para MVP; evaluar junction solo si el taller necesita "parque de clientes" explícito.

> **DECISIÓN DE ARQUITECTURA PENDIENTE (D-020):** Cuando `X-Context-Type: WORKSHOP` trae un id inválido/no activo, hoy cae **silenciosamente a PERSONAL**. ¿Fallo duro (403) o soft (PERSONAL)? Recomendación conjunta: **fallo duro (403)** para no enmascarar errores del frontend.

> **DECISIÓN DE ARQUITECTURA PENDIENTE (D-021):** ¿El contexto es **ruta-driven** (ej. `/workshops/[id]` fuerza WORKSHOP) o **global de sesión** (aplica a todas las llamadas)? Implica cómo se persiste (cookie vs localStorage) para SSR. Requiere decisión conjunta PM/Backend.

---

# D-005 — CareEpisode como entidad central de atención

**Tipo:** `PRODUCT` / `DOMAIN`
**Estado (propuesto):** `PROPOSED` (ratifica ADR-005 T3/T4)

## Contexto real verificado

- **ADR-005 T4 ya decidió:** "CareEpisode como tabla nueva (aggregate conceptual), modelo `Vehicle → CareEpisode → {Diagnosis, Estimate, WorkOrder, ServiceRecord}`, `careEpisodeId` FK a ServiceRecord (requerido), WorkOrder y Estimate (derivable), reutilizar WorkOrder/Estimate/ServiceRecord sin reconstruir, migrar maintenance con compatibilidad transitoria". ADR-005 T3 endureció FKs históricas (Restrict).
- **Lo que falta:** decisiones de producto P1/P2 (quién crea episodios, qué journeys sobreviven) y el diseño fino del schema/estados.
- **Modelo actual:** `Appointment` (operacional, CASCADE): scheduled → confirmed → in_progress → completed/cancelled/no_show. `WorkOrder` (histórico, Restrict). `Estimate` (histórico, Restrict). `ServiceRecord` (histórico, Restrict). Eventos: `appointment.created`, `work-order.created`, `service.recorded`, + transfer/mileage.
- **Frontend:** `ServiceRecord` es un registro plano (vehicleId, workshopId, workOrderId?, mileageAtService, description, serviceDate, totalCost?, notes). El timeline del vehículo (`vehicle-timeline.tsx`) **NO incluye service records** hoy (solo registration|transfer|mileage|access).

## Decisión propuesta

> **`CareEpisode` como entidad central de atención** (convención: código `CareEpisode`, BD `care_episodes`, evento `CareEpisodeCreated`, UI `Atención`/`Ingreso de Servicio`). **NO se renombra `ServiceRecord` por búsqueda/reemplazo** — un ServiceRecord es un snapshot plano; un CareEpisode es jerárquico (ingreso → diagnosis/estimates/workOrders → cierre). `ServiceRecord` evoluciona a "resultado de un episodio".

### Esquema propuesto (para revisión del Database/Tech Lead)

```prisma
enum CareEpisodeStatus {
  open             // vehículo ingresado
  in_diagnosis     // diagnosticando
  waiting_approval // presupuesto pendiente
  approved         // autorizado
  in_progress      // reparando
  quality_check    // control final
  ready            // listo para entregar
  delivered        // entregado — cerrado
  cancelled        // cancelado
}

model CareEpisode {
  id                  String   @id @default(uuid()) @db.Uuid
  vehicleId           String   @map("vehicle_id") @db.Uuid
  workshopId          String   @map("workshop_id") @db.Uuid
  branchId            String   @map("branch_id") @db.Uuid
  appointmentId       String?  @map("appointment_id") @db.Uuid
  customerId          String   @map("customer_id") @db.Uuid
  status              CareEpisodeStatus @default(open)
  checkInAt           DateTime @map("check_in_at") @db.Timestamptz
  receivedByMemberId  String?  @map("received_by_member_id") @db.Uuid
  mileageIn           Int?     @map("mileage_in")
  fuelLevel           Int?     @map("fuel_level")
  customerComplaint   String?  @map("customer_complaint")
  vehicleCondition    String?  @map("vehicle_condition")
  closedAt            DateTime? @map("closed_at") @db.Timestamptz
  mileageOut          Int?      @map("mileage_out")
  deliveredTo         String?   @map("delivered_to")
  summary             String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  vehicle      Vehicle        @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  workshop     Workshop       @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  branch       WorkshopBranch @relation(fields: [branchId], references: [id], onDelete: Restrict)
  appointment  Appointment?   @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  customer     User           @relation(fields: [customerId], references: [id], onDelete: Restrict)
  receivedBy   WorkshopMember? @relation(fields: [receivedByMemberId], references: [id], onDelete: SetNull)

  workOrders     WorkOrder[]
  estimates      Estimate[]
  serviceRecords ServiceRecord[]

  @@index([vehicleId, checkInAt])
  @@index([workshopId, status])
  @@index([branchId])
  @@index([customerId])
  @@map("care_episodes")
}
```

FKs a agregar a entidades existentes:

- `ServiceRecord.careEpisodeId` — **requerido** (todo registro de servicio pertenece a un episodio).
- `WorkOrder.careEpisodeId` — nullable (una OT puede nacer de un episodio o directa/walk-in).
- `Estimate.careEpisodeId` — nullable.
- `Appointment` queda como **pre-episodio operacional** (no se toca; la relación es `CareEpisode.appointmentId`, no al revés).

### Estados / ciclo (respuesta a las preguntas del PM)

- Nace en el **check-in** (`open`). A partir de `appointmentId` (turno) o directo (walk-in).
- `Appointment` cancelado **no mata el episodio** si ya ingresó; si no ingresó el episodio no nace (el check-in es el trigger) → **requiere confirmación de producto**.
- Se cierra con `delivered` (o `cancelled`); `summary` + `mileageOut` obligatorios para cerrar.

## Implicaciones

**Backend (el cambio más grande de los 5):**

- Nuevos commands/queries: `CheckInVehicleCommand` (crea CareEpisode → `CareEpisodeCreated`), `StartDiagnosis`, `CompleteDiagnosis`, `OpenEstimateFromDiagnosis`, `ApproveEstimate`, `CompleteWorkOrder`, `DeliverVehicleCommand`, `CancelCareEpisode`. Queries: `GetCareEpisode`, `ListCareEpisodes`, timeline narrativo.
- Refactor de handlers existentes para recibir `careEpisodeId` (compatibilidad transitoria nullable).
- Nuevos eventos: `CareEpisodeCreated`, `CareEpisodeDiagnosisCompleted`, `CareEpisodeEstimateApproved`, `CareEpisodeWorkCompleted`, `CareEpisodeDelivered`, `CareEpisodeCancelled` (emitidos **después** del cambio de estado exitoso).
- Permisos nuevos en seed: `care_episode.check_in`, `care_episode.diagnose`, `care_episode.deliver`, `care_episode.cancel` (+ `workorder.*`, `estimate.*`, `appointment.*` existentes).

**Frontend:**

- **No renombrar** por search/replace. Coexistencia: mantener `service-records` como placeholder y construir "Atenciones" (`/vehicles/[id]/care-episodes`) cuando exista contrato backend.
- Nuevos tipos `CareEpisode` jerárquicos solo cuando exista contrato backend.
- Timeline: agregar tipo de evento `service`/`care-episode`. El timeline sigue siendo **proyección derivada** del backend (no construir fusionando service records en frontend).
- `service-record-form.tsx` se reemplaza por `CareEpisodeForm` (check-in + entries).

## Riesgos

- **Riesgo de alcance (mayor):** refactor maintenance + nueva entidad + nuevos endpoints + migración = el más grande de los 5. Requiere decisión P1/P2 para acotar journeys del MVP.
- **Legacy data:** registros existentes sin episodio. Estrategia: `careEpisodeId` nullable transitoriamente + backfill opcional.
- **Doble modelo durante transición:** endpoints viejos y nuevos conviven; riesgo de escritura inconsistente. Mitigar: bloquear `createServiceRecord` sin `careEpisodeId` una vez migrado el frontend.
- **IDOR:** los nuevos endpoints de episodios deben validar ownership/workshop.

## Decisiones derivadas (producto)

> **DECISIÓN DE PRODUCTO PENDIENTE (D-022):** Políticas P1/P2 del MVP — qué journeys crean un CareEpisode (check-in con/sin turno, walk-in), quién puede crearlos, y qué acciones requieren estado `waiting_approval` obligatorio. Bloqueante para el diseño fino del schema.

> **DECISIÓN DE PRODUCTO PENDIENTE (D-023):** ¿Qué hago con un `Appointment` cancelado que ya ingresó como CareEpisode? ¿El episodio sigue vivo (policy del taller) o se cancela?

---

# Decisiones derivadas a registrar

En el `DECISION-REGISTER.md` aparecen como sección 6 (D-006 a D-015). Las siguientes son las que surgieron durante el análisis y deben incorporarse al register como nuevas:

| ID    | Tema                                                                              | Tipo                    | Estado sugerido |
| ----- | --------------------------------------------------------------------------------- | ----------------------- | --------------- |
| D-016 | Refresh durante impersonación (bloquear vs sesión ligada)                         | ARCHITECTURE / SECURITY | PENDING         |
| D-017 | ¿Ignorar header Bearer en producción (solo cookies)?                              | ARCHITECTURE / SECURITY | PENDING         |
| D-018 | Derechos de co-owner vs owner                                                     | DOMAIN / PRODUCT        | PENDING         |
| D-019 | Significado de "vehículos" en contexto WORKSHOP (derivado vs junction)            | PRODUCT / DOMAIN        | PENDING         |
| D-020 | Fallo duro vs soft cuando contexto inválido (403 vs PERSONAL)                     | ARCHITECTURE            | PENDING         |
| D-021 | Contexto ruta-driven vs sesión-driven + persistencia SSR                          | PRODUCT / ARCHITECTURE  | PENDING         |
| D-022 | Políticas P1/P2 del MVP para CareEpisode (journeys, quién crea, waiting_approval) | PRODUCT                 | PENDING         |
| D-023 | Appointment cancelado que ya ingresó como CareEpisode                             | PRODUCT / DOMAIN        | PENDING         |

---

# Orden propuesto de aprobación e implementación

Concordante con los dos Tech Leads y con el register §8:

| Orden | Decisión                                  | Estado                                         | Prerequisito                 |
| ----- | ----------------------------------------- | ---------------------------------------------- | ---------------------------- |
| 0     | **Fix build frontend** (`getAuthHeaders`) | —                                              | Independiente e inmediato    |
| 1     | **D-001** Auth (cookies)                  | Cerrar de inmediato (formalizar lo construido) | Ninguno técnico              |
| 2     | **D-003** Identity (ratificar ADR T1)     | Cerrar de inmediato                            | Ninguno                      |
| 3     | **D-004** Active Context                  | Desbloqueado tras decisión de producto D-019   | Producto: semántica WORKSHOP |
| 4     | **D-002** isVehicleOwner                  | Barato; desbloquea bug de UX real              | Contrato `GET /auth/me`      |
| 5     | **D-005** CareEpisode                     | El de mayor esfuerzo                           | Producto: D-022/D-023        |

**Regla:** ninguna decisión se implementa hasta que esté `ACCEPTED` en el register. Los agentes no implementan decisiones `PENDING`.

---

# Próximos pasos para el usuario

1. **Evaluar y aprobar/rechazar** cada propuesta D-001 a D-005.
2. **Resolver las decisiones de producto pendientes** que bloquean D-004 y D-005 (D-019, D-022, D-023 son las críticas).
3. Autorizar las decisiones de arquitectura derivadas (D-016, D-017, D-020, D-021) que en su mayoría tienen recomendación técnica.
4. Marcadas como `ACCEPTED`, se actualiza `DECISION-REGISTER.md` y se elabora el **plan de implementación** por separado para Backend y Frontend.
