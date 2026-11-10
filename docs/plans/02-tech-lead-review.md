# 02 — Revisión técnica del Tech Lead

**Proyecto:** HCDV — MVP "taller primero" (check-in + reclamo de historial)
**Fecha:** 2026-11-01
**Autor:** Tech Lead backend
**Estado:** vinculante para el arranque de B-1 / B-2 / B-3. C-1 **no** se delega hasta aplicar la corrección 3; C-2 y C-3 **no** se delegan hasta aplicar las correcciones 9 y 10.
**Alcance:** veredicto sobre `D-TL-B1..B5` y `D-TL-C1`; validación de 8 supuestos técnicos contra el código real; correcciones obligatorias al plan; riesgos no cubiertos; orden de arranque.
**Fuera de alcance:** reabrir decisiones de producto (`D-158..D-192`, `P-2`) y escribir código, schema o migraciones.

**Documentos bajo revisión**

- `docs/plans/02-backend-implementation.md` (plan de implementación)
- `docs/plans/04-implementation-plan.md` (plan consolidado)
- `docs/specs/workshop-checkin-flow.md`
- `docs/designs/vehicle-claim-technical-design.md`
- Código: `prisma/schema.prisma`, `src/modules/care-episodes/**`, `src/common/authorization/vehicle-access.service.ts`, `src/modules/vehicles/**`, `src/app.module.ts`, migraciones.

---

## 1. Veredicto global

**B-1 puede arrancar hoy. Sí.**

No hay ninguna decisión de producto pendiente que lo bloquee y el modelo de `§3.1` del plan es correcto en lo esencial. Arranca condicionado a dos ajustes de alcance que no cambian el diseño: agregar la columna `closeNotes` (corrección 1) y corregir el conteo del mapa de migración (corrección 2). Aparte, la convención lowercase del enum de reclamos (corrección 3) hay que fijarla antes de C-1 para que nadie copie el bloque del diseño.

| Fase | ¿Puede arrancar? | Condición |
|---|---|---|
| **B-1** (migración A + seed) | **Sí, hoy** | Correcciones 1 y 2. |
| **B-2** (check-in + pata UNION) | Sí, después de B-1 aplicada | Necesita columnas nuevas y cliente Prisma regenerado. Aplicar correcciones 7, 8 y 4. |
| **B-3** (cierre + evento) | Sí, después de B-2 | Corrección 5 (select de historial) y `closeNotes` persistido. |
| **C-1** (migración B) | Sí en preparación, **no** en `migrate dev` | Corrección 3 (enum e índice en lowercase). Debe aplicarse después de A: ambas migraciones agregan relaciones a `Vehicle` y `CareEpisode`. |
| **C-2** (API pública) | **No todavía** | Corregir `§7.3.6` (transacción interactiva) y cerrar el secret del ticket (correcciones 9 y 10). |
| **C-3** (API taller) | **No todavía** | Corregir `§8.3` paso 1 (reusar `assertVehicleAccess`) y `§8.4`. |
| **C-5** (hook de cierre) | Bloqueado | Depende de B-3 y C-3. |
| **C-4, C-6, C-7** | No bloquean el piloto | C-4 depende de `P-2` (copy). |

**Contradicciones de producto detectadas (se reportan, no se resuelven):**

1. `docs/specs/workshop-checkin-flow.md:505` (B-1) y `:521` (fase B) siguen pidiendo "abrir la rama WORKSHOP" de `RegisterVehicleHandler`. Eso contradice `D-TL-B2` y el propio spec `:16`, que documenta el 403 como el bloqueador. El plan ya resolvió por la opción correcta; el spec queda desactualizado.
2. `docs/specs/workshop-checkin-flow.md:507` (B-3) pide habilitar lectura WORKSHOP del historial vía el check *strict* de `vehicles.controller.ts:145-155`. Es una decisión de producto (`AC 10/25/26/35`) que no está en el alcance de B-1/B-2/B-3 de este plan. Se reporta para que no se confunda con G-05.

Ninguna de las dos bloquea B-1.

---

## 2. Decisiones

