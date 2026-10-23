# Gap 1 — Alta de vehículos 0 km por concesionaria

**Propósito:** Traducir a diseño técnico las decisiones D-128..D-157 (sección 39 del `DECISION-REGISTER.md`) para que una concesionaria pueda registrar un vehículo 0 km como **primer titular**, registrar su kilometraje y transferirlo al comprador mediante el QR de venta existente.

**Estado:** Diseño técnico propuesto. **Sin implementación.** No se modificó código, ni `schema.prisma`, ni se creó ninguna migración.

**Alcance:** Este documento *no re-litiga producto*. Las decisiones de producto ya están cerradas y se citan como contexto. Lo que aquí se decide es **cómo** se implementan sin romper la arquitectura vigente.

**Convención de este documento:** cada decisión técnica se expresa como `Problema → Decisión → Razón → Alternativas descartadas → Trade-off → Impacto`.

---

# 0. Resumen ejecutivo

Cuatro hallazgos condicionan todo el diseño:

1. **La atribución de kilometraje a una concesionaria es imposible con el schema actual.** `CurrentContext` en contexto `DEALERSHIP` expone `memberId` de tipo `DealershipMember`, pero `VehicleMileage.recordedByMemberId` referencia `WorkshopMember`. Escribir el `memberId` del contexto violaría la FK. El comentario del propio schema (línea 779-781) afirma que ese campo *es* el patrón para miembros de concesionaria — la relación está cableada al modelo equivocado.

2. **El patrón correcto ya existe y no hay que inventarlo.** `VehicleTransferQr` resuelve exactamente el mismo problema con tres campos: persona física (`createdByUserId`, siempre `NOT NULL`), contexto organizacional (`createdByDealershipId`) y miembro actuante (`consumedByMemberId` → `DealershipMember`). El diseño replica esa forma en `VehicleMileage`.

3. **La auditoría no puede ser un listener de eventos.** `EventEmitter2` es in-process, no durable ni transaccional. Como la auditoría de VIN y odómetro debe ser tan confiable como la propia escritura, se persiste **en la misma transacción** que el hecho auditado. `MileageRecordedEvent` y `VehicleRegisteredEvent` no tienen ningún `@OnEvent` consumidor hoy, así que esto no rompe nada.

4. **El frontend ya está construido para parte de este gap y hoy está roto en silencio.** La página de detalle lee `vehicle.mileages` y ya distingue “sin registros” de “0 km”, pero el backend nunca envía ese campo: la tarjeta muestra siempre *“Todavía no hay registros de kilometraje.”* Exponer `mileages` en `GET /vehicles/:id` repara la UI sin cambiar una línea de frontend.

**Control principal de la historia:** la escritura muere al transferirse. Cuando el vehículo se transfiere al comprador, el ownership de la concesionaria se cierra y toda escritura posterior (`PATCH`, `POST /mileage`) devuelve `403`. No se diferencia por rol de sistema ni por roles custom.

---

# 1. Estado verificado del código

Inspección directa de los dos repositorios. Todas las afirmaciones de esta sección están verificadas contra el código actual.

## 1.1 Hallazgos con evidencia

