# Plan 02 — Implementación backend (check-in de taller + reclamo de vehículo)

> **Autor:** sesión principal — **Fecha:** 2026-11-01
> **Fuentes:** `docs/specs/workshop-checkin-flow.md` (fases A–G, §7.3), `docs/designs/vehicle-claim-technical-design.md` (§3 modelo, §4 estados, §5 API, §6 seguridad, §11 PRs), `docs/plans/01-scope-acceptance.md` (DoD), `docs/plans/03-repo-gap-inventory.md` (G-01..G-23).
> **Naturaleza:** plan de ejecución. **No** redefine contratos de producto ni reabre decisiones cerradas. Donde el spec/diseño no fija algo técnico, se marca `D-TL-B*` y se propone una opción concreta.
> **Regla:** ningún PR arranca sin que el anterior esté verde (`build` + `test`). Sin `@nestjs/cqrs`, sin cron, sin colas, sin outbox.

---

## 1. Principios de implementación

1. **Un solo sentido de dependencia.** `care-episodes` no conoce `vehicle-claims`. El módulo de reclamos escucha `care-episode.closed`.
2. **La transacción manda.** Check-in (vehículo + atención + contacto) y commit del reclamo (estado + ownership) son transacciones únicas. Nada de "crear y después arreglar".
3. **Eventos post-commit y best-effort.** El cierre nunca falla por un mail o por el invite (CV-16 / RF-13 del spec).
4. **Migraciones aditivas.** Nada de `DROP` ni de `NOT NULL` sobre columnas con datos. Los enums nuevos se agregan, no se reemplazan.
5. **Autorización en el backend.** Guards del repo, nunca confianza en la UI.
6. **El token no se persiste.** Solo `sha256(token)`.

---

## 2. Mapa de PRs y fases

| # | Entrega | Depende de | Gap que cierra |
|---|---|---|---|
| **B-1** | Migración A: modelo del check-in + seed de catálogo/permiso | — | G-01 (parcial), G-02, G-03, G-10, G-21 |
| **B-2** | Check-in unificado (endpoint + transacción + AuthZ) | B-1 | G-05, G-06, G-09 |
| **B-3** | Cierre de atención + evento `care-episode.closed` | B-1 (∥ B-2) | G-04, G-08 (restricción documentada) |
| **C-1** | Migración B: modelo de reclamo + permisos + `qrcode` | B-1 | G-01, G-11, G-14 |
| **C-2** | API pública (bootstrap / challenge / verify / commit) | C-1 | G-12, G-14 |
| **C-3** | API taller (create/list/detail/approve/reject/revoke) + QR en R2 | C-1, C-2 | G-13 |
| **C-4** | Notificaciones (mails + listeners) | C-3 | G-16 (mails) |
| **C-5** | Hook `care-episode.closed` → invite | B-3, C-3 | G-15 |
| **C-6** | Admin revoke (`meta.counts` **ya implementado**; queda solo el endpoint admin) | C-3 | — (PR-5 del diseño) |
| **C-7** | Disputa del dueño real | C-3 | PR-8 — **fuera del piloto** |

**Corte de release del piloto:** B-1 → B-2 → B-3 → C-1 → C-2 → C-3 → C-5 (+C-4 en el mismo release). **C-6 y C-7 no bloquean.** C-5 **no puede** shippear sin B-3 y C-3 (riesgo R-9 del PM: cierres sin listener = GTM a medias).

---

## 3. B-1 — Migración A: modelo del check-in

### 3.1 Objetos nuevos

**Archivo:** `prisma/migrations/<timestamp>_add_workshop_checkin_model/migration.sql`
**Schema:** `prisma/schema.prisma`

#### a) `Vehicle` — texto libre de marca/modelo

```prisma
model Vehicle {
  // …existentes…
  brandName String? @map("brand_name") @db.VarChar(100)
  modelName String? @map("model_name") @db.VarChar(100)
  ownerContacts VehicleOwnerContact[]
  claimInvites  VehicleClaimInvite[]   // relación agregada en C-1
}
```

- `ALTER TABLE vehicles ADD COLUMN brand_name VARCHAR(100), ADD COLUMN model_name VARCHAR(100);` — nullable, sin backfill.
- **Precedencia de lectura** (helper compartido, ver §3.3): `version.model.brand.name/model.name` → `brandName/modelName` → `null`.

#### b) `CareEpisode` — odómetro de egreso y excepciones

```prisma
model CareEpisode {
  // …existentes…
  mileageOut                 Int?    @map("mileage_out")
  mileageInUnreadable        Boolean @default(false) @map("mileage_in_unreadable")
  mileageInUnreadableReason  String? @map("mileage_in_unreadable_reason") @db.VarChar(200)
  mileageOutUnreadable       Boolean @default(false) @map("mileage_out_unreadable")
  mileageOutUnreadableReason String? @map("mileage_out_unreadable_reason") @db.VarChar(200)
  closedByMemberId           String? @map("closed_by_member_id") @db.Uuid
  closedByMember             WorkshopMember? @relation("ClosedCareEpisodes", fields: [closedByMemberId], references: [id], onDelete: Restrict)
  closeNotes                 String? @map("close_notes") @db.VarChar(1000)
  serviceTypes               CareEpisodeServiceType[]
  claimInvites               VehicleClaimInvite[]  // C-1
}
```

- `ALTER TABLE care_episodes ADD COLUMN close_notes VARCHAR(1000);` — nullable, sin backfill.
- `closeNotes` persiste el motivo de la excepción "tablero reemplazado" (§5.3). **No** se agrega un flag `odometerReplaced` (`D-TL-B4`).

**Nota:** `closedByMemberId` no está en el spec (ahí dice "detalle de diseño técnico", §6.2). Se agrega porque el diseño de reclamos exige trazabilidad del origen y el AC de auditoría del cierre lo pide. Si el Tech Lead prefiere no agregarlo, el evento igual lleva `memberId`; **no bloquea**.

#### c) `VehicleOwnerContact` + enum

```prisma
model VehicleOwnerContact {
  id                  String               @id @default(uuid()) @db.Uuid
  vehicleId           String               @map("vehicle_id") @db.Uuid
  phoneE164           String?              @map("phone_e164") @db.VarChar(20)
  phoneAreaCode       String?              @map("phone_area_code") @db.VarChar(6)
  phoneNationalNumber String?              @map("phone_national_number") @db.VarChar(12)
  status              VehicleContactStatus
  source              String               @default("workshop_counter")
  recordedByMemberId  String?              @map("recorded_by_member_id") @db.Uuid
  isActive            Boolean              @default(true) @map("is_active")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")
  vehicle             Vehicle              @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  recordedByMember    WorkshopMember?      @relation("OwnerContactsRecorded", fields: [recordedByMemberId], references: [id], onDelete: SetNull)

  @@map("vehicle_owner_contacts")
}

enum VehicleContactStatus { available unavailable }
```

**Índice único parcial escrito a mano** (Prisma 6 lo ignora en el diff — patrón `20261007140000_vehicle_ownerships_unique_active_primary`):

```sql
CREATE UNIQUE INDEX vehicle_owner_contacts_active_unique
  ON vehicle_owner_contacts (vehicle_id) WHERE is_active = true;
```

Dejar comentario en el `.sql` explicando por qué es manual.

#### d) Catálogo de tipos de atención