| ID | Veredicto | Justificación | Impacto en el plan |
|---|---|---|---|
| **D-TL-B1** | **CONFIRMO** | `POST /api/care-episodes` exige `vehicleId` + `branchId`; cambiar el DTO rompe el panel. `@Post()` raíz (`care-episodes.controller.ts:84`) no captura `check-in` y `@Post(':id/verify')` (`:214`) tiene dos segmentos: no hay colisión. | `02-backend-implementation.md:218-220` queda como está. |
| **D-TL-B2** | **CONFIRMO** | `RegisterVehicleHandler` rechaza WORKSHOP con 403 fail-closed (`register-vehicle.handler.ts:54-58`) y hereda reglas de concesionaria. Crear el `Vehicle` dentro del comando de check-in es la opción de menor superficie. | `02-backend-implementation.md:282`; **enmendar** `workshop-checkin-flow.md:505` y `:521`. |
| **D-TL-B3** | **CONFIRMO** | `vehicle-catalog` sólo expone `vehicle-brands/models/versions` con JWT y sin contexto de taller (`vehicle-catalog.controller.ts:22-53`). El catálogo de tipos es del dominio `care-episodes` y necesita el contexto WORKSHOP para filtrar por especialidad. | `02-backend-implementation.md:317-325`; ruta estática antes de `@Get(':id')` (`:233`). |
| **D-TL-B4** | **CONFIRMO CON CAMBIO** | `closeNotes` es la opción correcta (no crear flag `odometerReplaced`), pero **la columna no existe** en `schema.prisma:963-1005` y B-1 no la agrega: el plan la usa en `:352` y `:383` sin definirla. | Agregar `closeNotes String? @map("close_notes") @db.VarChar(1000)` en `§3.1 b` y en la migración; persistirla en `§5.2` paso 5. |
| **D-TL-B5** | **CONFIRMO** | Auditoría del cierre: `WorkshopMember` ya es el actor de `createdByMemberId` (`schema:969`) y `verifiedByMemberId` (`:985`). `onDelete: Restrict` es coherente con esas dos. | `02-backend-implementation.md:72-73` ya lo incluye; no requiere cambio. |
| **D-TL-C1** | **CONFIRMO 5/300s** | El diseño ya dice 5/300s para `challenge`, `verify` y `commit` (`vehicle-claim-technical-design.md:470-472`) y AC-14 lo repite (`:606`). El "10/min" sólo aplica al **bootstrap** `GET /public/:token` (`:469`). No hay que corregir el documento: el plan ya está alineado. | `02-backend-implementation.md:490-493` y `:513-519`; ver corrección 10. |

### 2.1 Sustento de D-TL-B1

`CareEpisodesController` declara `@Post()` en `:84` con `WorkshopOnlyGuard, PermissionsGuard` y `@Permissions('care-episode.create')` en `:85-86`. Un `POST /care-episodes/check-in` no matchea `@Post()` (raíz) ni `@Post(':id/verify')` (`:214`), que exige dos segmentos. El comentario `:176-177` ya documenta el patrón F-012 de declarar rutas estáticas antes de `@Get(':id')`.

### 2.2 Sustento de D-TL-B2

`register-vehicle.handler.ts:54-58` lanza `ForbiddenException` para `ctx.type === 'WORKSHOP' || 'PLATFORM'`. Abrir esa rama obliga a decidir ownership, `initialMileage` y reglas de concesionaria dentro de un handler que hoy es de alta personal. El costo de duplicar el `create` en el check-in es menor y no amplía `/vehicles/*`. El 403 documentado en `workshop-checkin-flow.md:16` es el mismo que cita el spec como bloqueador: no hay contradicción de producto, sólo texto viejo en `:505`/`:521`.

### 2.3 Sustento de D-TL-B3

`vehicle-catalog.controller.ts:22-53` expone marcas/modelos/versiones con `JwtAuthGuard` y sin `WorkshopOnlyGuard`. Los tipos de atención dependen de `ServiceTypeSpecialty` (`schema` nuevo) y el panel los necesita ya filtrados por el taller activo; colgarlos de `vehicle-catalog` mezcla catálogo global con configuración de taller. `GET /care-episodes/service-types` con `WorkshopOnlyGuard` es el límite correcto.

### 2.4 Sustento de D-TL-B4

El plan dice en `:383` que la excepción "tablero reemplazado" se persiste en `closeNotes`, y en `:385` recomienda no agregar `odometerReplaced`. Correcto. El problema es que `§3.1 b` (`:64-77`) no declara `closeNotes`, la migración no la crea y `§5.2` paso 5 (`:369`) no la escribe en el `update`. Sin la columna, el cierre pierde el motivo y el AC de auditoría no se cumple.