| # | Hallazgo | Evidencia |
|---|---|---|
| H-01 | `VehiclesController` aplica `JwtAuthGuard` + `ContextGuard` a **toda** la clase, incluido el preview de QR. El comentario “no requiere ser owner (el receptor debe poder consultarlo antes de aceptar)” describe el requisito, no el comportamiento. | `vehicles.controller.ts:102`, `:207-223` |
| H-02 | No existe metadata `@Public()` ni equivalente. Los guards de método se **agregan** a los de clase, no los reemplazan. | `jwt-auth.guard.ts` sin metadata; todos los controllers públicos (`wizard.controller.ts`, `auth.controller.ts`) son controllers separados sin guard JWT de clase |
| H-03 | `VehicleResponseDto.from()` **descarta** `mileages` aunque `GetVehicleHandler` los consulta (últimos 5). | `vehicle-response.dto.ts:51-73`, `get-vehicle.handler.ts:55` |
| H-04 | `RecordMileageDto.source` lo elige el cliente. | `record-mileage.dto.ts` |
| H-05 | `RecordMileageHandler` **no escribe `recordedByMemberId`**. | `record-mileage.handler.ts:28-43` |
| H-06 | La monotonía compara contra el registro `ORDER BY recorded_at DESC`, no contra `max(mileage)`, y no hay transacción. Carrera entre escrituras concurrentes. | `record-mileage.handler.ts:46-51` |
| H-07 | Ya existe el índice que hace barato el `max()`: `@@index([vehicleId, mileage])`. | `schema.prisma:1261` |
| H-08 | `MileageSource.dealership` ya existe en el enum. | `schema.prisma:85` |
| H-09 | `VehicleVersion` es catálogo (`brand/model/version`), no auditoría. No existe ningún modelo de auditoría en el schema. | `schema.prisma:1106`, ausencia total de `audit` |
| H-10 | `main.ts` usa `ValidationPipe({ whitelist: true, forbidNonWhitelisted: false })`. Un campo no declarado se **descarta en silencio**, no se rechaza. | `main.ts:25-30` |
| H-11 | `UpdateVehicleDto extends PartialType(RegisterVehicleDto)` → `vin` es editable en `PATCH`. | `update-vehicle.dto.ts`, `register-vehicle.dto.ts:23` |
| H-12 | `RegisterVehicleDto.vin` es `@IsString() @IsOptional()` **sin validación de formato**. No existe regex de VIN en ninguna parte del backend. | `register-vehicle.dto.ts:23`, grep `vin` sin resultados de `Pattern` |
| H-13 | D-043 permite **limpiar** el VIN con `vin: null` explícito, y hay test que lo cubre. Choca con “VIN inmutable”. | `update-vehicle.handler.spec.ts:143-164` |
| H-14 | `VehicleOwnership` **no tiene** índice único parcial para `ends_at IS NULL`. | `schema.prisma:1302-1307` |
| H-15 | Generación y aceptación de QR leen el ownership activo con `findFirst` **sin `orderBy`**: si hubiera duplicados, la fila elegida es arbitraria y afecta la autorización. | `generate-consignment-qr.handler.ts`, `accept-transfer-qr.handler.ts` |
| H-16 | Existe precedente raw SQL de índice único parcial de dominio. | migración QR (`ON (vehicle_id) WHERE status='pending'`) |
| H-17 | `DealershipContext.memberId` → `DealershipMember`; `WorkshopContext.memberId` → `WorkshopMember`. | `current-context.interface.ts` |
| H-18 | **D-146 es técnicamente imposible hoy**: `VehicleMileage.recordedByMember` referencia `WorkshopMember`, no `DealershipMember`. No comparten tabla. | `schema.prisma:1258` |
| H-19 | El comentario del schema afirma que `recordedByMemberId` de `VehicleMileage` es “el patrón” para miembros de concesionaria. Contradicción interna schema↔schema. | `schema.prisma:779-781` |
| H-20 | `VehicleTransferQr` ya resuelve la atribución con `createdByUserId` (persona) + `createdByDealershipId` (contexto) + `consumedByMemberId` → `DealershipMember`. | `schema.prisma:1401-1445` |
| H-21 | El flujo QR `purpose='sale'` **ya soporta** vehículo nacido en dealership: cierra ownership de dealership, crea transfer `fromDealershipId`, crea ownership del comprador. | `accept-transfer-qr.handler.ts` |
| H-22 | Sin transfer previo (`takeTransfer == null`) la revocación del acceso del vendedor original es **no-op**: es correcto y no requiere cambio de código. | `accept-transfer-qr.handler.ts` |
| H-23 | El preview público puede **expirar el QR** y emitir `vehicle.transfer.qr_expired` (con listener de email). Un GET produce una escritura única. | `preview-transfer-qr.handler.ts`, `transfer-qr-expired-email.listener.ts:25` |
| H-24 | `VehicleAccessService` tiene una **allowlist hardcoded** de permisos de lectura. Los 3 permisos nuevos deben agregarse. | `vehicle-access.service.ts:229-233` |
| H-25 | El seed no tiene los 3 permisos nuevos; `admin` no tiene `sell`/`return` (no se cambia en este gap). | `prisma/seed.ts` |
| H-26 | `POST /vehicles/:id/qr` **no tiene** `ThrottlerGuard` (solo `accept` y `preview` lo tienen). | `vehicles.controller.ts:250-264` |
| H-27 | La sintaxis real del throttle es `@Throttle({ default: { limit: 10, ttl: 60000 } })` (bucket nombrado `default`), no `@Throttle({ limit, ttl })`. | `vehicles.controller.ts:214`, `:230` |
| H-28 | `ThrottlerModule.forRoot` **no define `getTracker`** → todos los límites son **por IP**. | `app.module.ts:39-44` |
| H-29 | No hay ningún `@OnEvent` para `vehicle.registered` ni `vehicle.mileage.recorded`. | grep `@OnEvent` (14 resultados, ninguno de esos dos) |
| H-30 | Frontend: el login valida `next` con `startsWith("/") && !startsWith("//")` — cualquier ruta interna, no una allowlist. | `(auth)/login/page.tsx` |
| H-31 | Frontend: register no preserva `next`. | `(auth)/register/page.tsx` |
| H-32 | Frontend: `/transfer/qr/[token]` redirige anónimos **antes** de pedir el preview. | `transfer/qr/[token]/page.tsx` |
| H-33 | Frontend: el detalle ya renderiza `vehicle.mileages ?? []` y distingue “sin registros”. Hoy siempre muestra vacío porque el backend no manda el campo. | `vehicles/[id]/page.tsx:941-957` |
| H-34 | Frontend: `MileageSection canWrite={isOwner}` y `isOwner = isVehicleOwner(vehicle, user?.id)` → un miembro de dealership **nunca** puede registrar km en la UI. El comentario lo dice explícitamente. | `vehicles/[id]/page.tsx:1249-1253`, `:1345` |
| H-35 | Frontend: `vehicleApi.recordMileage` manda `source: "owner"` hardcodeado. | `api.ts:597-604` |
| H-36 | Frontend: `toEditVehicleInput` manda `vin` en el `PATCH`. | `vehicle-form-schema.ts:134-135` |
| H-37 | Frontend: el banner “En consignación… no se pueden modificar fotos, documentos y kilometraje” se muestra a **cualquier** lector cuando el ownership activo es `company`, incluso a un miembro de esa concesionaria. Para un 0 km el copy es falso. | `vehicles/[id]/page.tsx:1262-1277`, `lib/consignment.ts:44-52` |
| H-38 | Frontend: hay suite Vitest activa con ~40 archivos de test (`npm test` → `vitest run`), incluidos `vehicle-register-form`, `vehicle-edit-form`, `vehicle-detail-page`, `qr-accept-page`, `vehicle-history`. | `web-follow-app/package.json` scripts + `__test__/` |
| H-39 | Los permisos llegan al frontend por `roles[].permissions` en la sesión, aplanados por helpers. | `types/auth.ts:11`, `lib/admin-access.ts:31-55` |
| H-40 | El backend tiene `zod` declarado en `package.json` pero **no lo importa en ningún lado** de `src`. No hay precedente de contrato compartido. | `package.json` deps + grep `from 'zod'` → 0 resultados |
| H-41 | Los dos repos son independientes: sin npm workspaces, sin `packages/`, sin dependencia local entre ellos. | ausencia de `workspaces` en ambos `package.json`, ausencia de dir `packages/` |
| H-42 | `@nestjs/throttler@6.5.0` soporta `getTracker(req, context)` por *throttler set* y `generateKey` (Context7, `/nestjs/throttler`). `getTracker` con segundo argumento existe desde 6.3.0. | documentación oficial v6 |

## 1.2 Contradicciones que este diseño resuelve explícitamente

| Contradicción | Resolución |
|---|---|
| El comentario de `DealershipMember` promete el patrón de atribución de `VehicleMileage`, pero la FK apunta a `WorkshopMember` (H-18/H-19). | D-01: se replica el patrón de `VehicleTransferQr` y se corrige el cableado. |
| D-043 permite limpiar el VIN con `null` (H-13), pero D-133 (corregida) lo declara inmutable. | D-03: `vin` sale de la superficie de `PATCH`; la limpieza deja de ser una operación implícita y pasa a ser una corrección auditada. El test de D-043 debe actualizarse. |
| El frontend manda `vin` en `PATCH` (H-36) y el backend lo va a rechazar. | Breaking change coordinado → D-12. |
| El requisito dice “conservar `@Throttle({ limit: 10, ttl: 60000 })`”, pero el código usa la forma con bucket nombrado `default` (H-27). | Se conserva **el límite real vigente** (10 req / 60 s por IP) sin cambiar su sintaxis. |
| El frontend ya distingue “0 km” de “sin registros” (H-33) pero la UI está rota en silencio. | D-11 repara el contrato y la UI funciona sin cambios de frontend. |

## 1.3 Riesgo **no verificado** en runtime

`src/modules/vehicles/commands/delete-vehicle/delete-vehicle.handler.ts` no inspecciona ownerships ni kilometrajes antes de ejecutar el soft delete, mientras que `VehicleMileage.vehicle` y `VehicleOwnership.vehicle` usan `onDelete: Restrict`.

**Este punto NO fue verificado en ejecución y el documento no afirma ni niega el resultado.** Lo que se constata es exclusivamente la lectura del código (ausencia de esas comprobaciones) y del schema (relaciones `Restrict`). Queda como **deuda a verificar** en QA (§12), porque cualquier cambio de este gap aumenta el número de vehículos 0 km con ownership y kilometraje asociado.

---

# 2. Decisiones de diseño

## D-01 — Atribución de kilometraje en contexto dealership