```prisma
model ServiceType {
  id          String        @id @default(uuid()) @db.Uuid
  code        String        @unique @db.VarChar(60)
  name        String        @db.VarChar(120)
  description String?
  isActive    Boolean       @default(true) @map("is_active")
  createdAt   DateTime      @default(now()) @map("created_at")
  specialties ServiceTypeSpecialty[]
  links       CareEpisodeServiceType[]
  @@map("service_types")
}

model ServiceTypeSpecialty {
  id            String      @id @default(uuid()) @db.Uuid
  serviceTypeId String      @map("service_type_id") @db.Uuid
  specialtyId   String      @map("specialty_id") @db.Uuid
  serviceType   ServiceType @relation(fields: [serviceTypeId], references: [id], onDelete: Cascade)
  specialty     Specialty   @relation(fields: [specialtyId], references: [id], onDelete: Cascade)
  @@unique([serviceTypeId, specialtyId])
  @@map("service_type_specialties")
}

model CareEpisodeServiceType {
  id            String      @id @default(uuid()) @db.Uuid
  careEpisodeId String      @map("care_episode_id") @db.Uuid
  serviceTypeId String?     @map("service_type_id") @db.Uuid
  customLabel   String?     @map("custom_label") @db.VarChar(120)
  careEpisode   CareEpisode @relation(fields: [careEpisodeId], references: [id], onDelete: Restrict)
  serviceType   ServiceType? @relation(fields: [serviceTypeId], references: [id])
  @@index([careEpisodeId])
  @@map("care_episode_service_types")
}
```

**Corrección al spec §7.3.4:** el borrador tenía `@map("serviceTypeId")` (camelCase) en `CareEpisodeServiceType.serviceTypeId`. Debe ser `service_type_id` como el resto del schema. Se documenta acá para no repetir el error en la migración.

**CHECK XOR** (SQL manual, patrón `vehicle_ownerships_owner_xor`):

```sql
ALTER TABLE care_episode_service_types
  ADD CONSTRAINT care_episode_service_types_xor
  CHECK ((service_type_id IS NULL) <> (custom_label IS NULL));
```

**Relación en `Specialty`:** agregar `serviceTypes ServiceTypeSpecialty[]`.

### 3.2 Seed (`prisma/seed.ts`)

**a) Catálogo — 14 tipos (D-192).** `upsert` por `code`, idempotente:

| code | name | especialidades |
|---|---|---|
| `cambio_aceite_filtros` | Cambio de aceite y filtros | `mecanica_general` |
| `frenos` | Frenos (pastillas/discos) | `mecanica_general` |
| `tren_delantero_suspension` | Tren delantero y suspensión | `mecanica_general` |
| `distribucion_correa` | Distribución / correa | `mecanica_general` |
| `aire_acondicionado` | Aire acondicionado | `mecanica_general` |
| `embrague` | Embrague | `mecanica_general` |
| `reparacion_abolladuras` | Reparación de abolladuras | `chapa_pintura` |
| `pintura_panel` | Pintura de panel | `chapa_pintura` |
| `reparacion_paragolpes` | Reparación de paragolpes | `chapa_pintura` |
| `enderezado_chasis` | Enderezado de chasis | `chapa_pintura` |
| `diagnostico_escanner` | Diagnóstico por escáner | `mecanica_general` + `electricidad` |
| `bateria_alternador` | Batería / alternador | `mecanica_general` + `electricidad` |
| `luces_opticas` | Luces y ópticas | `electricidad` |
| `cierre_centralizado_alarma` | Cierre centralizado / alarma | `electricidad` |

→ 14 filas en `service_types` + **16** filas en `service_type_specialties` (14 + 2 por los dos tipos multi-especialidad).

**Ojo con los códigos de `Specialty`:** el seed existente tiene `chapa_pintura`, `mecanica_general`, `electricidad` (verificado en `docs/specs/workshop-checkin-flow.md:392`). El seed debe **buscar por `code`** y fallar con mensaje claro si falta, no crear especialidades nuevas.

**b) Permiso nuevo:** `care-episode.close` (`module='care-episode'`, `resource='care-episode'`, `action='close'`) → roles `owner` + `mechanic`. Sin cambios en `employee`.

**c) `DEFAULT_PHONE_COUNTRY_CODE`** — no es seed, es config (§4.4).

### 3.3 Cambios de código en B-1 (sin lógica de negocio nueva)

| Archivo | Cambio |
|---|---|
| `src/common/vehicles/vehicle-display-name.ts` (**nuevo**) | Helper `resolveVehicleDisplayName({version, brandName, modelName, licensePlate})` con fallback de 3 niveles. Lo usan check-in, reclamos y mails. |
| `src/modules/vehicle-catalog/**` (si expone marcas/modelos) | Nada: el alta usa los endpoints existentes. |
| `src/config/envs.ts` | Agregar `DEFAULT_PHONE_COUNTRY_CODE` (ver §4.4). |
| `src/common/phone/phone.util.ts` (**nuevo**) | `buildE164({areaCode, nationalNumber, countryCode})`, `isValidPair(...)`, `maskPhone(e164)`. Sin dependencias nuevas. |

### 3.4 Verificación de B-1

```bash
npm run db:migrate && npm run db:generate && npm run build && npm run db:seed
# y en psql:
\d+ care_episode_service_types   -- CHECK XOR presente
\d+ care_episodes                -- close_notes VARCHAR(1000) presente
\di vehicle_owner_contacts_active_unique
SELECT count(*) FROM service_types;                 -- 14
SELECT count(*) FROM service_type_specialties;      -- 16
```

---

## 4. B-2 — Check-in unificado

### 4.1 Endpoint

**Ruta propuesta (`D-TL-B1`):** `POST /api/care-episodes/check-in` en `CareEpisodesController`, con `@UseGuards(WorkshopOnlyGuard, PermissionsGuard)` + `@Permissions('care-episode.create')` (mismo permiso que el alta actual; no se crea permiso nuevo para el ingreso).

> **Por qué no reusar `POST /care-episodes`:** el contrato actual exige `vehicleId` y `branchId`; el check-in recibe **placa** y resuelve el vehículo. Cambiar el DTO existente rompería el flujo del panel de atenciones. Endpoint nuevo = contrato nuevo.

**Request (`CheckInDto`):**

```ts
{
  licensePlate: string;              // @Matches(/^[A-Za-z0-9]{2,10}$/)
  brandName?: string;                // si el vehículo no existe
  modelName?: string;
  brandId?: string;                  // catálogo (excluyente con brandName)
  modelId?: string;
  versionId?: string;
  vin?: string;                      // opcional
  branchId: string;
  mileageIn?: number;                // @IsInt @Min(0)
  mileageInUnreadable?: boolean;
  mileageInUnreadableReason?: string; // @MinLength(3) @MaxLength(200)
  customerComplaint?: string;        // @MaxLength(500)
  customerNotes?: string;            // @MaxLength(1000)
  internalNotes?: string;            // @MaxLength(1000)
  serviceTypeIds?: string[];         // 0..3
  customServiceLabel?: string;       // "Otro"
  ownerPhone?: { areaCode?: string; nationalNumber?: string } | null;
  files?: File;                      // multipart: foto del tablero (máx. 1, D-163)
}
```

**Ruta DUAL (D-163, mismo patrón que `POST /owner`):** `application/json`
mantiene el contrato histórico; `multipart/form-data` envía los mismos campos
como texto + `files` (1 foto, JPG/PNG/WebP/AVIF, ≤5MB). En multipart:

- `mileageInUnreadable` viaja como `"true"`/`"false"` (los transforms del DTO
  evitan el foot-gun `Boolean('false') === true`).
- `serviceTypeIds` viaja como campo repetido o JSON serializado.
- `ownerPhone` viaja como JSON serializado (multipart no anida objetos).

**Response 201:**

```json
{ "data": { "careEpisodeId": "uuid", "vehicleId": "uuid", "licensePlate": "ABC123",
            "status": "open", "mileageIn": 45000, "checkedInAt": "…",
            "vehicleCreated": true, "ownerContact": { "status": "available", "phoneMasked": "…2268" },
            "attachments": [ { "id": "uuid", "phase": "before", "…": "…" } ],
            "attachmentCount": 1 } }
```