### 2.5 Sustento de D-TL-B5

`CareEpisode` ya tiene `createdByMemberId` (`schema:969`) y `verifiedByMemberId` (`:985`) con `onDelete: Restrict` (`:990`, `:993`). `closedByMemberId` sigue el mismo patrón y permite responder "quién cerró" sin depender del evento (los eventos son in-process, `@nestjs/event-emitter`, no durables). No bloquea.

### 2.6 Sustento de D-TL-C1

`vehicle-claim-technical-design.md:470` fija `vehicleClaimToken: 5/300s` para `challenge`; `:471-472` lo repiten para `verify` y `commit`; `:606` (AC-14) dice "5/5 min para challenge, verify y commit". El "10 GET/min" de AC-14 corresponde al bootstrap (`:469`). El plan `:495` afirma que "el documento no fue actualizado", pero el documento sí está en 5/300s: la afirmación es incorrecta y hay que corregirla para no introducir un cambio de número sin respaldo. **No** se cambia el throttle.

---

## 3. Validación de los 8 puntos

### 3.1 `CareEpisodeServiceType` y `@map`

**Estado: correcto.**

Ningún modelo del schema usa `@map` camelCase en columnas; el patrón es snake_case (`CareEpisode`: `vehicle_id`, `workshop_id`, `mileage_in`, `closed_at` en `schema:965-976`). El plan (`:142`) usa `@map("service_type_id")` y corrige explícitamente el borrador del spec en `:151`. La tabla es nueva, no hay datos que migrar ni contrato previo que romper.

**Consecuencia:** sin cambios.

### 3.2 Índice parcial del invite activo y casing del enum

**Estado: el plan está mal escrito; el diseño es internamente contradictorio.**

- El schema declara los enums en lowercase y **no** usa `@map` por valor: `CareEpisodeStatus { open delivered cancelled }` (`schema:1354-1358`) y la migración crea `CREATE TYPE "CareEpisodeStatus" AS ENUM ('open','delivered','cancelled')`.
- El plan escribe el índice con mayúsculas: `WHERE status IN ('PENDING','VERIFICATION_REQUIRED','VERIFIED','MANUAL_REVIEW')` (`02-backend-implementation.md:421`).
- El diseño dice en prosa que "todos los enums del repo son lowercase" (`vehicle-claim-technical-design.md:125`) y en el bloque siguiente declara `PENDING`, `VERIFIED`, `CLAIMED` en mayúsculas (`:128-133`); el SQL de `:179` también va en mayúsculas.

**Consecuencia:** si se copia el plan, el `CREATE UNIQUE INDEX` falla al castear los literales al tipo enum (Postgres rechaza el valor inexistente al crear el índice). El índice debe ser:

```sql
CREATE UNIQUE INDEX vehicle_claim_invites_active_unique
  ON vehicle_claim_invites (vehicle_id)
  WHERE status IN ('pending','verification_required','verified','manual_review');
```

Y el enum, en lowercase: `pending verification_required verified manual_review claimed claim_blocked expired revoked`.

### 3.3 `vehicle_ownerships_owner_xor` y el commit

**Estado: el plan diagnostica mal el riesgo; la constraint real es otra.**

- La constraint existe con ese nombre exacto: `ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_owner_xor" CHECK (...)` (`prisma/migrations/20260918000002_add_organizational_owner/migration.sql:73-75`), con `("user_id" IS NOT NULL) <> ("dealership_id" IS NOT NULL)`. El commit crea `{ userId, dealershipId: null, type: 'owner' }` → pasa sin tocar nada.
- La constraint que sí puede fallar es el índice parcial de D-155: `CREATE UNIQUE INDEX "vehicle_ownerships_one_active_primary" ... WHERE "ends_at" IS NULL AND "type" <> 'co_owner'` (`prisma/migrations/20261007140000_vehicle_ownerships_unique_active_primary/migration.sql:30`). Si el vehículo ya tiene titular activo, el `insert` da `P2002` → el resultado correcto es `claim_blocked`, **no** cerrar el ownership anterior.
- Cerrar el ownership anterior en el commit contradice el diseño: T9 produce `claim_blocked` sin cambios de ownership, AC-11 lo exige y AC-24 muestra "Este vehículo ya tiene titular". El cierre de ownership ocurre sólo en el **revoke** de un `claimed`, y sólo si `acquiredByClaimInviteId` apunta al invite revocado (AC-17, `02-backend-implementation.md:584`).