**Problema:** D-146 exige `recordedByMemberId` obligatorio cuando el registro es en contexto organizacional. Pero `CurrentContext` en `DEALERSHIP` entrega un `DealershipMember.id` y la columna existente referencia `WorkshopMember` (H-18). No hay forma correcta de escribirlo.

**Decisión:** replicar en `VehicleMileage` la forma de `VehicleTransferQr` (H-20):

| Campo | Tipo | Significado |
|---|---|---|
| `recordedByUserId` | `User?` | Persona física que actuó. **Siempre** se escribe (mismo criterio que `createdByUserId` NOT NULL en `VehicleTransferQr`). |
| `recordedByWorkshopMemberId` | `WorkshopMember?` | Miembro de taller actuante (renombre de `recordedByMemberId`). |
| `recordedByDealershipId` | `Dealership?` | Contexto organizacional. |
| `recordedByDealershipMemberId` | `DealershipMember?` | Miembro de concesionaria actuante. |

El contrato HTTP **no expone** ninguna de estas FK. `GET /vehicles/:id` devuelve una atribución normalizada (`recordedBy`), para no filtrar qué tabla interna se usó.

**Razón:** es el patrón que la propia arquitectura ya aprobó para el mismo problema, con los mismos CHECKs XOR a nivel DB. No introduce un concepto nuevo.

**Alternativas descartadas:**
- *Cambiar la FK existente a `DealershipMember`*: rompe los registros históricos de taller y mezcla dos dominios en una columna.
- *Una sola columna polimórfica sin FK* (`member_id` + `member_type`): pierde integridad referencial, contra `AGENTS.md` §13/§14.
- *Guardar solo `user_id` y resolver la organización por el contexto del request*: no es auditable; el contexto es mutable y la atribución debe ser histórica.

**Trade-off:** `VehicleMileage` gana 3 columnas y 2 CHECKs. Se acepta.

**Impacto:** migración B. Sin cambios en `WorkshopMember` ni en `DealershipMember`.

---

## D-02 — Auditoría append-only persistida en la misma transacción

**Problema:** D-144 exige auditar corrección de VIN y registro de odómetro. `EventEmitter2` es in-process: sin durability, sin retry, sin transacción, se pierde ante reinicio y no participa del commit.

**Decisión:** nuevo modelo `VehicleAuditLog`, escrito **dentro de la misma transacción** que el hecho auditado.

```
VehicleAuditLog
  id                 uuid pk
  vehicleId          uuid  FK → vehicles          onDelete: Restrict
  action             VehicleAuditAction           vin_corrected | mileage_recorded
  field              string                        'vin' | 'mileage'
  previousValue      string?
  newValue           string?
  actorUserId        uuid  FK → users             onDelete: Restrict   (persona física)
  dealershipId       uuid? FK → dealerships       onDelete: Restrict
  dealershipMemberId uuid? FK → dealership_members onDelete: Restrict
  contextType        string                        personal | workshop | dealership | platform
  createdAt          timestamptz
  @@index([vehicleId, createdAt])
```

Sin columna `vehicleMileageId`: la auditoría es un registro histórico y **no** debe encadenarse a la vida de la fila auditada.

**Razón:** la auditoría es tan confiable como el hecho que audita. Un listener no puede ofrecer esa garantía con EventEmitter2; un `INSERT` en la misma transacción sí.

**Alternativas descartadas:**
- *Listener `@OnEvent('vehicle.mileage.recorded')`*: no durable, no transaccional, se pierde en reinicio. Descartado explícitamente.
- *Reutilizar `VehicleTransferEvent`*: modela hitos de transferencia, no correcciones de datos. Forzaría su semántica.
- *Trigger de base de datos*: garantiza la integridad, pero es más difícil de testear y mezcla lógica de negocio en la capa de datos; el proyecto prefiere invariantes en la app cuando el `CHECK` no alcanza.

**Trade-off:** append-only por convención (no hay método de repository para `update`/`delete`, y `onDelete: Restrict` impide el borrado en cascada desde el vehículo). No se agrega trigger de inmutabilidad: ceremonia desproporcionada para el MVP.

**Impacto:** migración C. Ningún evento existente se modifica.

---

## D-03 — VIN inmutable en `PATCH`, corrección por comando dedicado

**Problema:** H-11/H-13. `vin` es editable y se puede limpiar con `null`, contra D-133 (corregida).

**Decisión:**

1. `UpdateVehicleDto` **deja de heredar** `PartialType(RegisterVehicleDto)`. Se declara explícitamente con los campos editables (`color`, `notes`, `manufactureYear`, `modelYear`, `engineNumber`, `versionId`) y `vin` declarado con `@IsEmpty()` y **sin** `@IsOptional()`.
   - Por qué declararlo en vez de omitirlo: con `forbidNonWhitelisted: false` (H-10), un `vin` no declarado se **descarta en silencio** y el cliente cree que se guardó. Declararlo produce un `400` explícito y verificable.
2. La corrección de VIN es un comando nuevo: `POST /vehicles/:id/vin-correction`, permitido solo a owner activo o admin (D-133), siempre audited (D-144) en la misma transacción que el `UPDATE`.

**Razón:** separa el permiso de corrección del path de edición ordinario, y da a la auditoría un disparador inequívoco.

**Alternativas descartadas:**
- *Permitir `vin` en `PATCH` solo para owner/admin*: mezcla dos permisos en una ruta, hace condicional la autorización dentro del DTO/handler y convierte `PATCH` en un endpoint sobrespecializado.
- *Comparar `vin` dentro del handler y rechazar si no es owner*: deja la superficie del contrato ambigua (el cliente no sabe si puede enviarlo).

**Trade-off:** un endpoint más. A cambio, `PATCH` tiene un contrato estable y la corrección queda trazable.

**Impacto:** **breaking change**. Actualizar `update-vehicle.handler.spec.ts` (el test de D-043 que limpia `vin` con `null` debe reorientarse a la corrección auditada).

---

## D-04 — Validador de VIN: fuente única en backend, espejo en frontend, sin paquete compartido

**Problema:** D-145 pide un validador compartido. No existe mecanismo de compartir: dos repos sin workspaces (H-41), sin precedente de paquete compartido, `zod` declarado pero sin usar en el backend (H-40).

**Decisión:**

1. **Fuente única de verdad:** `api-follow-app/src/common/validation/vin.ts` exporta `normalizeVin()` y `isValidVin()`, con sus vectores de prueba en un fixture versionado.
2. **Frontend:** espejo de la misma lógica en `web-follow-app/src/lib/vin.ts`, con **los mismos vectores de prueba** copiados.
3. Ambos lados ejecutan los mismos vectores como test. La derivación se detecta en CI, no en producción.
4. Normalización: `trim()` + `uppercase()` antes de validar y antes de persistir.
5. Reglas: exactamente 17 caracteres, alfabeto `[A-HJ-NPR-Z0-9]` (excluye I, O, Q), y **dígito verificador** de Norteamérica (ISO 3779 / North American VIN).