**Errores:** 400 (validación; foto obligatoria si `mileageInUnreadable=true`),
403 (branch de otro taller / contexto no WORKSHOP), 404 (branch inexistente),
409 (`VIN ya registrado en otro vehículo` / `VIN no coincide con el vehículo registrado`),
503 (storage caído al subir la foto: el episodio no se crea).

### 4.2 Handler y transacción

**Archivo:** `src/modules/care-episodes/commands/check-in/check-in.handler.ts` (+ `.command.ts`, `.handler.spec.ts`)

```
execute(command):
  1. normalizar placa (trim().toUpperCase())
  2. validar branch ∈ workshopId del contexto          → 403
  3. validar tipos (≤3; XOR serviceTypeId/customLabel) → 400
  4. validar odómetro: (mileageIn) XOR (unreadable + reason) → 400
     · si unreadable: foto obligatoria (files.length ≥ 1)   → 400 (D-163)
     · si legible: 1 foto `before` opcional (D-170)
  5. episodeId = uuid() (las keys nacen bajo care-episodes/<episodeId>/)
     · upload de la foto (máx. 1) → fallo de storage = 503; nada persistido
  6. $transaction:
     a. vehicle = findUnique({ licensePlate })
     b. si no existe → create({ licensePlate, brandName/modelName/versionId, vin })
        · si vin viene y ya existe en otro vehículo → 409 (P2002 sobre vin)
        · si dos check-ins concurrentes crean la misma placa: capturar P2002 sobre
          license_plate, re-leer el vehículo y continuar con el episodio (no 500)
     c. si existe → si vin viene y difiere → 409
        · si vehicle.deletedAt !== null → 409 "El vehículo está dado de baja;
          contactá a soporte". No resucitar ni crear otro (licensePlate es @unique)
     d. careEpisode = create({ id: episodeId, vehicleId, workshopId, branchId,
                               createdByMemberId, status:'open', checkedInAt: now,
                               source:'workshop', mileageIn + flags,
                               complaint/notes,
                               attachments: { create: [{ phase:'before', … }] } })
     e. serviceTypes: createMany (0..3), validando antes que existan y estén activos
     f. ownerContact: si viene teléfono → cerrar activo previo (isActive=false) + crear nuevo
        · el orden es obligatorio: primero el update, después el create
          (vehicle_owner_contacts_active_unique es inmediato, no deferrable)
        si no viene → si no hay activo, crear status='unavailable'
  7. COMPENSACIÓN: si el paso 6 falla tras el upload → borrar el blob
     (best-effort, log) y re-lanzar el error
  8. post-commit: emit 'care-episode.created' (payload sin cambios; la evidencia
     viaja en la creación, no hay evento individual `attachment.added`)
  9. return response (incluye attachments + attachmentCount)
```

**Concurrencia y soft-delete (`D-TL-B2`, corrección 8 del review):**

- `findUnique({ licensePlate })` puede devolver un vehículo con `deletedAt` no nulo (`schema.prisma:706`). **No** se resucita: 409 explícito + test. Crear otro daría `P2002` porque `licensePlate` es `@unique` (`schema.prisma:697`).
- Dos check-ins concurrentes con la misma placa nueva: ambos `findUnique` devuelven `null`, ambos crean, uno falla por `license_plate` único. Se captura `P2002` sobre `license_plate`, se re-lee el vehículo y se continúa con la creación del episodio. Sin esto, el doble submit del mostrador devuelve 500.
- `serviceTypeIds`: validar existencia y `isActive=true` antes del `createMany`; si no, el FK revienta como 500. `customLabel` debe rechazar vacío/espacios (`@Transform(trim)` + `@MinLength(3)`); el CHECK XOR acepta la cadena vacía.

**Decisión `D-TL-B2`:** el vehículo se crea **dentro** del comando de check-in, no abriendo `RegisterVehicleHandler` a WORKSHOP (G-06). Motivo: no ampliar la superficie de escritura de `/vehicles/*` y evitar el riesgo de que el alta de taller herede reglas de concesionaria (`initialMileage`, ownership).

**Idempotencia:** no se implementa. Un doble submit crea dos atenciones abiertas; el panel debe deshabilitar el botón. Se documenta como limitación conocida (no hay clave de idempotencia en el repo).

### 4.3 Autorización — `care_episodes` en el UNION

**Archivo:** `src/common/authorization/vehicle-access.service.ts:501-513`

```sql
UNION
SELECT workshop_id FROM care_episodes
 WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'
```

Filtro de estado obligatorio (corrección 7 del review): `delivered` asocia (el taller atendió), `cancelled` no. Es el mismo criterio de `appointments`/`work_orders` (`vehicle-access.service.ts:503-505`). `care_episodes.workshop_id` es nullable (`schema.prisma:966`), así que las atenciones de origen `owner` quedan excluidas naturalmente. No se filtra `deletedAt`: ninguna pata lo hace y `assertVehicleAccess` sólo verifica existencia (`vehicle-access.service.ts:58-62`). Esto cierra **G-05** y habilita `GET /vehicles/:id` y `/history` en contexto WORKSHOP para vehículos que sólo pasaron por check-in.

**Tests obligatorios:** un vehículo con sólo `care_episodes` pasa `assertVehicleAccess` en WORKSHOP; un vehículo de otro taller no.

### 4.4 Celular y config

`src/config/envs.ts`:

```ts
DEFAULT_PHONE_COUNTRY_CODE: Joi.string().pattern(/^\+\d{1,3}$/).default('+54'),
```

y en la interfaz `Env`:

```ts
DEFAULT_PHONE_COUNTRY_CODE: string;
```

**Nunca** `.required()` (R-11 del PM: rompe todos los entornos existentes).

`buildE164` recibe `areaCode` y `nationalNumber`, limpia no-dígitos, valida que ambos tengan ≥2 dígitos y concatena `countryCode + area + number`. **Sin longitud fija** (D-173): `336 4687486` y `11 22681000` deben pasar.

### 4.5 Catálogo de tipos para la UI

**Ruta propuesta (`D-TL-B3`):** `GET /api/care-episodes/service-types` — `WorkshopOnlyGuard`, sin permiso extra (lectura de catálogo).

- Devuelve `{ data: [{ id, code, name }] }` filtrado por la **unión** de `WorkshopSpecialty` del taller del contexto.
- Taller sin especialidades → catálogo completo + flag `onboardingRequired: true` (RF-9).
- `isActive=false` no se devuelve.

**Alternativa:** servirlo desde `vehicle-catalog`. Se elige `care-episodes` porque el consumidor es el check-in y evita un módulo más en el grafo.

### 4.6 DoD de B-2

- AC 1–7, 15–23, 27–29, 34 del spec en verde.
- Test de atomicidad: si falla el `create` de la atención, no queda vehículo.
- Test de VIN: 409 en los dos casos (VIN ajeno / VIN distinto).
- Test de placa: dos check-ins con la misma placa → **un** vehículo, dos atenciones.
- `npm run build` + `npm test` verdes.

---

## 5. B-3 — Cierre de atención

### 5.1 Endpoint

`POST /api/care-episodes/:id/close` — `WorkshopOnlyGuard` + `PermissionsGuard` + `@Permissions('care-episode.close')`.

**Request (`CloseCareEpisodeDto`):**

```ts
{
  mileageOut?: number;
  mileageOutUnreadable?: boolean;
  mileageOutUnreadableReason?: string;
  serviceTypeIds?: string[];        // ≥1 al cierre (obligatorio)
  customServiceLabel?: string;
  closeNotes?: string;              // opcional, @MaxLength(1000)
}
```

**Response 200:** `{ data: { id, status: 'delivered', closedAt, mileageOut } }`