**Consecuencia:** el riesgo **R-5** de `04-implementation-plan.md:193` está mal redactado y hay que reemplazarlo (corrección 6).

### 3.4 Pata `care_episodes` en `assertWorkshopVehicleAccess`

**Estado: correcto agregarla, con un filtro de estado.**

El UNION actual (`vehicle-access.service.ts:501-513`) tiene cuatro patas; dos filtran `status <> 'cancelled'` (`appointments` `:503`, `work_orders` `:505`) y dos no (`estimates` `:507`, `service_records` `:509`). La pata nueva debe seguir el criterio de "acto vigente": `delivered` asocia (el taller atendió), `cancelled` no.

```sql
UNION
SELECT workshop_id FROM care_episodes
 WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'
```

`care_episodes.workshop_id` es nullable (`schema:966`), así que las atenciones de origen `owner` quedan excluidas naturalmente. No hay que filtrar `deletedAt`: ninguna pata lo hace y `assertVehicleAccess` sólo verifica existencia (`vehicle-access.service.ts:58-62`). Agregar el filtro acá y no en las otras patas mantiene la consistencia y no abre un hueco cross-workshop porque la consulta ya está scoped por `workshop_id`.

**Consecuencia:** corregir `02-backend-implementation.md:292` (corrección 7).

### 3.5 Orden de guards y precedencia de rutas

**Estado: correcto; una ruta tiene restricción de orden.**

- Clase: `@UseGuards(JwtAuthGuard, ContextGuard)` (`care-episodes.controller.ts:66`).
- Método: `WorkshopOnlyGuard` **antes** de `PermissionsGuard` (`:85`, `:159`, `:186`, `:215`, `:258`), que es lo que exige el patrón anti-bypass: `super_admin` no puede saltear el contexto.
- `GET service-types` es una ruta estática de un segmento: debe declararse **antes** de `@Get(':id')` (`:233`), junto a `lookup` (`:109`) y `verifications` (`:158`).
- `POST check-in` no colisiona con `@Post()` (`:84`) ni con `@Post(':id/verify')` (`:214`).

**Consecuencia:** el plan lo dice en `:664`, pero el mapa no fija la posición exacta. Dejar explícito "después de `verifications` y antes de `@Get()`/`@Get(':id')`".

### 3.6 Secret del ticket de reclamo

**Estado: hay que fijarlo; el plan lo deja como opción.**

`JwtStrategy` valida con `secretOrKey: envs.JWT_SECRET` (`jwt.strategy.ts:34`) y exige `payload.sub` (`:50-57`). Un ticket firmado con `JWT_SECRET` plano comparte audiencia con los access tokens: cualquier cambio futuro en la estrategia (p. ej. dejar de exigir `sub`) convierte un ticket en una credencial válida. `JWT_REFRESH_SECRET` queda descartado por el propio plan (`:503`).

**Decisión:** secret derivado `envs.JWT_SECRET + ':claim-ticket'`, `sign(payload, { secret, expiresIn: 1200, algorithm: 'HS256' })`, payload `{ inviteId, vehicleId, purpose: 'claim' }`, y `verify` con el mismo secret + chequeo de `purpose`. No se agrega variable de entorno nueva: el secret deriva del existente y no requiere rotación separada en el piloto.

**Consecuencia:** reemplazar el "o" de `02-backend-implementation.md:503` por la decisión (corrección 10).

### 3.7 `$transaction` del commit e `isolationLevel`

**Estado: la forma actual del plan es insuficiente.**

`$transaction([updateMany, ownershipCreate])` (array) no permite ramificar sobre el resultado: si `count === 0` hay que devolver 409 sin ejecutar el `create`, y si el vehículo ya tiene titular hay que devolver `claim_blocked` sin crear ownership. El repo ya usa la forma interactiva en 25 handlers; precedentes directos: `wizard-claim.handler.ts:187`, `attach-care-episode-attachments.handler.ts:101`.

**Decisión:**