**Sobre la fuente autoritativa de WMI (posiciones 1-3):** el diseño **deliberadamente no incluye una allowlist de WMI** en el MVP. Una lista embebida se pudriría, rechazaría vehículos legítimos de marcas no catalogadas y convertiría una decisión técnica en una gatekeeping comercial sin dueño.

**Razón:** es la opción que no necesita un tercero, no introduce dependencia de red en el camino de alta y no puede dejar vehicles legados afuera por un dato desactualizado.

**Alternativas descartadas:**
- *Publicar un paquete npm compartido* (`@hcdv/vin` en un tercer repo): exige versionado, pipeline de publicación y coordinación entre dos lockfiles independientes. Desproporcionado para un validador en el MVP.
- *Valorar solo en frontend y confiar en el backend*: contradice `AGENTS.md` §23 — el backend es la frontera final.
- *Lookup a OpenDataVPIC en el alta*: dependencia externa en el camino crítico, latencia, rate limits, fallas offline y una dependencia de tercero para la confiabilidad de la historia vehicular.

**DECISIÓN DE PRODUCTO PENDIENTE (no bloqueante):** si el producto quiere validar marca/planta contra un catálogo propio, hace falta una decisión explícita sobre quién mantiene esa lista. Con el default técnico propuesto, la implementación **no está bloqueada**.

**Trade-off:** duplicación controlada de ~30 líneas, compensada por vectores de prueba compartidos.

---

## D-05 — `source` derivado del servidor

**Problema:** H-04. El cliente elige `source`, lo que permite etiquetar falsamente un registro.

**Decisión:** `RecordMileageDto` **no** expone `source`. El handler lo deriva del contexto efectivo:

| Contexto activo | `source` |
|---|---|
| `PERSONAL` (owner) | `owner` |
| `DEALERSHIP` | `dealership` |
| `WORKSHOP` | `workshop` |

`recordedByUserId` se escribe siempre. En `DEALERSHIP` se escriben además `recordedByDealershipId` y `recordedByDealershipMemberId`.

**Razón:** `source` es una afirmación de confianza; no puede ser del solicitante.

**Alternativas descartadas:**
- *Ignorar el `source` del cliente si viene, sin rechazarlo*: el cliente cree que se guardó y el dato se pierde. Rechazar explícitamente es preferible (mismo criterio que D-03).

**Impacto:** **breaking change** en el contrato del endpoint. El frontend debe dejar de mandar `source` (H-35).

---

## D-06 — Monotonía del odómetro: bloqueo de fila sobre `vehicles`

**Problema:** H-06. Dos escrituras concurrentes pueden leer el mismo máximo y ambas escribir, rompiendo la invariante D-141.

**Decisión:** la escritura de kilometraje corre en una transacción interactiva que:

1. **toma un lock de fila sobre el vehículo** — `SELECT id FROM vehicles WHERE id = $1 FOR UPDATE` vía `$queryRaw`;
2. lee `max(mileage)` (cubierto por `@@index([vehicleId, mileage])`, H-07);
3. valida `mileage >= max`;
4. inserta el registro **y** su `VehicleAuditLog` (D-02);
5. emite el evento **después** del commit.

**Razón:** el lock de fila sobre el vehículo serializa exactamente a los escritores que compiten —los únicos que importan— y no provoca abortos por contención con terceros. Cubre además el alta del kilometraje inicial (misma sección crítica). El orden de bloqueo es siempre `vehicles → vehicle_mileages → vehicle_audit_logs`, lo que elimina el riesgo de deadlock.

**Alternativas descartadas:**
- *`Serializable` + retry ante P2034*: correcto, pero aborta por write-conflicts ajenos al vehículo y obliga a un camino de retry cuyo fallo parcial en eventos exige cuidado adicional. Innecesario cuando el conflicto real es intra-vehículo.
- *`pg_advisory_xact_lock(hashtext(vehicleId))*: funciona, pero hashear un UUID para obtener exclusión introduce colisiones que serializan vehículos no relacionados y depende de SQL específico. El lock de fila es más legible y está sobre la tabla que ya existe.

**Trade-off:** una consulta raw. Se acepta: el lock de fila no tiene equivalente en Prisma y el índice de H-07 hace el `max()` barato.

**Nota:** el alta de vehículo 0 km crea el `Vehicle` y su primer `VehicleMileage` en la **misma transacción**; no compite por el lock porque la fila acaba de insertarse dentro de esa transacción.

---

## D-07 — Kilometraje inicial obligatorio para dealership

**Decisión:** en contexto `DEALERSHIP`, `POST /vehicles` exige `initialMileage: integer >= 0`. En `PERSONAL` el campo se rechaza (comportamiento actual preservado).

El `source` del registro inicial es `dealership`, con la atribución completa (D-01), y genera `VehicleAuditLog(action=mileage_recorded)` en la misma transacción.

**Razón:** un 0 km sin fila de kilometraje es indistinguible de un vehículo sin datos, que es exactamente la ambigüedad que D-144/D-157 buscan eliminar.

**Alternativas descartadas:**
- *Campo `isZeroKm` o `condition` en `Vehicle`*: inventaría un concepto nuevo y redundante; “nuevo” es derivable del primer registro de kilometraje hecho por una concesionaria. `AGENTS.md` §4: no inventar campos.
- *Kilometraje inicial opcional con default 0*: hides la captura de un dato que la concesionaria conoce siempre.

**Impacto:** **breaking change** en `POST /vehicles` para el frontend de dealership. El formulario de alta debe pedirlo.

---

## D-08 — Índice único parcial de ownership activo + remediación previa

**Problema:** H-14/H-15. Sin garantía de un único titular activo, la autorización puede apoyarse en una fila arbitraria, y el flujo de Gap 1 depende de que cerrar el ownership de la concesionaria tenga un efecto único y no ambiguo.

**Decisión:**

1. **Precondición:** antes de la migración, ejecutar una consulta de solo lectura que reporte vehículos con más de un ownership activo. La migración **no** se aplica si el reporte no está en cero.
2. **Remediación:** por cada vehículo afectado, conservar el ownership con el `starts_at` más reciente y cerrar los anteriores con `ends_at = starts_at` de ese último y `notes` explicativo. **No** se corrige automáticamente ni en silencio: requiere una decisión registrada por vehículo.
3. **Índice:** `CREATE UNIQUE INDEX vehicle_ownerships_one_active ON vehicle_ownerships (vehicle_id) WHERE ends_at IS NULL`. Mismo patrón ya usado para el índice de QRs (H-16).
4. **Determinismo en código:** las lecturas de ownership activo pasan a `findFirst({ where: { endsAt: null }, orderBy: { startsAt: 'desc' } })` en generación y aceptación de QR, para que el comportamiento no dependa del índice.

**Razón:** el invariante “un vehículo tiene un titular activo” pertenece a la base de datos; TypeScript no puede garantizarlo bajo concurrencia.

**Alternativas descartadas:**
- *Corregir duplicados automáticamente dentro de la migración*: destruiría información de propiedad histórica sin decisión registrada. Contrario a `AGENTS.md` §35.
- *Dejar el índice para más adelante*: Gap 1 multiplica los vehículos con ownership de dealership como titular activo, justo el caso donde el duplicate silencioso es más costoso.

**Impacto:** migración A, que bloquea el resto del gap.

---

## D-09 — Preview público: controller separado, sin escape hatch global de auth

**Problema:** H-01/H-02. El preview debe ser público, pero `JwtAuthGuard` está a nivel de clase y no admite opt-out.

**Decisión:** mover la ruta a un **controller público nuevo**, siguiendo el precedente ya establecido en `wizard.controller.ts`:

```
@Controller('vehicles/transfer/qr')
class VehicleTransferQrPublicController   // sin JwtAuthGuard de clase
  @Get(':token')  @Throttle({ default: { limit: 10, ttl: 60000 } })  @UseGuards(ThrottlerGuard)