**Errores:** 404 si el episodio no es del taller; 409 `La atención ya fue cerrada` si no está `open`; 400 si falta odómetro/tipo; 400 si `mileageOut < mileageIn` (validación de cordura, ver §5.3).

### 5.2 Handler

**Archivo:** `src/modules/care-episodes/commands/close-care-episode/close-care-episode.handler.ts`

```
1. SELECT … FOR UPDATE del episodio (patrón del attach handler:114)
2. si status !== 'open' → 409
3. validar odómetro de egreso (valor XOR excepción+motivo)
4. validar tipos ≥1 (≤3, XOR)
5. $transaction: update({ status:'delivered', closedAt: now, mileageOut…, closedByMemberId,
                         closeNotes })
   + createMany serviceTypes si vinieron
6. post-commit: emit 'care-episode.closed' { careEpisodeId, vehicleId, workshopId, memberId }
```

**Evento nuevo:** `src/modules/care-episodes/events/care-episode-closed.event.ts` con `BaseEvent`, mismo patrón que `care-episode-created.event.ts`.

### 5.3 Validación del odómetro contra el máximo histórico

El spec (RF-8) exige comparar contra el **máximo histórico** y permitir la excepción "tablero reemplazado" sin bloquear nunca.

- **Máximo histórico** = `max(mileageIn, mileageOut)` de episodios del vehículo + `VehicleMileage` si existiera.
- Si `mileageOut < maxHistorico` → **no 400**. Se acepta y se marca en la respuesta `mileageOutlier: true`; el frontend muestra el modal de confirmación **antes** de enviar (la decisión de UI es del frontend; el backend no bloquea).
- `mileageOut < mileageIn` del **mismo** episodio → 400 (error de tipeo evidente).
- Excepción "tablero reemplazado": se persiste como `mileageOutUnreadable=false` + `mileageOut` nuevo + `closeNotes` con el motivo. **No** se agrega un flag nuevo: el spec no lo define como columna y el registro queda en `closeNotes` + auditoría.

> **Decisión `D-TL-B4` (confirmada por el Tech Lead):** `closeNotes` es la opción correcta; **no** se agrega un flag `odometerReplaced`. La columna `close_notes VARCHAR(1000)` se crea en B-1 y se persiste en el `update` del cierre (§5.2 paso 5). El DTO lleva `@MaxLength(1000)`.

### 5.4 Fotos "después" antes de cerrar

G-08: los adjuntos se rechazan con 409 en `delivered`. **No se relaja el guard.** El flujo correcto es: subir fotos `phase='after'` → cerrar. El panel debe mostrar el aviso y bloquear el botón de cierre hasta que el usuario confirme que no subirá más fotos (o permitir cerrar igual: la foto no es obligatoria salvo en la excepción de odómetro ilegible).

**Regla de la excepción:** si `mileageOutUnreadable=true`, el handler de cierre **verifica** que exista ≥1 adjunto `phase='after'` del episodio; si no → 400 con mensaje "Adjuntá la foto del tablero antes de cerrar". Esto convierte la regla del spec en validación de servidor, no de UI.

### 5.5 DoD de B-3

- AC 8, 9, 21, 24 del spec.
- Dos cierres del mismo episodio → el segundo 409.
- Cierre con odómetro ilegible sin foto → 400; con foto → 200.
- El evento se emite **sólo** después del commit (test con spy sobre `eventEmitter.emit` y mock de fallo del listener).
- `care-episodes.controller.spec.ts` sigue verde.

---

## 6. C-1 — Migración B: modelo de reclamo

### 6.1 Objetos

Tomados **verbatim** del diseño §3.1 (no se re-diseñan acá):

- `VehicleClaimInvite` (con `tokenHash @unique`, `qrObjectKey`, `lockoutCount`, `claimOutcome`, `revokedByUserId`, etc.).
- `VehicleClaimAttempt` + enum `VehicleClaimAttemptOutcome`.
- `VehicleClaimDispute` + enum `VehicleClaimDisputeStatus` (**sólo modelo**, flujo en C-7).
- Enums `VehicleClaimStatus`, `VehicleClaimRevokeReason`, `VehicleClaimOutcome`.
- Relaciones agregadas a `Vehicle`, `Workshop`, `CareEpisode`, `User`, `VehicleOwnership.acquiredByClaimInviteId`.

### 6.2 Índices únicos parciales (SQL manual)

```sql
-- un solo invite activo por vehículo
CREATE UNIQUE INDEX vehicle_claim_invites_active_unique
  ON vehicle_claim_invites (vehicle_id)
  WHERE status IN ('pending','verification_required','verified','manual_review');
```

**Ojo:** los estados del índice van en **minúscula**, igual que el enum Prisma. El repo declara los enums en lowercase y no usa `@map` por valor (`CareEpisodeStatus { open delivered cancelled }`, `schema.prisma:1354-1358`), así que la BD recibe `'pending'`, no `'PENDING'`. El enum completo es: `pending verification_required verified manual_review claimed claim_blocked expired revoked`. Si se copian literales en mayúscula, Postgres rechaza el `CREATE UNIQUE INDEX` al castear al tipo enum. **Verificar el SQL generado antes de aplicar.**

Segundo índice: el de `token_hash` lo genera Prisma por `@unique`.

### 6.3 Dependencia nueva

`qrcode` en `package.json` (generación server-side del PNG). **No** se usa una librería de QR en el frontend para el panel: la imagen sale de R2.

### 6.4 Permisos (seed)

| Permiso | owner | mechanic | employee |
|---|---|---|---|
| `vehicle-claim.create` | ✅ | ✅ | — |
| `vehicle-claim.list` | ✅ | ✅ | — |
| `vehicle-claim.review` | ✅ | — | — |
| `vehicle-claim.revoke` | ✅ | — | — |

Matriz F-5 del diseño. `super_admin` pasa por bypass del `PermissionsGuard` con contexto WORKSHOP.

### 6.5 Verificación de C-1

```sql
\d vehicle_claim_invites          -- sin columna de token crudo
\di vehicle_claim_invites_active_unique
SELECT indexdef FROM pg_indexes WHERE indexname = 'vehicle_claim_invites_active_unique';
-- confirmar que los literales del WHERE matchean pg_enum (minúscula)
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'VehicleClaimStatus' ORDER BY e.enumsortorder;
SELECT count(*) FROM permissions WHERE module='vehicle-claim';  -- 4
```

`npm run build` verde y smoke de `GET /vehicles/:id` (los selects existentes no cambian).

---

## 7. C-2 — API pública

### 7.1 Estructura del módulo

```
src/modules/vehicle-claims/
  vehicle-claims.module.ts
  controllers/
    vehicle-claim-public.controller.ts
    vehicle-claims.controller.ts          (C-3)
  commands/
    verify-claim/verify-claim.handler.ts
    commit-claim/commit-claim.handler.ts
  queries/
    get-public-claim/get-public-claim.handler.ts
    get-claim-challenge/get-claim-challenge.handler.ts
  dto/
    verify-claim.dto.ts
    commit-claim.dto.ts
  services/
    claim-token.service.ts        // hash, generación, rotación
    claim-state.service.ts        // expiración lazy, lock, transiciones
    claim-qr.service.ts           // genera PNG + sube a R2
  events/                          // vehicle-claim.*
  listeners/                       // C-4
```

**Sin repository.** Handlers con `execute()` inyectando `PrismaService` (D-TL-VC-1).

### 7.2 Contratos

Idénticos a `docs/designs/vehicle-claim-technical-design.md` §5.1. Resumen operativo:

| Método | Path | Guard/throttle | Notas |
|---|---|---|---|
| GET | `/api/vehicle-claims/public/:token` | `default 10/60s` + `vehicleClaimToken 10/60s` | Devuelve **sólo** `{status, canVerify}`. Side-effect T2 (`openedAt`). |
| GET | `…/public/:token/challenge?licensePlate=` | `default 10/60s` + `vehicleClaimToken 5/300s` | Sólo opciones. Plate-gated. |
| POST | `…/public/:token/verify` | `default 5/300s` + `vehicleClaimToken 5/300s` | Ticket JWT 20 min. **No** setea `usedAt`. |
| POST | `…/public/:token/commit` | `default 5/300s` + `vehicleClaimToken 5/300s` + sesión | 401 `AUTH_REQUIRED` / 401 `TICKET_EXPIRED` / 409 `claim_blocked`. |

> **Throttle (`D-TL-C1` — cerrado por el Tech Lead):** el diseño fija `challenge` = 5/300s (`vehicle-claim-technical-design.md:470-472`) y AC-14 lo repite (`:606`). El 10/60s aplica **sólo** al bootstrap `GET /public/:token`. No se cambia el número ni el documento: este plan usa 5/300s para `challenge`, `verify` y `commit`.

### 7.3 Reglas de implementación críticas

1. **Lookup por hash:** `sha256(token)` → `findUnique({ tokenHash })`. Nunca comparar el token crudo.
2. **Expiración lazy:** helper `resolveEffectiveStatus(invite)` que devuelve `expired` si `expiresAt < now` y el estado no es terminal. Se llama en **todos** los accesos. Sin cron.
3. **Lock:** al fallar `verify`, contar intentos dentro de la ventana de 15 min (`lastFailedAt`). Si ≥5 → `verificationLockedAt`, `lockoutCount++`, fila `lockout_started`. Si `lockoutCount` llega a 3 → `revoked(max_attempts)`.
4. **Auto-liberación:** en cada acceso, si `verificationLockedAt + 30min < now` → resetear contadores y fila `lockout_released`.
5. **Ticket JWT:** secret derivado `envs.JWT_SECRET + ':claim-ticket'`, `sign(payload, { secret, expiresIn: 1200, algorithm: 'HS256' })`, payload `{ inviteId, vehicleId, purpose:'claim' }`. Se verifica con el mismo secret y se exige `purpose === 'claim'`. **No** usar `JWT_SECRET` plano (compartiría audiencia con los access tokens de `JwtStrategy`, `jwt.strategy.ts:34`) ni `JWT_REFRESH_SECRET`. No se agrega variable de entorno nueva.
6. **Commit:** `$transaction(async (tx) => { … })` **interactiva**, no en array. Primero `tx.vehicleClaimInvite.updateMany({ where: { id, status:'verified' }, data:{ status:'claimed', usedAt: now, claimOutcome } })`; si `count === 0` → 409 (single-use) sin ejecutar el create. Después `tx.vehicleOwnership.create({ … })`; `P2002` del índice `vehicle_ownerships_one_active_primary` → `claim_blocked` (T9), **sin** cerrar el ownership anterior. No usar `isolationLevel`: no hay uso en el repo y `READ COMMITTED` + `updateMany` con `where status='verified'` ya toma el row lock necesario.
7. **Anti-enumeración:** un único mensaje 400 para cualquier fallo de verificación (texto exacto del diseño §6.6).
8. **Nunca** loguear token ni hash. Correlacionar por `inviteId`.

### 7.4 Throttle

`src/app.module.ts`: agregar al array de `ThrottlerModule.forRoot`:

```ts
{
  name: 'vehicleClaimToken',
  ttl: 300_000,          // se sobreescribe por ruta con @Throttle
  limit: 5,
  getTracker: (req: Record<string, any>) => String(req.params?.token ?? req.ip),
}
```

**Ojo:** `getTracker` corre antes de que el `ValidationPipe` valide; `req.params.token` está disponible en el guard. Si el token es `undefined`, cae a IP (comportamiento seguro).

**Override obligatorio por ruta (corrección 10 del review):** el bucket de módulo queda en 5/300s, así que **las cuatro rutas necesitan `@Throttle` explícito**. Sin el override, el bootstrap `GET /public/:token` hereda 5/300s y rompe el diseño (10/60s). El guard resuelve la key por `class + handler + bucket` (`throttler.guard.js:148-151`) y hace fallback al bucket nombrado cuando la ruta sólo declara otro (`:82-86`): no hay cuota compartida entre `challenge`/`verify`/`commit`, sólo límites iguales.

### 7.5 DoD de C-2

Los AC del DoD de PR-2 en `01-scope-acceptance.md:118`: contrato AC-3, 4 fallos byte-idénticos, `verify` no setea `usedAt`, segundo `commit` 409, escalera de lock exacta, 429 sin datos, expiración lazy.

---

## 8. C-3 — API taller

### 8.1 Estructura

```
controllers/vehicle-claims.controller.ts
commands/
  create-claim-invite/create-claim-invite.handler.ts
  review-claim/review-claim.handler.ts        (approve + reject)
  revoke-claim/revoke-claim.handler.ts
queries/
  list-claims/list-claims.handler.ts
  get-claim/get-claim.handler.ts
```

Guards: clase `JwtAuthGuard` + `ContextGuard`; método `WorkshopOnlyGuard` + `PermissionsGuard` (orden verbatim de `care-episodes.controller.ts:85`).

### 8.2 Contratos

Idénticos a §5.2 del diseño:

| Método | Path | Permiso |
|---|---|---|
| POST | `/api/vehicle-claims` | `vehicle-claim.create` |
| GET | `/api/vehicle-claims?page&limit&status` | `vehicle-claim.list` |
| GET | `/api/vehicle-claims/:id` | `vehicle-claim.list` |
| POST | `/api/vehicle-claims/:id/approve` | `vehicle-claim.review` |
| POST | `/api/vehicle-claims/:id/reject` | `vehicle-claim.review` |
| POST | `/api/vehicle-claims/:id/revoke` | `vehicle-claim.revoke` |

### 8.3 Generación del invite (create)