```ts
await this.prisma.$transaction(async (tx) => {
  const updated = await tx.vehicleClaimInvite.updateMany({
    where: { id: inviteId, status: 'verified' },
    data: { status: 'claimed', usedAt: now, claimOutcome: 'ownership_created' },
  });
  if (updated.count === 0) throw new ConflictException(...); // single-use
  try {
    await tx.vehicleOwnership.create({ ... });
  } catch (e) {
    if (isP2002(e)) throw new ConflictException({ reason: 'claim_blocked' });
    throw e;
  }
});
```

No usar `isolationLevel`: no hay ningún uso en el repo y `READ COMMITTED` + `updateMany` con `where status='verified'` ya toma el row lock necesario. `FOR UPDATE` explícito tiene precedente (`attach-care-episode-attachments.handler.ts:114`) pero acá es redundante con el `updateMany` guardado. El `P2002` del índice de ownership se traduce a `claim_blocked` **después** del rollback; el segundo intento no debe reintentar el create.

**Consecuencia:** corregir `02-backend-implementation.md:504` (corrección 9).

### 3.8 Dependencia `qrcode`

**Estado: falta.**

`package.json` no tiene ninguna librería de QR; sólo `sharp ^0.35.3` (`:67`), que sirve para redimensionar, no para generar QR. No hay generación de QR en `src/`. `qrcode` es la opción correcta para PNG server-side en CommonJS (`toBuffer`), sin binarios nativos. Agregar `qrcode` a `dependencies` y `@types/qrcode` a `devDependencies`. No hay conflicto con `sharp`.

**Consecuencia:** `02-backend-implementation.md:659` ya lo lista en C-1; el plan lo marca "si aplica" en el `@types`. Confirmar ambos.

---

## 4. Correcciones obligatorias al plan

Se aplican en los documentos antes de delegar. Ninguna cambia el diseño ni reabre producto.

**1. Agregar `closeNotes` a B-1 y persistirla en B-3.**
En `02-backend-implementation.md:64-77` agregar `closeNotes String? @map("close_notes") @db.VarChar(1000)` y en la migración `ADD COLUMN close_notes VARCHAR(1000)`. En `:369` incluir `closeNotes` en el `update` del cierre. En el DTO (`:352`) agregar `@MaxLength(1000)`.

**2. Corregir el conteo del mapa de migración y el `.env.example`.**
`02-backend-implementation.md:656` dice "5 tablas + 6 columnas"; `§3.1` define **4 tablas** (`vehicle_owner_contacts`, `service_types`, `service_type_specialties`, `care_episode_service_types`), **8 columnas** (2 en `vehicles`, 6 en `care_episodes`, 9 con `closeNotes`) y **1 enum** (`VehicleContactStatus`). Corregir el número para que la verificación de `§3.4` sea contrastable. Agregar `DEFAULT_PHONE_COUNTRY_CODE` a `.env.example` junto al resto de las variables.

**3. Bajar el enum de reclamos a lowercase en plan y diseño.**
`02-backend-implementation.md:421` → `('pending','verification_required','verified','manual_review')`. `vehicle-claim-technical-design.md:128-133` y `:179` → mismos valores en lowercase. Agregar a `§6.5` una verificación explícita: `SELECT indexdef FROM pg_indexes WHERE indexname = 'vehicle_claim_invites_active_unique';` y confirmar que los literales matchean `pg_enum`.

**4. Completar el mapa de archivos con los tres consumidores del fallback.**
`§12` (`:651-671`) crea `src/common/vehicles/vehicle-display-name.ts` pero no lista a quién se lo conecta. Agregar filas para `lookup-vehicle.handler.ts:52-53`, `get-care-episode.handler.ts:156-157` y `get-vehicle-history.handler.ts` (marca/modelo si el timeline los muestra). Sin esto, el AC de "el panel muestra marca/modelo aunque el vehículo no tenga versión de catálogo" queda a medias.

**5. Extender el `select` del historial.**
`get-vehicle-history.handler.ts:78-94` no selecciona `mileageOut`, `closedAt` ni `serviceTypes`. El spec `§6.3` (`workshop-checkin-flow.md:246-248`) pide que el timeline muestre el egreso y los tipos de atención. Agregar esos campos y el `serviceTypes: { select: { serviceTypeId, customLabel, serviceType: { select: { name: true } } } }` (o el shape que consuma el frontend, acordado en el contrato).