```

La ruta pública y el límite vigente quedan **idénticos**; solo cambia dónde se declara. Se elimina el parámetro `@CurrentUser()` del método, que hoy no se usa.

**Razón:** una metadata global `@Public()` es un flag de fallo silencioso: un decorador mal puesto expone cualquier endpoint. El controller separado hace que la frontera sea explícita y no deja esa vía abierta para el resto de la API.

**Alternativas descartadas:**
- *`@Public()` + `JwtAuthGuard` que lo respeta*: menos código, pero introduce un modo de falla global a cambio de una ruta.
- *Quitar el guard de clase del controller y agregarlo método por método*: repartiría la responsabilidad de auth sobre ~15 endpoints, con alto riesgo de olvido.

**Sobre el side effect del preview (H-23):** se mantiene, y se acepta de forma explícita. Razones: el estado es terminal (`pending → expired`), ocurre **a lo sumo una vez** por QR, y la respuesta no expone PII del emisor más allá de lo ya público en el flujo. Se documenta como riesgo asumido (§11), no como defecto a corregir en este gap.

**Impacto:** el comentario engañoso de H-01 desaparece con el movimiento.

---

## D-10 — Rate limit de alta 10/hora por identidad

**Problema:** H-28. Todos los límites actuales son por IP. El requisito es **por identidad**.

**Decisión:** agregar un *throttler set* nombrado con `getTracker` propio, sin alterar el bucket `default` existente:

```
ThrottlerModule.forRoot([
  { ttl: envs.THROTTLE_TTL * 1000, limit: envs.THROTTLE_LIMIT },              // sin cambios
  { name: 'dealershipVehicleCreate', ttl: 3_600_000, limit: 10,
    getTracker: (req) => req.user?.id ?? req.ip },
])
```

En el endpoint: `@UseGuards(ThrottlerGuard)` + `@Throttle({ dealershipVehicleCreate: { limit: 10, ttl: 3_600_000 } })`.

**Requisito de orden explícito:** `JwtAuthGuard` (clase) debe ejecutarse **antes** que `ThrottlerGuard` (método) para que `req.user` exista. Si se invirtiera, el tracker caería silenciosamente a IP y el límite por identidad no se cumpliría sin ningún error visible.

**Razón:** `getTracker` por *throttler set* es la API oficial de `@nestjs/throttler@6.5.0` (H-42) y aísla el cambio a un bucket nuevo.

**Alternativas descartadas:**
- *Contador propio en base de datos*: durable pero agrega estado, escrituras y un esquema de limpieza por nada en el MVP.
- *Cambiar el tracker global a identidad*: alteraría el comportamiento de login, wizard y transfers, que hoy deben seguir protegiéndose por IP (anónimos no tienen identidad).

**Trade-off:** el almacenamiento por defecto de Throttler es **en memoria**: el contador se reinicia al reiniciar el proceso y no se comparte entre réplicas. Aceptable para el MVP y coherente con el resto del sistema; queda como deuda registrada (§12).

**Impacto:** también se cubre `POST /vehicles/:id/qr`, hoy sin throttling (H-26).

---

## D-11 — `GET /vehicles/:id` expone lecturas de kilometraje

**Problema:** H-03/H-33. El backend consulta las lecturas y las descarta; el frontend ya las renderiza y hoy muestra siempre vacío.

**Decisión:** `VehicleResponseDto` agrega:

- `mileages: VehicleMileageResponseDto[]` — hasta 5, ordenadas por `recordedAt` descendente (lo que ya calcula el handler).
- `mileageCount: number` — total de lecturas. Sigue el precedente de `VehicleAdminResponseDto.mileageCount`.
- `recordedBy` normalizado en cada lectura: `{ kind: 'user' | 'workshop' | 'dealership', id: string, displayName: string }`. No expone nombres de empleado de dealership (precedente D-107: el panel de concesionaria no expone PII de empleados); para `user` sí expone nombre, como ya hace el historial.

**Razón:** repara un contrato que el frontend ya consume. Agregar el conteo evita que el frontend infiera "no hay más" a partir del largo del arreglo.

**Alternativas descartadas:**
- *Devolver todas las lecturas*: sin paginación, y el detalle ya está definido como “últimos 5”.
- *Exponer las FKs crudas*: filtra la estructura interna de atribución (D-01).

**Impacto:** aditivo en el contrato. Corrige un defecto de UI existente.

---

## D-12 — Compatibilidad frontend: `capabilities` en el detalle

**Problema:** H-34/H-36/H-37. La UI deriva `canWrite` de `isOwner`, que es falso para un miembro de dealership, y manda `vin` en un `PATCH` que ahora lo rechaza.

**Decisión:**

1. `GET /vehicles/:id` agrega `capabilities: { canEdit: boolean; canRecordMileage: boolean; canCorrectVin: boolean }`, calculado por el backend con la misma lógica de autorización que aplica a las escrituras.
2. El frontend reemplaza `isOwner` por `capabilities` para habilitar el kilometraje, la edición y la corrección de VIN.
3. El formulario de edición deja de enviar `vin`.
4. El banner de consignación (H-37) solo se muestra a lectores que **no** son miembros de la concesionaria titular.
5. El login valida `next` contra una **allowlist** de rutas Deep-link (`/transfer/qr/<token>`), no con `startsWith("/")`.
6. Register preserva `next`.

**Razón:** la UI no puede derivar permisos de dealership a partir de `ownerships` sin replicar reglas de autorización. El backend ya sabe; es el que responde. Este cambio también elimina la clase de bug “la UI muestra un botón que el backend va a rechazar”.

**Alternativas descartadas:**
- *Permisos de sesión (`roles[].permissions`, H-39)*: no dicen nada sobre **este** vehículo ni sobre la relación del usuario con su dealership.
- *Exponer el `roleCode` del miembro y decidir en la UI*: filtra autorización al cliente.

**Impacto:** **breaking change** en `UpdateVehicleInput` y en la lógica de permisos de la UI. Requiere release coordinado.

---

# 3. Modelo de datos

> Especificación conceptual. **No** es una migración; los archivos de migración se crean en la fase de implementación.

## 3.1 Migración A — `vehicle_ownerships_one_active`

Precondición: remediación completa de D-08 (reporte en cero).

```sql
-- Orden obligatorio: (1) remediar, (2) crear índice, (3) recién entonces el código nuevo.
CREATE UNIQUE INDEX CONCURRENTLY vehicle_ownerships_one_active
  ON vehicle_ownerships (vehicle_id)
  WHERE ends_at IS NULL;