```
1. validar vehicleId existe + taller tiene relación (care_episodes / maintenance)
2. regla de primer cierre (D-TL-VC-9):
   a. si hay invite en estado activo → devolver el existente (200, SIN link)
   b. si el vehículo tiene titular activo (ownership endsAt null, type ≠ co_owner)
      → 409 { reason: 'active_owner' } con copy "Este vehículo ya tiene titular; no se envió invitación"
   c. si el último invite está revoked/claim_blocked → crear nuevo
   d. si el último está expired → reactivar: mismo id, token+hash nuevos, expiresAt +7d,
      contadores en 0, QR regenerado
   e. si no hay ninguno → crear
3. token = randomBytes(32).toString('hex'); tokenHash = sha256(token)
4. QR: generar PNG → subir a R2 → qrObjectKey
5. link = `${FRONTEND_URL}/reclamo/${token}`; whatsappUrl = ownerPhone ? `https://wa.me/${e164}?text=…` : null
6. persistir + emit 'vehicle-claim.invited'
7. response incluye link/whatsappUrl/qrImageUrl SÓLO acá
```

**`ownerPhone`:** si viene en el body, se usa como snapshot **y** (según F-7, recomendación del PM) **no** corrige `VehicleOwnerContact`. Si no viene, se lee el contacto activo `available`. `ownerPhone=null` ⇔ QR en mostrador.

**`qrImageUrl`:** URL firmada del objeto en R2. Se puede devolver también en el detalle (C-3) sin exponer token.

### 8.4 Revoke de un `claimed`

Si `claimOutcome = 'ownership_created'`: en la misma transacción, cerrar el ownership creado (`endsAt = now`) y devolver `ownershipUndone: true`. Si `already_owner`: no tocar ownership.

### 8.5 DoD de C-3

DoD de PR-3 (`01-scope-acceptance.md:119`): `link`/`whatsappUrl` sólo en creación; QR en R2 re-mostrable; revoke deja `endsAt`; taller B 404; PERSONAL 403; orden de guards por reflection.

---

## 9. C-4 — Notificaciones

**Archivos:** `src/common/mail/mail.types.ts` (4 IDs nuevos), `src/common/mail/mail.service.ts` (4 métodos), `src/modules/vehicle-claims/listeners/**`.

| Template | Disparador | Destino |
|---|---|---|
| `vehicle_claim_invitation` | `vehicle-claim.invited` (sólo si F-11 se aprueba; hoy **no** se envía el link por mail) | propietario con cuenta |
| `vehicle_claim_workshop_notification` | `verify-failed`, `claimed`, `blocked`, `manual-review`, `revoked(max_attempts)` | taller |
| `vehicle_claim_blocked_owner` | `vehicle-claim.blocked` | titular activo |
| `vehicle_claim_result` | `vehicle-claim.claimed` / `revoked` | reclamante |

**Reglas duras:**
- El mail **nunca** transporta el link de reclamo (sólo WhatsApp manual/QR). Excepción: F-11, hoy abierta → **no implementar** hasta confirmación.
- Sin `Workshop.email` → skip con `logger.warn`, sin excepción.
- Sin PII en logs; sin token/hash.
- `MailService.send()` es la frontera de error: un fallo de mail no revierte nada.

**Dependencia de contenido:** este PR **no puede** mergearse sin `docs/specs/vehicle-claim-copy.md` (P-2) aprobado. El código puede escribir los métodos con placeholders y el copy entra en el mismo PR.

---

## 10. C-5 — Hook `care-episode.closed`

**Archivo:** `src/modules/vehicle-claims/listeners/care-episode-closed.listener.ts`

```ts
@OnEvent('care-episode.closed', { async: true })
async handle(event: CareEpisodeClosedEvent) {
  try {
    await this.createClaimInviteHandler.executeFromClose({
      vehicleId: event.vehicleId,
      workshopId: event.workshopId,
      careEpisodeId: event.careEpisodeId,
    });
  } catch (err) {
    this.logger.error({ careEpisodeId: event.careEpisodeId, err }, 'claim invite on close failed');
  }
}
```

**Reglas (D-TL-VC-9):**
- Invite activo → no hacer nada.
- Titular activo → no hacer nada (no 409: es un evento, no una request).
- `revoked` / `claim_blocked` → no hacer nada.
- `expired` → reactivar (rotar token+hash, QR nuevo).
- Sin invite → crear, leyendo `VehicleOwnerContact` activo para `ownerPhone`.

**Test crítico:** dos cierres sobre el mismo vehículo producen **un** invite; el fallo del listener no altera el `CareEpisode` (ya `delivered`).

---

## 11. C-6 — Admin y métricas

**Estado (tras implementación en `b263cef`):**

- ✅ `meta.counts` por estado en `GET /api/vehicle-claims`, con `status` **efectivo** (incluye `expired` calculado) — **YA IMPLEMENTADO** (`list-claims.handler.ts` + `WorkshopClaimListMeta.counts`). **No tocar.**
- ✅ `POST /api/admin/vehicle-claims/:id/revoke` — **implementado** (F-8: endpoint nuevo con permiso dedicado; contract en §11.1). Build verde + suite completa en verde (124 suites / 1244 tests según revisión). **No bloquea el piloto.**
- ⬜ **Pendiente menor:** spec de reflexión del endpoint admin (§11.3, segundo bullet).

### 11.1 Contrato del endpoint admin

| Campo | Valor |
|---|---|
| Método/path | `POST /api/admin/vehicle-claims/:id/revoke` (global prefix `api`) |
| Guards | `JwtAuthGuard` (clase) + `PermissionsGuard` + `@Permissions('admin.vehicle-claims.manage')` por método — patrón de `administration.controller.ts`. **Sin** `ContextGuard`, **sin** `WorkshopOnlyGuard`, **sin** contexto WORKSHOP |
| `@HttpCode` | `HttpStatus.OK` **obligatorio** — los `POST` de ese controller no lo declaran hoy y responderían 201 |
| Request | `{"reason":"texto"?}` → DTO `RevokeClaimDto` **reutilizado** (trim, ≤500; **no se persiste** — no hay columna de texto libre) |
| 200 | `{"data":{"status":"revoked","reason":"by_admin","ownershipUndone":true\|false}}` |
| 404 | id inexistente → `CLAIM_NOT_FOUND_MESSAGE`. **Sin scoping por taller**: el admin ve cualquier invite |
| 409 | `manual_review` → `CLAIM_MANUAL_REVIEW_REJECT_MESSAGE` (ver §11.4); `expired`/`revoked`/`claim_blocked` o carrera → `CLAIM_UNAVAILABLE_MESSAGE` |
| Ownership | Igual que el taller: `claimed` + `ownership_created` → cierra el ownership en la misma transacción (`acquiredByClaimInviteId`, `endsAt:null`) → `ownershipUndone:true`; `already_owner` → `false` |
| Evento | `vehicle-claim.revoked` con `reason:'by_admin'` → el listener C-4 tiene case `by_admin` → **sin mail** (solo warn). Auditoría: `revokedByUserId = id del admin` |
| Estado efectivo | Se evalúa con `effectiveClaimStatus` (expiración lazy): un invite vencido aunque la fila diga `pending` cae en 409 |

> **Nota de AuthZ (verificado en `permissions.guard.ts`):** sin `ContextGuard`, `PermissionsGuard` cae en su fallback de scope (`workshopId = params.id` → acá el `:id` del invite, que **no** matchea ningún `workshopMember`). Efecto: el permiso **solo** puede venir de system roles (el bypass de `super_admin` funciona igual). Por eso la clave vive en el módulo `admin` del seed y jamás en `systemWorkshopRolePermissions`.

### 11.2 Archivos a tocar — estado: implementados en `b263cef`

1. ✅ **`prisma/seed.ts`** — entrada en el array `permissions`:
   `{ module: 'admin', resource: 'vehicle-claims', action: 'manage', code: 'admin.vehicle-claims.manage', description: 'Manage vehicle claim invites (admin revoke)' }` (catálogo declarativo) **+** función autocontenida **`seedAdminVehicleClaimPermission()`** invocada en `main()`: upsert por `code` del permiso + link **solo a `super_admin`**. *Desvío aprobado:* el contrato original decía "upsert en `seedPermissions()`", pero `seedPermissions()`/`seedSystemRoles()` están **comentados en `main()`** (`prisma/seed.ts:5143-5144`) — ahí el permiso nunca llegaría a la BD; la función propia sigue el patrón activo (`seedCareEpisodeClosePermission`, `seedVehicleClaimPermissions`). **No** se asigna a `systemWorkshopRolePermissions` ni (MVP) a `systemRolePermissions.admin` — consistente con `admin.vehicles.list/read`. Tras `npm run db:seed`, `PermissionCache` TTL 5 min (reiniciar o esperar antes del smoke).
2. ✅ **`src/modules/vehicle-claims/commands/revoke-claim/revoke-claim.command.ts` + `.handler.ts`** — implementado con **unión discriminada** `RevokeClaimContext` (`{type:'workshop', workshopId}` | `{type:'admin'}`); el 2º parámetro del command acepta `string | RevokeClaimContext` (compat con el call site del taller, que sigue pasando `ctx.workshopId`). El handler: `findScoped(id, workshopId: string | null)` → `where: workshopId ? {id, workshopId} : {id}`; `revokeReason` y evento según `command.context.type`. Sin lógica duplicada; los 409 (incluida la guarda de carrera con el `workshopId` de la fila) y el deshace de ownership quedan idénticos para ambos contextos.
3. ✅ **`src/modules/administration/controllers/administration.controller.ts`** — `@Post('vehicle-claims/:id/revoke')` + `@HttpCode(HttpStatus.OK)` + `@UseGuards(PermissionsGuard)` + `@Permissions('admin.vehicle-claims.manage')`, inyectando `RevokeClaimHandler` y construyendo `new RevokeClaimCommand(id, { type: 'admin' }, currentUser.id, dto.reason ?? null)`.
4. ✅ **`src/modules/administration/administration.module.ts`** — **opción A** (la recomendada): `RevokeClaimHandler` registrado en `providers` (precedente `ListRolesHandler`); sin `exports` en `VehicleClaimsModule`.

**No tocar (verificado):** schema/migración (no hay columnas nuevas), `meta.counts`, el controller del taller, `docs/specs/vehicle-claim-copy.md`.

### 11.3 Tests esperados — estado

- ✅ **`revoke-claim.handler.spec.ts`:** bloque `contexto admin (C-6 / F-8)` con 4 tests — lookup solo por `id` + 404; `revokeReason:'by_admin'` en `updateMany` (guard de carrera conserva el `workshopId` de la fila) + respuesta `reason:'by_admin'` + evento `reason:'by_admin'`; 409 en `manual_review` sin emitir; `ownershipUndone:true` en `claimed/ownership_created`. Los 10 tests `by_workshop` existentes intactos. Regresión: suite completa **124 suites / 1244 tests en verde** (revisión `b263cef`).
- ⬜ **FALTA — spec de reflexión del camino admin** (patrón de `vehicle-claims.controller.spec.ts`, que ya usa `GUARDS_METADATA`/`HTTP_CODE_METADATA`): permiso `admin.vehicle-claims.manage` en el método; `@HttpCode` = 200; guards = `PermissionsGuard` y **no** `WorkshopOnlyGuard` (admin sin membresía WORKSHOP puede ejecutarlo). *Los tests de handler no cubren los decoradores del controller: sin este spec nada impide que un cambio futuro quite el `@HttpCode` (pasaría a 201) o agregue `WorkshopOnlyGuard` (bloquearía al admin sin contexto WORKSHOP, el bug anti-bypass D-024 A2 que el endpoint busca evitar).*
- Cubiertos por los tests de handler (no hacen falta a nivel controller): 404 id inexistente, 409 `manual_review`, body 200 exacto (`status`/`reason`/`ownershipUndone`).
- 403 sin permiso / bypass `super_admin`: comportamiento genérico de `PermissionsGuard` — **no tiene spec propio** (`src/common/guards/permissions.guard.spec.ts` no existe); opcional cubrirlo junto con el spec de reflexión.
- **`npm test`** verde (regresión §13.3) ✅.

### 11.4 PENDIENTE DE DECISIÓN (producto) — revoke admin sobre `manual_review`

- **Qué sabemos:** el handler devuelve 409 `CLAIM_MANUAL_REVIEW_REJECT_MESSAGE` ("usá Rechazar") en `manual_review`; el cierre canónico es `POST /:id/reject` del taller (`vehicle-claim.review`, T12) y el admin **no** tiene endpoint `reject` propio.
- **Qué no sabemos:** si HCDV debe poder cerrar un `manual_review` desde el endpoint admin (el argumento de F-8 — taller inactivo/sin miembros — aplica también acá).
- **Recomendación (no resuelta acá):** mantener el **409** en C-6 (paridad de reglas; el evento `manual_review_rejected` + mail es responsabilidad del taller) y, si producto lo pide, agregar `POST /api/admin/vehicle-claims/:id/reject` con el mismo permiso en un PR posterior. Detalle en `vehicle-claim-technical-design.md` §5.3.

---

## 12. Cambios sobre archivos existentes (mapa único)

| Archivo | PR | Cambio |
|---|---|---|
| `prisma/schema.prisma` | B-1, C-1 | Modelos/enums nuevos + relaciones |
| `prisma/migrations/<A>/migration.sql` | B-1 | **4 tablas** (`vehicle_owner_contacts`, `service_types`, `service_type_specialties`, `care_episode_service_types`) + **9 columnas** (2 en `vehicles`, 7 en `care_episodes` con `close_notes`) + **1 enum** (`VehicleContactStatus`) + CHECK XOR + índice parcial |
| `prisma/migrations/<B>/migration.sql` | C-1 | 3 tablas + 6 enums + FK ownership + índice parcial |
| `prisma/seed.ts` | B-1, C-1, C-6 | 14 tipos + 16 vínculos + `care-episode.close` + 4 permisos de reclamo + **1 permiso admin** `admin.vehicle-claims.manage` vía `seedAdminVehicleClaimPermission()` — link solo `super_admin` (C-6, §11.2) |
| `package.json` | C-1 | `qrcode` en `dependencies` + `@types/qrcode` en `devDependencies` (confirmado por el review) |
| `.env.example` | B-1 | `DEFAULT_PHONE_COUNTRY_CODE=+54` junto al resto de las variables |
| `src/config/envs.ts` | B-1 | `DEFAULT_PHONE_COUNTRY_CODE` con default `+54` |
| `src/app.module.ts` | C-2 | Bucket `vehicleClaimToken`; registrar `VehicleClaimsModule` |
| `src/common/authorization/vehicle-access.service.ts` | B-2 | Pata `care_episodes` en el UNION |
| `src/modules/care-episodes/care-episodes.module.ts` | B-2, B-3 | Handlers nuevos + `MailModule`/`StorageModule` si el cierre los usa (hoy son globales) |
| `src/modules/care-episodes/controllers/care-episodes.controller.ts` | B-2, B-3 | `POST check-in`, `GET service-types`, `POST :id/close` (orden: rutas estáticas antes de `:id`) |
| `src/modules/care-episodes/events/` | B-3 | `care-episode-closed.event.ts` |
| `src/common/mail/mail.types.ts` | C-4 | 4 IDs nuevos |
| `src/common/mail/mail.service.ts` | C-4 | 4 métodos |
| `src/modules/administration/controllers/administration.controller.ts` | C-6 | `POST vehicle-claims/:id/revoke` con permiso dedicado (F-8 decidida — contrato §11.1) |
| `src/modules/administration/administration.module.ts` | C-6 | Disponibilizar `RevokeClaimHandler` (§11.2, opción A o B) |
| `src/modules/vehicle-claims/commands/revoke-claim/revoke-claim.command.ts` + `.handler.ts` | C-6 | Unión `RevokeClaimContext` (2º parámetro `string \| RevokeClaimContext`): lookup sin `workshopId` para admin + motivo `by_admin` (§11.2); sin regresión del caller del taller |
| `src/common/vehicles/vehicle-display-name.ts` | B-1 | **nuevo** helper de fallback |
| `src/modules/vehicles/queries/lookup-vehicle/lookup-vehicle.handler.ts` | B-1 | Consumidor del fallback (`:52-53`): usar `resolveVehicleDisplayName` |
| `src/modules/care-episodes/queries/get-care-episode/get-care-episode.handler.ts` | B-1 | Consumidor del fallback (`:156-157`): marca/modelo aunque no haya versión de catálogo |
| `src/modules/vehicles/queries/get-vehicle-history/get-vehicle-history.handler.ts` | B-1, B-3 | Consumidor del fallback + extender el `select` (`:78-94`) con `mileageOut`, `closedAt` y `serviceTypes` |
| `src/common/phone/phone.util.ts` | B-1 | **nuevo** helper E.164 |

**No se toca:** `POST /api/vehicles` (alta personal), `POST /care-episodes/owner`, `POST /care-episodes/:id/verify`, la cola de verificaciones, `CareEpisodeStatus` (no se agregan estados).

---

## 13. Tests

### 13.1 Los 3 críticos (D-178)

| Test | Archivo | Qué verifica |
|---|---|---|
| Guard `updateMany` | `commit-claim.handler.spec.ts` | Dos commits concurrentes → uno 200, uno 409; `usedAt` una sola vez |
| Atomicidad del check-in | `check-in.handler.spec.ts` | Fallo en `careEpisode.create` → no queda `Vehicle` |
| Contrato GET pre-verificación | `vehicle-claim-public.controller.spec.ts` | El body tiene **exactamente** `status` y `canVerify`; agregar un campo rompe el test |

### 13.2 Suites nuevas (mínimas por PR)

- **B-2:** check-in (placa nueva/existente, VIN 409 x2, teléfono opcional, tipos ≤3, odómetro XOR), `assertWorkshopVehicleAccess` con `care_episodes`.
- **B-3:** close (409 doble cierre, odómetro ilegible sin/con foto, evento post-commit).
- **C-2:** máquina de estados (T1..T20), anti-enumeración (4 fallos byte-idénticos), lock/lockout/auto-revoke, expiración lazy, ticket vencido.
- **C-3:** create idempotente/reactivación, `link` sólo en creación, revoke con `ownershipUndone`, scoping 404.
- **C-4:** listener sin `Workshop.email` → skip; sin token en logs.
- **C-5:** dos cierres → un invite; fallo del listener no revierte.
- **C-6:** revoke admin (`by_admin` sin scoping de taller, permiso `admin.vehicle-claims.manage`, 200/403/404/409, `@HttpCode` 200, `ownershipUndone`) — ver §11.3.

### 13.3 Regresión obligatoria

`npm test` completo verde. En particular: `care-episodes.controller.spec.ts`, los 5 specs de comandos de `care-episodes`, `get-care-episode.handler.spec.ts`, `get-vehicle-history.handler.spec.ts`, `vehicles.controller.spec.ts`.

---

## 14. Orden, paralelización y estimación relativa

```
B-1 ──┬─▶ B-2 ──┐
      └─▶ B-3 ──┤
                ├─▶ C-1 ──▶ C-2 ──▶ C-3 ──┬─▶ C-4
                │                          ├─▶ C-5
                │                          └─▶ C-6 (opcional)
                └──────────────────────────▶ C-7 (fuera del piloto)
```

- **B-1** es cuello de botella: todo depende de la migración.
- **B-2 y B-3** pueden ir en paralelo si comparten el contrato de tipos (B-3 no depende de B-2).
- **C-1** puede empezar en paralelo a B-2/B-3 (sólo depende de B-1).
- **C-2 y C-3** en serie; **C-4 y C-6** en paralelo a **C-5**.
- **C-5** exige B-3 y C-3 mergeados.

**Estimación relativa (no fechas):** B-1 = M; B-2 = L; B-3 = M; C-1 = M; C-2 = XL; C-3 = L; C-4 = M; C-5 = S; C-6 = S.

---

## 15. Riesgos técnicos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **R-9 — cierre sin listener** | Cierres del piloto sin invite, silencioso | C-5 en el mismo release que B-3; test de dos cierres |
| **R-11 — `DEFAULT_PHONE_COUNTRY_CODE` requerida** | Todos los entornos rompen al arrancar | `.default('+54')`, nunca `.required()`; test de arranque sin la var |
| **Índice parcial con estados en mayúscula** | El `CREATE UNIQUE INDEX` falla al castear literales que no existen en el enum | Literales en lowercase (`pending`, …); verificar `pg_indexes` + `pg_enum` |
| **`P2002` de `vehicle_ownerships_one_active_primary` en el commit** | El commit falla con 500 si el vehículo ya tiene titular | Traducir a `claim_blocked` (T9) sin cerrar ownership; el cierre de ownership pertenece sólo al revoke |
| **`licensePlate @unique` sin normalizar** | Dos vehículos para la misma placa | Normalizar antes de buscar; test de doble check-in |
| **Doble submit concurrente con placa nueva** | `P2002` no capturado → 500 | Capturar `P2002` sobre `license_plate`, re-leer y continuar; test de concurrencia |
| **Vehículo soft-deleted reutilizado** | Episodio colgado de un vehículo dado de baja | 409 explícito; no resucitar ni crear otro; test |
| **Throttle por token con `req.params` undefined** | 500 en el guard | Fallback a IP; test |
| **Fuga de token en logs** | Compromiso del link | Revisión de logs en code review; nunca pasar el token al logger |
| **`CareEpisodesModule` sin `VehiclesModule`** | El check-in no puede reutilizar handlers de vehículo | El comando usa `PrismaService` directo (no necesita el módulo) |

---

## 16. Puntos que requieren decisión antes de codear

| ID | Punto | Veredicto del Tech Lead (2026-11-01) |
|---|---|---|
| `D-TL-B1` | Ruta del check-in: `POST /care-episodes/check-in` vs extender `POST /care-episodes` | **CONFIRMO** endpoint nuevo: no rompe contrato y no colisiona con `@Post()` ni `@Post(':id/verify')` |
| `D-TL-B2` | ¿Abrir `RegisterVehicleHandler` a WORKSHOP o crear el vehículo en el comando de check-in? | **CONFIRMO** crear en el comando (menor superficie) |
| `D-TL-B3` | ¿`GET /care-episodes/service-types` o en `vehicle-catalog`? | **CONFIRMO** `care-episodes`, ruta estática antes de `@Get(':id')` |
| `D-TL-B4` | ¿Flag `odometerReplaced` o `closeNotes`? | **CONFIRMO CON CAMBIO:** `closeNotes` como columna nueva (migración A) |
| `D-TL-B5` | ¿`closedByMemberId` en el schema? | **CONFIRMO** (auditoría, `onDelete: Restrict`) |
| `D-TL-C1` | Throttle de `challenge`: 5/300s (diseño) vs 10/min (discutido) | **CONFIRMO 5/300s**; el 10/60s es sólo el bootstrap. No se corrige el documento |
| **P-2** | Copy de página pública + mails | ✅ **APROBADO 2026-11-01** — `docs/specs/vehicle-claim-copy.md` |
| **F-8** | Revocación por super_admin: endpoint nuevo vs impersonación | ✅ **RESUELTA → endpoint nuevo** con permiso dedicado `admin.vehicle-claims.manage` — contrato en §11 y `vehicle-claim-technical-design.md` §5.3 |
| F-7 / F-9 / F-11 | Ver `01-scope-acceptance.md:144-172` | Todas tienen recomendación; ninguna bloquea B-1..C-3 salvo F-11 (mail de invitación) |

---

## 17. Definition of Done global

Un PR se considera terminado cuando:

1. `npm run build` verde (incluye `db:generate`).
2. `npm test` verde, con los specs nuevos del PR.
3. Migración aplicada en dev con `npm run db:migrate` y **re-ejecutable** el seed.
4. Ningún `TODO` sin issue; ningún `console.log`.
5. Sin secretos, tokens ni PII en logs.
6. Contratos de respuesta documentados en el código (comentario de cabecera del DTO/controller, patrón `src/types/invitation.ts:1-21`).
7. Si toca permisos: seed actualizado y probado en una BD limpia.
8. Si toca un endpoint existente: el spec de regresión sigue verde.

---

## 18. Cierre

El backend del MVP se puede resumir en **dos migraciones, un comando de check-in, un comando de cierre, un módulo nuevo y un listener**. Todo lo demás (mail, storage, guards, throttler, eventos) ya existe y se reutiliza.

Lo que **no** se puede comprimir: la migración (B-1) y el cierre (B-3), porque sin ellos el GTM "taller primero" no genera el historial ni el invite. El resto es secuencia.