**6. Reescribir R-5 y R-3 en el plan consolidado.**
`04-implementation-plan.md:193` (R-5) debe decir: "el commit puede dar `P2002` por `vehicle_ownerships_one_active_primary`; se traduce a `claim_blocked` (T9), no se cierra ningún ownership". `:191` (R-3) debe decir: "el índice parcial se escribe en lowercase porque el enum se declara lowercase; verificar `pg_enum`". El riesgo de "cerrar ownership anterior" pertenece a C-3/revoke, no al commit.

**7. Fijar el filtro de estado de la pata `care_episodes`.**
`02-backend-implementation.md:292` → agregar `AND status <> 'cancelled'`, coherente con `appointments`/`work_orders` (`vehicle-access.service.ts:503-505`). Mantener `delivered` como asociación válida.

**8. Cerrar el comportamiento del check-in en concurrencia y con vehículo soft-deleted.**
En `§4.2` (`:260-280`):
- `findUnique({ licensePlate })` puede devolver un vehículo con `deletedAt` no nulo (`schema:706`). Definir: **no** resucitarlo silenciosamente; devolver 409 con mensaje explícito ("El vehículo está dado de baja; contactá a soporte") y test. No crear otro: `licensePlate` es `@unique` (`schema:697`) y daría `P2002`.
- Dos check-ins concurrentes con la misma placa nueva: ambos `findUnique` devuelven `null`, ambos crean, uno falla por `license_plate` único. Capturar `P2002` sobre `license_plate`, re-leer el vehículo y continuar con la creación del episodio (o devolver 409 "reintentá", pero definirlo). Sin esto, el doble submit del mostrador devuelve 500.
- Validar que los `serviceTypeIds` existen y están activos antes del `createMany`; si no, el FK revienta como 500. `customLabel` debe rechazar vacío/espacios (el CHECK `(service_type_id IS NULL) <> (custom_label IS NULL)` lo acepta).
- En `ownerContact` (`:276-277`) el orden es obligatorio: primero `isActive=false` del contacto previo y después el `create`, porque `vehicle_owner_contacts_active_unique` es un índice inmediato (no deferrable). Documentarlo para que nadie invierta las líneas.

**9. Reemplazar la transacción del commit por la forma interactiva.**
`02-backend-implementation.md:504` → usar el bloque de `§3.7` de este documento. Eliminar la referencia a `$transaction([...])` en array y la mención a `isolationLevel` si aparece en C-2.

**10. Fijar el secret del ticket y la verificación de throttle por ruta.**
`02-backend-implementation.md:503` → reemplazar "(o un secret derivado...)" por la decisión: `JWT_SECRET + ':claim-ticket'`, `HS256`, `expiresIn: 1200`, `purpose: 'claim'`, verificación con el mismo secret. En `§7.4` (`:508-521`) agregar la nota operativa: el bucket de módulo es 5/300s y **las cuatro rutas necesitan `@Throttle` explícito**; sin el override, el bootstrap (`GET /public/:token`) hereda 5/300s y rompe el diseño `:469` (10/60s). El guard resuelve la key por `class + handler + bucket` (`node_modules/@nestjs/throttler/dist/throttler.guard.js:148-151`) y hace fallback al bucket nombrado cuando la ruta sólo declara otro (`:82-86`): no hay cuota compartida entre challenge/verify/commit, sólo límites iguales.

**11. Enmendar el spec (no bloquea B-1).**
`workshop-checkin-flow.md:505` y `:521` deben decir "crear el vehículo dentro del comando de check-in (D-TL-B2)" y no "abrir la rama WORKSHOP". `:507` (B-3) debe separarse de G-05: la lectura WORKSHOP del historial por check *strict* es otro alcance. Dueño: producto/TL, en el mismo commit de docs que esta revisión.

**12. Corregir la afirmación sobre el throttle en el plan.**
`02-backend-implementation.md:495` dice que "el documento no fue actualizado"; el diseño ya está en 5/300s (`:470-472`, `:606`). Reescribir: "el diseño y AC-14 fijan 5/300s; el 10/min aplica sólo al bootstrap. No se modifica el número."

---