```

## 3.2 Migración B — `vehicle_mileages_dealership_attribution`

```sql
-- 1) Renombre explícito: el nombre actual promete un modelo que no referencia.
ALTER TABLE vehicle_mileages
  RENAME COLUMN recorded_by_member_id TO recorded_by_workshop_member_id;

-- 2) Contexto organizacional + miembro actuante (patrón VehicleTransferQr).
ALTER TABLE vehicle_mileages
  ADD COLUMN recorded_by_dealership_id uuid,
  ADD COLUMN recorded_by_dealership_member_id uuid;

ALTER TABLE vehicle_mileages
  ADD CONSTRAINT vehicle_mileages_actor_xor CHECK (
    num_nonnulls(recorded_by_workshop_member_id, recorded_by_dealership_member_id) <= 1
  );

ALTER TABLE vehicle_mileages
  ADD CONSTRAINT vehicle_mileages_dealership_attributed CHECK (
    recorded_by_dealership_id IS NULL OR recorded_by_dealership_member_id IS NOT NULL
  );

-- 3) `source = 'dealership'` exige contexto de dealership.
ALTER TABLE vehicle_mileages
  ADD CONSTRAINT vehicle_mileages_dealership_source_attributed CHECK (
    source <> 'dealership' OR recorded_by_dealership_id IS NOT NULL
  );

-- 4) Invariantes que hoy no existen y son baratas.
ALTER TABLE vehicle_mileages
  ADD CONSTRAINT vehicle_mileages_mileage_non_negative CHECK (mileage >= 0);
```

`num_nonnulls` es una función nativa de PostgreSQL.

## 3.3 Migración C — `vehicle_audit_logs`

```sql
CREATE TYPE vehicle_audit_action AS ENUM ('vin_corrected', 'mileage_recorded');