## 5. Riesgos técnicos no cubiertos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **RT-1** | Doble submit concurrente del check-in con placa nueva → `P2002` no capturado → 500 | Media | Alto | Corrección 8 + test de concurrencia (dos `execute` en paralelo con mock de Prisma o e2e contra DB). |
| **RT-2** | Vehículo soft-deleted reutilizado: el episodio queda colgado de un vehículo dado de baja y `assertVehicleAccess` no filtra `deletedAt` (`:58-62`) | Media | Alto | Corrección 8: 409 explícito + test. |
| **RT-3** | `ownerContact`: invertir el orden `create`/`update` viola el índice parcial inmediato | Baja | Medio | Documentar el orden en el handler y test que falle si se invierte. |
| **RT-4** | `customLabel` vacío o con espacios pasa el XOR y deja tipos "vacíos" en el timeline | Media | Bajo | `@Transform(trim)` + `@MinLength(3)` en el DTO; test. |
| **RT-5** | Ticket firmado con `JWT_SECRET` plano se confunde con un access token si cambia `JwtStrategy` | Baja | Alto | Secret derivado + `purpose` (corrección 10). |
| **RT-6** | `expired` fuera del índice parcial: dos `create` concurrentes sobre un invite vencido pueden competir por reactivar/insertar | Baja | Medio | Aceptado en el piloto. Si aparece, incluir `'expired'` en el índice y documentar la desviación del diseño en `§3.1` (no es cambio de producto). |
| **RT-7** | Pata `care_episodes` sin filtro de estado: el taller conserva lectura de un vehículo cuyo check-in se anuló | Media | Bajo | Corrección 7. |
| **RT-8** | Migraciones A y B tocan `vehicles` y `care_episodes`: dos ramas con `migrate dev` generan migraciones divergentes | Alta | Medio | Serializar: A mergeada y aplicada antes de generar B. Nunca `db:migrate` local con dos PRs de migración abiertos. |
| **RT-9** | `get-care-episode` sigue devolviendo 404 cross-workshop (`get-care-episode.handler.ts:191-192`): el AC 10/25/26 (taller B lee el episodio de A) no se cumple con este plan | Alta | Medio | Reportado como contradicción de producto (§1). No bloquea B-1/B-2/B-3; sí bloquea el AC de lectura multi-taller. |
| **RT-10** | C-5 se atrasa y el cierre queda sin listener: cierres del piloto sin invite, silencioso (ya es R-9 del PM) | Media | Alto | C-5 en el mismo release que B-3; test de dos cierres → un invite. |
| **RT-11** | `closeNotes` sin `MaxLength` en el DTO si se agrega la columna pero no la validación → error de Postgres por longitud | Media | Bajo | Corrección 1. |

---

## 6. Orden de arranque recomendado

**Regla de oro:** una sola migración abierta a la vez. A y B no se generan en paralelo porque ambas agregan relaciones a `Vehicle` y `CareEpisode`.

| Ola | Quién | Trabajo | Gate de salida |
|---|---|---|---|
| **0 — hoy** | `database-hcdv` | B-1: migración A (4 tablas, 9 columnas con `closeNotes`, 1 enum, CHECK XOR, índice parcial) + seed de 14 tipos / 16 vínculos + permiso `care-episode.close` + `DEFAULT_PHONE_COUNTRY_CODE` | `npm run db:migrate && npm run db:generate && npm run build && npm run db:seed`; `\d+ care_episode_service_types`, `\di vehicle_owner_contacts_active_unique`, conteos 14/16. |
| **0 — en paralelo** | Tech Lead / producto | Correcciones 3, 6, 11, 12 en los documentos (no tocan código) | Docs enmendados antes de que alguien copie el enum o la transacción. |
| **1** | `backend-engineer-hcdv` | B-1 código: `vehicle-display-name.ts`, `phone.util.ts`, y conectar el fallback en `lookup-vehicle`, `get-care-episode` y `get-vehicle-history` (correcciones 4 y 5) | Specs de los tres handlers verdes; build. |
| **2** | `backend-engineer-hcdv` | B-2: `POST check-in`, `GET service-types` (antes de `@Get(':id')`), pata `care_episodes` con `status <> 'cancelled'`, P2002 de placa y soft-delete (correcciones 7 y 8) | Tests de check-in (placa nueva/existente, VIN 409 x2, teléfono opcional, tipos ≤3, odómetro XOR), test de concurrencia, `assertVehicleAccess` con `care_episodes`. |
| **3** | `backend-engineer-hcdv` | B-3: `POST :id/close` con `closeNotes`, evento post-commit, validación de foto `after` para odómetro ilegible | 409 doble cierre; evento sólo post-commit; `care-episodes.controller.spec.ts` verde. |
| **4** | `database-hcdv` | C-1: migración B (después de A mergeada), enum lowercase, índice lowercase, `acquiredByClaimInviteId` | Verificación de `pg_enum` + `pg_indexes`. |
| **5** | `backend-engineer-hcdv` | C-2 con correcciones 9 y 10; C-3 con `assertVehicleAccess` reusado | Los 3 tests críticos (D-178) + contrato pre-verificación. |
| **6** | `backend-engineer-hcdv` | C-5 (hook) en el mismo release que B-3 | Dos cierres → un invite; fallo del listener no revierte. |

**Paralelizable sin riesgo**

- Documentos (correcciones 3, 6, 11, 12): desde hoy, no depende de código.
- `vehicle-display-name.ts` y `phone.util.ts` (helpers puros con tests): se pueden escribir antes de que la migración esté aplicada, siempre que no se importen en handlers hasta regenerar el cliente.
- C-4 (mails): sólo cuando `P-2` esté aprobado; el código con placeholders no se mergea antes.

**No paralelizable**

- Migraciones A y B.
- B-2 antes de B-1 aplicada.
- C-2/C-3 antes de aplicar las correcciones 9 y 10 (riesgo de rehacer el handler del commit y el contrato del ticket).

**Criterio para dar por cerrada esta revisión:** las correcciones 1, 2, 3, 6, 7, 8, 9, 10 y 12 aplicadas en los documentos; 4 y 5 asignadas a B-1/B-2 en el mapa de archivos; 11 derivada a producto. Con eso, B-1 arranca hoy y C-2/C-3 quedan listos para delegarse cuando termine B-3.

---

## 7. Estado de aplicación (2026-11-01)

Todas las correcciones fueron aplicadas en los documentos antes de delegar. **No se tocó código, schema ni migraciones.**

| # | Corrección | Estado | Dónde |
|---|---|---|---|
| 1 | `closeNotes` en B-1 + DTO + persistencia en B-3 | ✅ aplicada | `02-backend-implementation.md` §3.1 b, §5.1, §5.2, §5.3, §3.4 |
| 2 | Conteo del mapa de migración + `.env.example` | ✅ aplicada | `02-backend-implementation.md` §12; `.env.example` |
| 3 | Enum e índice de reclamos en lowercase | ✅ aplicada | `02-backend-implementation.md` §6.2, §6.5; `vehicle-claim-technical-design.md` D-TL-VC-5, §3.1, §3.3; `01-scope-acceptance.md` R-4 |
| 4 | Consumidores del fallback marca/modelo en el mapa | ✅ asignada | `02-backend-implementation.md` §12 |
| 5 | `select` del historial extendido | ✅ asignada | `02-backend-implementation.md` §12 (`get-vehicle-history`) |
| 6 | R-3 y R-5 reescritos | ✅ aplicada | `04-implementation-plan.md` §7 |
| 7 | Filtro `status <> 'cancelled'` en la pata `care_episodes` | ✅ aplicada | `02-backend-implementation.md` §4.3 |
| 8 | Concurrencia, soft-delete, tipos y orden de `ownerContact` | ✅ aplicada | `02-backend-implementation.md` §4.2 |
| 9 | Transacción interactiva del commit | ✅ aplicada | `02-backend-implementation.md` §7.3 |
| 10 | Secret del ticket + `@Throttle` por ruta | ✅ aplicada | `02-backend-implementation.md` §7.3, §7.4 |
| 11 | Enmienda del spec (B-1, B-3, fase B) | ✅ aplicada | `workshop-checkin-flow.md` §11.1, §11.2 |
| 12 | Afirmación sobre el throttle corregida | ✅ aplicada | `02-backend-implementation.md` §7.2 |

**Riesgos del §5:** RT-1 a RT-5 y RT-7 a RT-11 quedaron cubiertos por las correcciones 8, 7, 10, 1 y 3. RT-6 se acepta en el piloto. RT-9 (lectura multi-taller) queda reportado como contradicción de producto y fuera del alcance de B-1/B-2/B-3.