CREATE TABLE vehicle_audit_logs (
  id                 uuid PRIMARY KEY,
  vehicle_id         uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  action             vehicle_audit_action NOT NULL,
  field              text NOT NULL,
  previous_value     text,
  new_value          text,
  actor_user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  dealership_id      uuid REFERENCES dealerships (id) ON DELETE RESTRICT,
  dealership_member_id uuid REFERENCES dealership_members (id) ON DELETE RESTRICT,
  context_type       text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_audit_logs_vehicle_created_idx
  ON vehicle_audit_logs (vehicle_id, created_at DESC);
```

## 3.4 Orden de aplicación

| # | Migración | Bloquea a | Reversible |
|---|---|---|---|
| A | Ownership único | Flujo de transferencia (H-21/H-22) | No (el índice es una garantía; revertirlo la elimina) |
| B | Atribución de mileage | D-146, D-141 | Sí |
| C | Auditoría | D-144 | Sí (tabla nueva) |

B antes de C: el `CHECK` de auditoría de D-01 tiene sentido solo cuando la atribución ya existe.

---

# 4. Autorización y permisos

## 4.1 Permisos nuevos

| Código | `owner` | `admin` | `seller` |
|---|---|---|---|
| `dealership.vehicle.create` | ✅ | ✅ | ✅ |
| `dealership.vehicle.edit` | ✅ | ✅ | ✅ |
| `dealership.mileage.record` | ✅ | ✅ | ✅ |

Matriz idéntica para los tres, según lo cerrado. No se diferencia por rol de sistema ni por roles custom.

## 4.2 Registro obligatorio

1. `Permission` (3 filas).
2. `prisma/seed.ts`: asignación a los tres roles de dealership.
3. **Allowlist hardcoded** de `VehicleAccessService` (H-24): los tres códigos deben agregarse, o los holders de dealership perderán el acceso de lectura que ya tienen.

> `admin` no tiene `sell`/`return` hoy. **No se modifica** en este gap.

## 4.3 Aplicación

- **Alta y kilometraje:** el `VehiclesController` es un endpoint mixto (personal y dealership), así que **no** se le aplica `DealershipOnlyGuard` ni `@Permissions` a nivel de ruta; la decisión va al handler, que ya es donde vive la lógica de negocio.
- El handler **falla cerrado** por contexto: `PERSONAL` → camino actual; `DEALERSHIP` → exige membresía activa + permiso correspondiente; `WORKSHOP` / `PLATFORM` → `403`.
- Esto **no** cambia `ContextResolver`, que hoy resuelve a `PERSONAL` cuando falta el contexto (comportamiento de D-020). La falla cerrada la aplica el handler para las operaciones que requieren dealership, no el resolver global.
- Las escrituras sobre un vehículo 0 km con ownership activo de dealership se autorizan contra `ctx.dealershipId`; tras la transferencia, ese ownership se cierra y toda escritura devuelve `403` (control principal del gap).

---

# 5. API

## 5.1 Cambios de contrato

| Método | Ruta | Cambio | Breaking |
|---|---|---|---|
| `POST` | `/api/vehicles` | En `DEALERSHIP` crea ownership de dealership + kilometraje inicial obligatorio, en una transacción | Sí |
| `PATCH` | `/api/vehicles/:id` | `vin` pasa a rechazado con `400` explícito | **Sí** |
| `POST` | `/api/vehicles/:id/vin-correction` | Nuevo. Owner activo o admin. Auditado | No |
| `POST` | `/api/vehicles/:id/mileage` | `source` deja de aceptarse; auditoría y lock de fila | Sí |
| `GET` | `/api/vehicles/:id` | `+ mileages`, `+ mileageCount`, `+ capabilities` | No (aditivo) |
| `GET` | `/api/vehicles/transfer/qr/:token` | Sin cambios de ruta ni de límite; se mueve de controller | No |
| `POST` | `/api/vehicles/:id/qr` | Throttle por identidad | No |
| `GET` | `/api/dealerships/:id/vehicles` | Sin cambios: los 0 km aparecen por ownership activo | No |

## 5.2 DTOs

`RegisterVehicleDto`
- `vin?` con el validador compartido (D-04).
- `initialMileage?` — `required` y `>= 0` cuando el contexto es `DEALERSHIP`; rechazo explícito en `PERSONAL`.

`UpdateVehicleDto`
- Ya no extiende `PartialType(RegisterVehicleDto)`.
- `vin` declarado con `@IsEmpty()` → `400` explícito.
- Los campos de alta que no aplican a una edición no se exponen.

`RecordMileageDto`
- `source` **eliminado**.
- `mileage`: entero `>= 0`.
- `notes?`.

`CorrectVinDto` (nuevo)
- `vin` con el validador compartido.
- `reason`: texto requerido, para la auditoría.

`VehicleResponseDto` (nuevo campo)
- `mileages`, `mileageCount`, `capabilities`, `recordedBy` normalizado por lectura.

## 5.3 Errores

| Situación | Código |
|---|---|
| Kilometraje menor al máximo histórico | `409` |
| `vin` enviado en `PATCH` | `400` |
| `source` enviado en `POST /mileage` | `400` |
| `initialMileage` ausente en contexto `DEALERSHIP` | `400` |
| Contexto `WORKSHOP` / `PLATFORM` en alta o km | `403` |
| Sin permiso del contexto | `403` |
| Vehículo ya transferido (ownership de dealership cerrado) | `403` |
| `VIN` duplicado | `409` (mapeo P2002 ya existente, `prisma-vehicle.repository.ts:117`) |

---

# 6. Flujos

## 6.1 Alta de 0 km

```
POST /api/vehicles  (contexto DEALERSHIP, permiso dealership.vehicle.create)
  └─ RegisterVehicleHandler
       ├─ assert contexto DEALERSHIP + membresía activa + permiso        [403]
       ├─ validar vin (D-04) e initialMileage >= 0                      [400]
       ├─ transacción:
       │    ├─ insert vehicles                    (unique plate / vin / engine → 409)
       │    ├─ insert vehicle_ownerships  { type: company, dealershipId, startsAt, endsAt: null }
       │    ├─ insert vehicle_mileages     { source: dealership, mileage: initialMileage,
       │    │                                 recordedByUserId, recordedByDealershipId,
       │    │                                 recordedByDealershipMemberId }
       │    ├─ insert vehicle_audit_logs    { action: mileage_recorded }
       │    └─ commit
       └─ emit VehicleRegisteredEvent  (post-commit)
```

El evento se emite **después** del commit: `EventEmitter2` no participa de la transacción y un fallo del listener jamás debe revertir la escritura.

## 6.2 Registro de kilometraje

```
POST /api/vehicles/:id/mileage
  └─ RecordMileageHandler
       ├─ assert contexto ∈ {PERSONAL, DEALERSHIP}        [403]
       ├─ assert escritura sobre el vehículo (ownership de dealership en DEALERSHIP)
       ├─ transacción:
       │    ├─ SELECT id FROM vehicles WHERE id = $1 FOR UPDATE      ← lock de fila
       │    ├─ SELECT max(mileage)                                   [409 si menor]
       │    ├─ insert vehicle_mileages   { source derivado, atribución completa }
       │    ├─ insert vehicle_audit_logs { action: mileage_recorded }
       │    └─ commit
       └─ emit MileageRecordedEvent (post-commit)
```

## 6.3 Transferencia al comprador (sin cambios de lógica)

El flujo QR `purpose='sale'` ya soporta el vehículo nacido en dealership (H-21, H-22). No se modifica.

Lo que sí cambia es la **precondición**: el cierre del ownership de la dealership debe ser inequívoco, y eso lo garantiza la migración A (D-08).

## 6.4 Preview público

Ruta y límite idénticos (D-09). El controlador público no inyecta `CurrentUser`. Se mantiene el side effect de expiración, documentado como riesgo asumido.

---

# 7. Eventos

**No se crea ni se modifica ningún evento.**

| Evento | Consumidor actual | Efecto del gap |
|---|---|---|
| `VehicleRegisteredEvent` | **ninguno** (H-29) | Se emite igual; el ownership ahora puede ser de dealership. Sin impacto. |
| `MileageRecordedEvent` | **ninguno** (H-29) | Sin impacto. La auditoría **no** va por aquí (D-02). |
| `vehicle.transfer.accepted` | `transfer-accepted-email.listener.ts` | Sin cambios de payload. |
| `vehicle.transfer.qr_expired` | `transfer-qr-expired-email.listener.ts` | Ahora disparable desde un GET anónimo (H-23), a lo sumo una vez. Riesgo asumido. |

`EventEmitter2` sigue siendo in-process: sin retry, sin durability, sin outbox. La auditoría no depende de él, precisamente por eso.

---

# 8. Frontend

| Archivo | Cambio |
|---|---|
| `vehicles/new/*` | Pedir `initialMileage` cuando el contexto activo es `DEALERSHIP`; mostrar solo ese campo. Validar VIN con el espejo de D-04. |
| `vehicles/[id]/edit/*` | Dejar de enviar `vin`; mostrar el campo como solo lectura con un enlace a la corrección auditada. |
| `vehicles/[id]/page.tsx` | Usar `capabilities` en vez de `isOwner`; `recordMileage` sin `source`; banner de consignación solo para no-miembros. |
| `transfer/qr/[token]/page.tsx` | Dejar de redirigir anónimos antes del preview. |
| `(auth)/login` | `next` contra allowlist de rutas deep-link, no `startsWith("/")`. |
| `(auth)/register` | Preservar `next`. |
| `src/types/vehicle.ts` | Actualizar `UpdateVehicleInput` (sin `vin`) y `VehicleMileage` (con `recordedBy`). |

**Nota:** la tarjeta de kilometraje del detalle ya distingue “sin registros” de “0 km” (H-33). Con D-11 empieza a mostrar datos sin cambios de frontend.

---

# 9. Testing

## 9.1 Backend (`*.spec.ts` colocalados, Jest)

| Archivo | Casos nuevos |
|---|---|
| `register-vehicle.handler.spec.ts` | Rama `DEALERSHIP`; `initialMileage` ausente → 400; `source` derivado `dealership`; atribución completa; ownership `company`; auditoría escrita en la misma tx; rollback si falla la auditoría; contexto `WORKSHOP`/`PLATFORM` → 403; límite por identidad. |
| `record-mileage.handler.spec.ts` | `source` del cliente rechazado; `DEALERSHIP` exige membresía y permiso; km < máximo → 409; **dos escrituras concurrentes** → solo una pasa; auditoría presente; lock de fila adquirido antes del `max()`. |
| `update-vehicle.handler.spec.ts` | `vin` en payload → 400; regresión del test de D-043 reorientado. |
| `vin-correction.handler.spec.ts` *(nuevo)* | Solo owner/admin; `vin` inválido → 400; auditoría con `previousValue`/`newValue`/`reason`; `vin` duplicado → 409. |
| `vehicle-response.dto.spec.ts` | `mileages` presentes; `mileageCount`; `recordedBy` normalizado por cada `kind`; `capabilities` correctas. |
| `vehicle-transfer-qr-public.controller.spec.ts` *(nuevo)* | Guards de clase del controller público **no** incluyen `JwtAuthGuard`; el método conserva `ThrottlerGuard` y el límite 10/60s. Patrón ya usado en `wizard.controller.spec.ts`. |
| `vin.spec.ts` *(nuevo)* | Vectores: válidos (17, check digit correcto), inválidos (16, 18, `I`/`O`/`Q`, check digit incorrecto), normalización trim + upper. **Mismos vectores que el test del frontend.** |

## 9.2 Frontend (Vitest — la suite existe y es activa, H-38)

| Archivo | Casos nuevos |
|---|---|
| `__test__/vin.test.ts` *(nuevo)* | Mismos vectores que el backend. Es el mecanismo de detección de deriva de D-04. |
| `vehicles/new/__test__/vehicle-register-form.test.tsx` | Pide `initialMileage` en `DEALERSHIP`; no lo pide en `PERSONAL`; error 400 de `initialMileage`. |
| `vehicles/[id]/edit/__test__/vehicle-edit-form.test.tsx` | El payload **no** incluye `vin`. |
| `vehicles/[id]/__test__/vehicle-detail-page.test.tsx` | `capabilities.canRecordMileage` habilita el formulario; `canRecordMileage=false` lo oculta; el payload no manda `source`; renderiza 0 km como registro. |
| `transfer/qr/[token]/__test__/qr-accept-page.test.tsx` | Anónimo ve el preview. |
| `(auth)/login/__test__/login-page.test.tsx` | `next` fuera de la allowlist se descarta. |

## 9.3 Base de datos (verificación manual, no automatizada)

- Índice A creado y **dos inserts concurrentes** de ownership activo → el segundo falla.
- CHECK de mileage: `source='dealership'` sin `recorded_by_dealership_id` → rechazado.
- CHECK de mileage: ambos `*_member_id` presentes → rechazado.
- CHECK de mileage: `mileage < 0` → rechazado.
- Rollback de la transacción B cuando falla el insert de auditoría → no queda ni vehículo ni ownership ni kilometraje.

---

# 10. Secuencia de implementación

```
1. Migración A  ── remediación D-08 + índice único parcial        (bloqueante)
2. Migración B  ── atribución de mileage (D-01)
3. Migración C  ── vehicle_audit_logs (D-02)
4. Seed         ── 3 permisos + asignación a owner/admin/seller
5. Authorization ── allowlist de lectura en VehicleAccessService
6. Validador VIN ── backend + fixture; espejo y fixture en frontend
7. Handler: registro de km ── lock de fila, source derivado, auditoría
8. Handler: alta de vehículo ── rama DEALERSHIP + kilometraje inicial
9. Handler: corrección de VIN + rechazo de vin en PATCH
10. Queries: GET /:id ── mileages, mileageCount, capabilities, recordedBy
11. Controller: mover preview a controller público (D-09)
12. Throttler: bucket por identidad (D-10)
13. Frontend: forms, detalle, QR, auth redirect
```

Los pasos 7-10 no requieren migración. Los pasos 1-3 sí, y deben ir antes de exponer los endpoints.

---

# 11. Riesgos

| # | Riesgo | Severidad | Mitigación / Estado |
|---|---|---|---|
| R-01 | El índice A falla si hay ownerships duplicados no remediados | **Alta** | Precondición explícita: reporte en cero antes de aplicar. |
| R-02 | Cambio de contrato en `PATCH /:id` rompe clientes que envían `vin` | **Alta** | Release coordinado backend + frontend (D-12). |
| R-03 | Cambio de contrato en `POST /:id/mileage` rompe clientes que envían `source` | **Alta** | Release coordinado; el frontend deja de mandarlo. |
| R-04 | El límite por identidad cae silenciosamente a IP si `ThrottlerGuard` corre antes de `JwtAuthGuard` | Media | Requisito de orden explícito (D-10) + test de guardas. |
| R-05 | El preview público puede disparar un email mediante un GET anónimo | Media | Aceptado: terminal, una vez, sin PII adicional (§11 nota). |
| R-06 | El contador de throttling es en memoria: se reinicia al reiniciar el proceso | Baja | Consistente con el resto del sistema. Deuda registrada (§12). |
| R-07 | El espejo del validador de VIN puede divergir | Media | Vectores de prueba idénticos en ambos repos. |
| R-08 | Auditar exige dos escrituras por registro de km | Baja | Índice `@@index([vehicleId, mileage])` ya cubre el `max()`; H-07. |
| R-09 | El banner de consignación muestra copy incorrecto a miembros de la dealership en vehículos 0 km | Media | Corregido en D-12. |
| R-10 | Soft delete de un vehículo 0 km con ownership y kilometraje | **Desconocido** | **No verificado.** No se afirma resultado (§1.3, §12). |

---

# 12. Deuda técnica registrada

| # | Deuda | Origen |
|---|---|---|
| T-01 | Efecto runtime del soft delete sobre ownerships y kilometrajes: **no verificado** | H-14 + handler sin comprobaciones; requiere prueba en QA |
| T-02 | Sin suite E2E versionada en el backend | Fuera de alcance explícito |
| T-03 | Sin lista de WMI validada | D-04; requiere decisión de producto si se quiere |
| T-04 | `VehicleAccessService` mantiene una allowlist hardcoded de permisos | H-24; deuda estructural preexistente, agravada por este gap |
| T-05 | Throttling en memoria, por proceso | H-28 / R-06 |
| T-06 | Sin trigger de inmutabilidad sobre `vehicle_audit_logs` | D-02; append-only por convención |
| T-07 | `recorded_by_dealership_member_id` no participa de ninguna lectura de confianza del vehículo | Consecuencia esperada de D-146 |

---

# 13. Decisiones que este documento cierra

Las preguntas abiertas que estaban planteadas quedan resueltas así:

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se atribuye el kilometraje a una dealership, dada la FK a `WorkshopMember`? | D-01 — replicar el patrón de `VehicleTransferQr`. |
| ¿La auditoría es un listener de eventos? | D-02 — no; se escribe en la misma transacción. |
| ¿Cómo se rechaza `vin` en `PATCH` sin que se descarte en silencio? | D-03 — declararlo con `@IsEmpty()`. |
| ¿Paquete compartido o espejo con tests? | D-04 — espejo + vectores de prueba idénticos. |
| ¿Cómo se garantiza la monotonía bajo concurrencia? | D-06 — lock de fila sobre `vehicles`. |
| ¿Se agrega un campo “0 km”? | D-07 — no; es derivable del primer registro. |
| ¿Cómo se garantiza un único titular activo? | D-08 — índice parcial único + remediación previa. |
| ¿Cómo se vuelve público el preview? | D-09 — controller separado, sin `@Public()` global. |
| ¿Cómo se rate-limita por identidad? | D-10 — *throttler set* nombrado con `getTracker`. |
| ¿Cómo se expone la atribución sin filtrar el modelo? | D-11 — `recordedBy` normalizado. |
| ¿Cómo sabe la UI qué puede hacer? | D-12 — `capabilities` en el detalle. |

**Único punto que requiere intervención del PM** y que **no bloquea** la implementación: si el producto quiere validar el WMI contra un catálogo propio (D-04, T-03). Con el default técnico propuesto, el sistema es funcional sin esa decisión.

---

**Revisión requerida:** PM (alcance), Tech Lead (D-01, D-02, D-06, D-09), Database (migración A y su remediación), Security (D-01, D-09, D-10, D-12), QA (R-01, R-10, T-01).