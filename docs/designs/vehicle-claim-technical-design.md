# Diseño Técnico: Módulo de reclamos de vehículos (Vehicle Claim)

> **Autor:** Tech Lead — HCDV
> **Fecha:** 2026-10-31 (última actualización: 2026-11-01 — decisiones S-1, S-2, F-1, F-2, F-4, F-5, F-6, F-12 y paquete final F-3, S-3, F-10 + aviso pasivo + disputa aplicados)
> **Basado en:** decisiones del fundador sobre reclamos de vehículos (2026-10-31, D-VC-1..D-VC-10), `docs/specs/vehicle-register-flow.md` (D-037/D-042 normalización de patente), `docs/specs/care-episode-create-flow.md` (lookup por patente, guards WORKSHOP-only, Throttler add-on), `docs/specs/workshop-checkin-flow.md` (cierre de atención: comando `close`, evento `care-episode.closed` con payload mínimo, tabla `VehicleOwnerContact`), ADR-008 (sin `@nestjs/cqrs`), ADR-005 (política de borrado), ADR-003 (motor de permisos).
> **Estado:** BORRADOR PARA REVISIÓN DEL FUNDADOR / SECURITY. No implementar hasta aprobación (§10 lista las decisiones abiertas).
> **Nota de verificación:** todos los datos de schema/código citados fueron verificados en el repo al 2026-10-31 (ver §3.2 — hay una corrección importante respecto de un supuesto de partida).

---

## 0. Resumen ejecutivo

Módulo nuevo `src/modules/vehicle-claims/`: al **primer cierre** de una atención del vehículo se genera un **link de reclamo de un solo uso (7 días, revocable)** —nunca en cierres posteriores (decisión del fundador 2026-10-31)— y el taller lo envía al propietario por WhatsApp (`wa.me` manual, sin API) o lo muestra como QR. El propietario abre el link y **no ve absolutamente nada hasta verificar la patente (+ un segundo factor si existe)**. El primer reclamo gana; hay mitigación explícita de claim squatting.

1. **Schema:** modelos nuevos `VehicleClaimInvite` + `VehicleClaimAttempt`, enums de estado, índice único parcial "un invite activo por vehículo" (SQL manual, patrón D-079/D-155), y FK aditiva nullable `VehicleOwnership.acquiredByClaimInviteId` (espejo de `acquiredByTransferId`) para poder **deshacer** un reclamo y devolver el vehículo a "sin titular".
2. **API pública (token, sin JWT):** `GET /api/vehicle-claims/public/:token` (bootstrap que **no expone ningún dato del vehículo**), `GET .../challenge` (rangos de odómetro, solo sin VIN), `POST .../verify` (devuelve **ticket** de vida corta), `POST .../commit` (consumo del single-use) — patrón `wizard.controller.ts` / `vehicle-transfer-qr-public.controller.ts` (sesión opcional resuelta del cookie, `@Throttle` por ruta).
3. **API autenticada (taller):** generate/list/detail/revoke/approve/reject con `JwtAuthGuard + ContextGuard` (clase) y `WorkshopOnlyGuard + PermissionsGuard` (método, permisos nuevos `vehicle-claim.*` en seed). Revoke de un reclamo ya consumido **cierra el ownership creado** (devuelve "sin titular").
4. **Estados:** los 5 del fundador (`pending`, `verification_required`, `claimed`, `expired`, `revoked`) + `claim_blocked` + los agregados `verified` y `manual_review` (control de intentos fallidos por contador, no por estado).
5. **Notificaciones:** eventos `vehicle-claim.*` post-commit + `MailService` existente (mail al taller en cada reclamo/intento fallido; al titular activo cuando hay intento bloqueado; al reclamante como resultado). WhatsApp es **manual vía `wa.me`** — no hay SMS ni WhatsApp Business API en el repo.
6. **Sin CQRS ni cron** (única dependencia nueva: `qrcode`, para generar el QR persistido — S-1): expiración lazy al acceso (precedente: side-effect de expiración en `preview-transfer-qr`, H-23). El token se guarda **hasheado** (SHA-256) y el QR vive como imagen en R2.

---

## 1. Objetivo y no-objetivos

### 1.1 Objetivos

- Que el taller pueda **invitar a un propietario a reclamar su vehículo** al **primer cierre** de una atención (los cierres posteriores no generan ni regeneran link), con un link de un solo uso, expiración de 7 días y revocación.
- Que el propietario **verifique su vínculo con el vehículo antes de ver cualquier dato** (patente + segundo factor cuando exista; si no existe → revisión manual, nunca aprobación automática).
- Que el historial quede **del lado del vehículo** y el taller participe para marcar un diferencial y expandir su red de propietarios (el piloto se mide por reclamos de propietarios).
- Mitigar **claim squatting** (primer reclamo gana): notificación al taller en cada reclamo, log de intentos, y revocación que devuelve el vehículo a "sin titular".
- Bloquear y registrar intentos de reclamo sobre vehículos con **titular activo**, notificando al titular y al taller.

### 1.2 No-objetivos (fuera de alcance, explícitos)

- **No** hay OTP, SMS, WhatsApp Business API ni login/recuperación por celular. `User.phone` es dato de contacto, **no factor de autenticación** (D-VC-8; verificado: `prisma/schema.prisma:16` `phone` opcional, sin unique ni E.164, y no existe infra OTP en `src/modules/auth`).
- **No** se modifica el modelo de usuario, el registro (F-010), los flujos de transferencia/consignación QR ni `VehicleAccess`.
- **No** se aprueba un reclamo solo con patente cuando existe dato verificable (la patente no es un secreto — D-VC-3).
- **No** se expone nada del vehículo antes de la verificación (D-VC-4 — el control más importante del diseño).
- **No** se introduce `@nestjs/cqrs` (ADR-008), outbox, workers ni cron: eventos in-process (`@nestjs/event-emitter`) y expiración lazy.
- **No** se implementa perfil de confianza / scoring de propietarios (P2-5 diferido) ni métricas avanzadas de piloto (se mide con el listado + contadores, §5.4).
- **No** agrega texto libre de marca/modelo a `Vehicle` este módulo: D-038 quedó **parcialmente enmendado** por `docs/specs/workshop-checkin-flow.md` §7.3.1 (`brandName`/`modelName` solo en alta desde taller; F-010 personal queda como estaba); la hidratación de mails/panel usa el fallback de 3 niveles `version → brandName/modelName → patente` (§3.2).

### 1.3 Decisiones del fundador recibidas (referencia cruzada D-VC-1..10)

| ID | Decisión | Dónde se materializa |
|---|---|---|
| D-VC-1 | Link de **un solo uso**, **expira en 7 días**, **revocable** por taller o admin | §4 (T7/T11/T14/T15), §6.1, §6.2, F-8 |
| D-VC-2 | Verificar **patente**; reforzar con **últimos 4 del VIN si hay VIN registrado y capturado — y solo ese factor** (F-2: el VIN excluye al odómetro); si no hay VIN → **odómetro por multiple choice** de rangos (F-3); **sin dato verificable → revisión manual**, nunca aprobación solo | §4 (T5/T6), §6.6, AC-25 |
| D-VC-3 | La patente **no es un secreto**: es fricción; la defensa real es **no exponer nada antes de verificar** | §5.1, §6.5, AC-3 |
| D-VC-4 | Antes de verificar, la página de reclamo **no muestra absolutamente nada** ("Reclamá tu vehículo") | §5.1 contrato crítico, AC-3 |
| D-VC-5 | Claim squatting: primer reclamo gana → **notificación al taller en cada reclamo** + **revocación que devuelve a "sin titular"** | §4 (T13), D-TL-VC-11, §7, AC-17 |
| D-VC-6 | Vehículo con **titular activo** → reclamo bloqueado, intento registrado, notificación al titular y al taller; sin estado de reclamo de adquisición | D-TL-VC-12, §4 (T9), AC-11 |
| D-VC-7 | Estados `pending/verification_required/claimed/expired/revoked` + `claim_blocked` + control de intentos fallidos | D-TL-VC-5, §6.4 |
| D-VC-8 | El celular es **dato de contacto, no factor de autenticación** (sin OTP; el token del link es la posesión) | §1.2, §6.7, AC-19 |
| D-VC-9 | La invitación se genera **solo al primer cierre de una atención** (evento `care-episode.closed`; cierres posteriores no generan ni regeneran — precisión del fundador 2026-10-31); si el dueño ya es usuario, el link es atajo a su historial | D-TL-VC-9 (§2), T1/T18, AC-22/AC-24 (F-1/F-6 resueltas: se omite si hay titular activo; el POST manual se conserva) |
| D-VC-10 | Taller **confirma el celular antes de enviar** (mostrar número, reenviar) y el link queda visible como **QR** de respaldo | D-TL-VC-10, AC-6 |

---

## 2. Decisiones técnicas

Formato del proyecto. Cada decisión cierra un ítem de las decisiones del fundador.

---

### D-TL-VC-1 — Módulo nuevo `vehicle-claims`, sin repository, handlers con `execute()`

**Decisión:** módulo nuevo `src/modules/vehicle-claims/` (controllers + commands/queries + dto + events + listeners), registrado en `src/app.module.ts`. Los handlers usan `PrismaService` directo y `$transaction` en los writes (patrón `care-episodes` + `wizard-claim`). Sin `*_REPOSITORY` (no hay segundo backend ni concurrencia de consumidores que justifique el token de inyección).

**Justificación:**
- Es el patrón vigente para módulos nuevos (`care-episodes`, `dealerships/wizard`): commands/queries livianos con `execute()`, ADR-008 intacto.
- El claim toca 3 agregados (invite, ownership, attempt) en una sola transacción — igual que `WizardClaimHandler` (una `$transaction`, guards `updateMany`).

**Impacto:** archivo nuevo en `app.module.ts` (imports), sin tocar módulos existentes salvo seed y `mail.*`.

---

### D-TL-VC-2 — Una sola fila `VehicleClaimInvite`; el reclamo es la transición de esa fila

**Decisión:** no existe una entidad `Claim` separada. La invitación **es** el portador del ciclo de vida del reclamo (token, estados, intentos, claimant). El log de intentos vive en una tabla separada `VehicleClaimAttempt`.

**Justificación:**
- Mismo razonamiento que D-TL-3 (dealership): una sola fila con `tokenHash unique` (S-1: en BD solo el hash SHA-256) evita sincronizar dos filas que pueden divergir (invite pending + claim viejo), y simplifica single-use y expiración.
- El fundador pidió "log de intentos" (D-VC-7) y "se registra el intento" (D-VC-6): eso es una tabla de auditoría append-only, no estado.

**Impacto:** 2 tablas nuevas; ninguna modificación a modelos existentes obligatoria (§3.2).

---

### D-TL-VC-3 — Token: `randomBytes(32).toString('hex')` (256 bits); en BD solo su **hash SHA-256**; QR persistido en R2 (S-1, decidido)

**Decisión (S-1, fundador 2026-11-01):** el token sigue siendo de 64 chars hex generados con `randomBytes(32)` (mismo generador que `request-password-reset.handler.ts:38` e `invite-platform-user.handler.ts:126`), pero **en BD solo se persiste su hash** `sha256(token)` en `VehicleClaimInvite.tokenHash` (`@unique @db.VarChar(64)`). Los endpoints públicos **hashean el token entrante y buscan por hash** (SHA-256 es determinista: `failedAttempts`, throttling por token §6.3 y single-use siguen funcionando igual). Precedente del repo de la variante hash: `PasswordReset.tokenHash`, `UserInvitation.tokenHash`, refresh tokens (`token-hash.util.ts`).

**Re-display sin conservar el token crudo (D-VC-10 intacto):** al crear el invite, el backend genera la **imagen del QR** (nueva dependencia liviana `qrcode`, solo encoder), la sube con el storage existente (`StorageR2Service.upload()` — `src/common/storage/storage-r2.service.ts`, módulo global `StorageModule`) y guarda la referencia `qrObjectKey` en la fila. El panel **re-muestra la imagen** del QR vía URL firmada corta (`getSignedUrl`), **nunca el token ni el link en texto**. El hash, por lo tanto, no rompe el re-display: la imagen persistida es el portador re-mostrable del link.

**Entrega del link en claro (trade-off documentado):** la respuesta de `POST /api/vehicle-claims` devuelve `link` + `whatsappUrl` **una sola vez** (creación, sobre HTTPS, al miembro autenticado con `vehicle-claim.create`); el detalle del invite ya **no** los devuelve (solo `qrImageUrl`). Consecuencia aceptada: tras un refresh el taller puede re-mostrar el QR pero **no** reenviar el texto del link por WhatsApp desde el panel — si necesita el texto de nuevo, revoca y genera un invite nuevo (que rota todo). A cambio, el token en claro jamás toca BD, logs ni eventos.

**Aclaración obligatoria (S-1):** el hash **no** evita la filtración por **URL** — logs de proxy/apigateway, historial del navegador y el header `Referer` pueden exponer `/reclamo/<token>` aunque la BD esté hasheada. Por eso el single-use, la expiración de 7 días y el rate-limit por IP y por token (§6.3) siguen siendo controles **independientes e igual de necesarios**: el hash solo elimina el valor del token en un volcado de BD.

**Regla de logs:** ni el token crudo ni su hash se loguean (patrón de los listeners de dealerships: correlacionar por `inviteId`).

---

### D-TL-VC-4 — Dos controllers: público (`vehicle-claims/public/*`) sin JWT + autenticado (`vehicle-claims/*`)

**Decisión:**

| Controller | Prefijo | Auth |
|---|---|---|
| `VehicleClaimPublicController` | `api/vehicle-claims/public` | **Sin** `JwtAuthGuard` a nivel clase; autorización = posesión del token + `ThrottlerGuard` por ruta |
| `VehicleClaimsController` | `api/vehicle-claims` | `@UseGuards(JwtAuthGuard, ContextGuard)` clase + `WorkshopOnlyGuard, PermissionsGuard` método |

**Justificación:**
- Precedente directo: `vehicle-transfer-qr-public.controller.ts` y `wizard.controller.ts` (controllers separados, sin JWT en clase, token como autorización, throttle por ruta).
- El prefijo `public/:token` **evita la colisión de rutas**: `GET /vehicle-claims/:id` (autenticado, detalle) y `GET /vehicle-claims/:token` (público) serían la misma ruta; con el prefijo explícito no hay ambigüedad (misma técnica que `vehicles/transfer/qr/:token` vs `vehicles/:id`).
- `POST /public/commit` resuelve la sesión **opcional** desde el cookie `access_token` con `jwtService.verify` sin lanzar (copia del método `resolveSessionUserId` de `wizard.controller.ts:63-72`): si no hay sesión válida → `401 AUTH_REQUIRED` y el frontend redirige a `/register` o `/login` existentes preservando el `next` (F-10: el registro/login **se reusa**, no se duplica).

**Guard order autenticado (verbatim del módulo care-episodes):** `JwtAuthGuard` + `ContextGuard` (clase) → `WorkshopOnlyGuard` → `PermissionsGuard` (método). `WorkshopOnlyGuard` **antes** de `PermissionsGuard` (anti-bypass D-024 A2).

---

### D-TL-VC-5 — Estados: semántica del fundador en minúscula (convención del repo) + 3 agregados

**Decisión:** enum `VehicleClaimStatus` con los estados del fundador escritos en la convención del schema (todos los enums del repo son lowercase: `CareEpisodeStatus { open delivered cancelled }`, `QrStatus { pending consumed expired revoked }`):

```prisma
enum VehicleClaimStatus {
  pending                 // creada, link no abierto
  verification_required   // abierta / requiere verificación (o en reintento fallido)
  verified                // AGREGADO: verificación completa, falta vincular cuenta y comprometer
  manual_review           // AGREGADO: patente ok, sin dato verificable → revisión del taller (D-VC-2)
  claimed                 // terminal, single-use consumido
  claim_blocked           // AGREGADO (sugerido): intento sobre vehículo con titular activo (D-VC-6)
  expired                 // terminal
  revoked                 // terminal (taller, admin o sistema)
}
```

**Justificación de los agregados:**
- `verified`: D-VC-4 (nada pre-verificación) + D-VC-8 (la cuenta es obligatoria para crear el ownership) implica una etapa entre "verificó" y "comprometió el claim con su sesión". Sin este estado habría que re-verificar después del login (fricción) o meter la verificación en `verification_required` (pérdida de métrica del piloto: cuántos verificaron).
- `manual_review`: D-VC-2 lo exige literalmente ("el reclamo queda en revisión manual, no se aprueba solo").
- Control de intentos fallidos **no** es un estado: es el contador `failedAttempts` + el lock temporal `verificationLockedAt` (30 min, auto-liberación — F-4) + `lockoutCount` (§6.4). Un estado `LOCKED` agregaría transiciones sin aportar información al panel.

**Rechazado:** estados UPPERCASE en el enum — el fundador los escribió en mayúsculas como nomenclatura de documento; en schema se respetan lowercase por convención del repo. Es un cambio cosmético, se documenta para que el fundador no lo lea como renombre de semántica.

---

### D-TL-VC-6 — Verificación en tiempo real (sin snapshot en la fila) + mensaje único anti-enumeración

**Decisión:** los factores se calculan **al momento de verificar**, leyendo `Vehicle.licensePlate/vin` y la última atención (`CareEpisode.mileageIn`) — no se copian a la invitación.

**Precedencia entre factores (F-2, decidido — el VIN EXCLUYE al odómetro):** si el vehículo tiene VIN registrado (`Vehicle.vin`), el factor de verificación es **los últimos 4 del VIN, y solo eso** (un `mileage` en el body se ignora por completo); si no hay VIN → factor = **odómetro de la última atención vía multiple choice de rangos** (F-3, §6.6); si no hay ninguno → `manual_review` (T6).

**Justificación:**
- Single source of truth: si el taller corrige el VIN (`correct-vin`) o carga kilometraje después de generar el link, la verificación compara contra el dato vigente. Duplicar `vinLast4`/`mileage` en el invite crea dos verdades y guarda un dato "casi-secreto" en una tabla extra.
- El lookup de verificación **nunca consulta otras patentes**: compara `normalize(input) === normalize(invite.vehicle.licensePlate)`. No hay superficie para enumerar placas ajenas.

**Mismo mensaje de error** (400) para: patente inexistente/no coincide, VIN incorrecto, odómetro incorrecto y factor faltante — ver matriz §6.6. El frontend muestra un único copy: *"No pudimos verificar los datos del vehículo. Revisá la patente y los datos ingresados."*

**Normalización de patente:** `trim().toUpperCase()` de ambos lados antes de comparar (D-037 / D-042, verificado en `docs/specs/vehicle-register-flow.md` y `vehicle-edit-flow.md`). VIN: `trim().toUpperCase()`, comparar `slice(-4)`.

---

### D-TL-VC-7 — Expiración lazy (7 días), sin cron

**Decisión:** `expiresAt = createdAt + 7 días`. La transición a `expired` ocurre **al acceso** (GET público / verify / claim): si `expiresAt < now` → se persiste el estado y se responde "no disponible". El listado del taller **calcula** el status efectivo para display (`expiresAt < now && non-terminal → "expired"`), sin depender de que alguien haya accedido.

**Justificación:** no hay scheduler/cron en el repo (`@nestjs/schedule` no está en dependencies); agregar uno para un solo job es infraestructura especulativa. Precedente de side-effect en GET: la expiración del preview de QR (H-23, aceptada en `vehicle-transfer-qr-public.controller.ts:14-17`).

---

### D-TL-VC-8 — Single-use + anti doble-claim: `updateMany` guard + índice único parcial

**Decisión:** tres capas, patrón wizard (D-TL-4):

1. **Guard de transición:** todo commit crítico es `updateMany({ where: { id, status: <origen> }, data: {...} })`; `count === 0` → rollback + `409`. Nunca `update` ciego.
2. **Índice único parcial en BD** (SQL manual en la migración — Prisma 6 no modela índices parciales, precedente D-079/D-155):
   `CREATE UNIQUE INDEX "vehicle_claim_invites_active_unique" ON "vehicle_claim_invites"("vehicle_id") WHERE status IN ('pending','verification_required','verified','manual_review');`
   → un solo reclamo activo por vehículo a nivel BD.
3. **El índice existente `vehicle_ownerships_one_active_primary`** (migración `20261007140000`, D-155: máximo UN ownership primario activo por vehículo) es la última línea: si dos claims concurrentes intentan crear ownership, el segundo recibe `P2002` → se mapea a `claim_blocked` (se relee el titular ganador) en vez de 500.

**Única ventana de doble-creación posible:** dos requests `claim` del mismo token en paralelo → ambos pasan el guard? No: `updateMany` es atómico en Postgres; solo uno obtiene `count=1`.

---

### D-TL-VC-9 — Generación SOLO en el primer cierre (listener `care-episode.closed`); la vía explícita queda como acción manual del taller

**Decisión (fundador, 2026-10-31):** el link se genera **solo en el primer cierre** de una atención del vehículo. El disparador es un listener `@OnEvent('care-episode.closed')` (evento definido en `docs/specs/workshop-checkin-flow.md` §6.3, fase C — comando `close` = B-4). Cierres posteriores **no** generan ni regeneran.

**Contrato consumido (confirmado suficiente):** `{ careEpisodeId, vehicleId, workshopId }`, emitido **post-commit** (spec, AC 8). Es exactamente lo mínimo que el listener necesita: `vehicleId` (destino del invite), `workshopId` (taller generador), `careEpisodeId` (traceabilidad). El consumo es **best-effort**: el fallo del listener **nunca** revierte el cierre (spec CV-16/RF-13; try/catch + log por `careEpisodeId`, patrón `transfer-request-email.listener.ts`).

**Reglas del listener (en este orden, por evento recibido):**

| # | Condición sobre los invites del vehículo | Acción |
|---|---|---|
| 1 | Existe invite **vigente** (no-terminal: `pending`…`manual_review`) | **Nada** (idempotente) |
| 2 | Existe invite `claimed` (cualquier outcome) **o existe titular activo** (ownership primario activo, cualquier origen — transferencia incluida; F-1 decidido) | **Nada** + **aviso explícito** registrado (`skipReason: active_owner`, log por `vehicleId`); el panel muestra "Este vehículo ya tiene titular; no se envió invitación" (AC-24) — nunca silencio |
| 3 | El invite más reciente está `expired` | **Reactivarlo** (T18): mismo `id`, **token + hash nuevos** (rotación — F-12 confirmada), `expiresAt = now + 7d`, contadores en 0 (`failedAttempts`, `lockoutCount`, `verificationLockedAt`), QR regenerado |
| 4 | El invite más reciente está `revoked` o `claim_blocked` | **Nada**: la revocación es una decisión humana y no se deshace sola — requiere **acción explícita del taller** (`POST /api/vehicle-claims`, §5.2) |
| 5 | El vehículo **nunca** tuvo invite (primer cierre) | **Generar** (T1) |

**"Primer cierre" operacionalizado = "nunca tuvo invite"** (la regla 1 cubre la primera generación; los vehículos con cierres previos al lanzamiento del módulo generan en su primer cierre *con* el módulo activo, o por la vía manual).

**Vía explícita conservada (F-6, decidido):** `POST /api/vehicle-claims` (§5.2) **es la única salida** para generar un invite cuando el anterior quedó `revoked` o `claim_blocked` (regla 4), y cubre además vehículos legacy y falla del hook. Delega en las mismas reglas 1-5: no puede crear un segundo invite vigente, ni generar sobre un vehículo ya reclamado, ni sobre uno con titular activo (regla 2 → 409 `active_owner`, AC-24).

**Sin canal de reclamo:** si el registro activo `VehicleOwnerContact` (spec §7.3.3) está `status=unavailable` (o no existe), el invite **igual se genera** en el primer cierre (el canal no es condición de creación): `ownerPhone = null`, el listener salta el paso de envío (§7) y el panel muestra la ruta **QR en mostrador / link manual** (§9, AC-23). Un cierre posterior **no** re-genera: si el taller no entregó el QR en ese momento, lo re-muestra desde el detalle (re-display, D-VC-10).

**Verificación en código (al 2026-10-31):** al momento de escribir este diseño la transición workshop→`delivered` **no existía** en el código (única escritura: `create-owner-care-episode.handler.ts:168`, `source=owner`); el comando `close` + evento `care-episode.closed` están **definidos pero no implementados** en `docs/specs/workshop-checkin-flow.md` (B-4). El PR-7 (§11) depende de su fase C.

**Coherencia con el índice único parcial** (D-TL-VC-8): las reglas 1/2/5 impiden que el listener dispare un segundo insert activo; la reactivación (regla 3) reutiliza la fila y no compite con el índice; un invite `revoked`/`claim_blocked` no cuenta como activo, por lo que la acción manual de la regla 4 crea una fila **nueva** sin violar el índice.

---

### D-TL-VC-10 — Permisos nuevos `vehicle-claim.*` en seed; WhatsApp manual + QR con infra existente

**Decisión:**

| Código | Módulo/resource/action | Roles taller (F-5, confirmado) |
|---|---|---|
| `vehicle-claim.create` | `vehicle-claim` / `vehicle-claim` / `create` | `owner`, `mechanic` |
| `vehicle-claim.list` | `vehicle-claim` / `vehicle-claim` / `list` | `owner`, `mechanic` |
| `vehicle-claim.review` | `vehicle-claim` / `vehicle-claim` / `review` (aprobar/rechazar revisión manual) | `owner` |
| `vehicle-claim.revoke` | `vehicle-claim` / `vehicle-claim` / `revoke` | `owner` |

- Siguen el patrón de códigos del seed (`care-episode.list` en `prisma/seed.ts:310-331`, punto/kebab, `{module, resource, action}` únicos). Se agregan 4 entradas al array `permissions` + códigos a las matrices `systemWorkshopRolePermissions.owner/.mechanic` (upserts idempotentes, **no** a `.employee`).
- **WhatsApp:** el backend solo devuelve `whatsappUrl` (`https://wa.me/<dígitos>?text=<link-urlencoded>`); el envío lo hace el taller a mano. **No hay API de WhatsApp ni SMS en el repo** (verificado: canales = `src/common/mail` Resend/Nodemailer).
- **QR (S-1):** la imagen la genera el **backend** con la dependencia nueva `qrcode` y la persiste en R2 (`StorageR2Service.upload()`, carpeta `vehicle-claims/`); el panel solo muestra la URL firmada. `qrcode.react` (existente en `web-follow-app/src/components/transfer/qr-transfer-panel.tsx`, D-090) queda para transferencias, no para este módulo.
- **Confirmar celular antes de enviar (D-VC-10):** el canal sale del registro activo `VehicleOwnerContact` (spec §7.3.3 — "el módulo de reclamo lee el registro activo"), **campo canónico `phoneE164`** (D-173: el `wa.me` se arma solo desde E.164, nunca desde el formato local de display); la respuesta de generación incluye `ownerPhone` (snapshoteado al generar; enmascarado en el panel, patrón RF-6 del spec) + `whatsappUrl`. El panel permite re-mostrar QR/link y regenerar el `whatsappUrl` sin crear invite nueva (la generación sigue las reglas de D-TL-VC-9, §5.2). Un override del taller **no** escribe `VehicleOwnerContact` (tabla dueña del módulo de check-in) — ver F-7 (§10).

**Asignación de roles (F-5, confirmado):** `review`/`revoke` **solo** el rol `owner` del taller (+ `super_admin` vía bypass de `PermissionsGuard` con contexto WORKSHOP, §5.2); `create`/`list` en `owner` y `mechanic`.

---

### D-TL-VC-11 — Revocación de un reclamo consumido = deshacer el ownership (vuelve a "sin titular")

**Decisión:** agregar a `VehicleOwnership` la FK aditiva nullable `acquiredByClaimInviteId` (espejo exacto de `acquiredByTransferId`, `schema:781`). El claim crea el ownership con esa referencia. El revoke de un invite en estado `claimed`:

1. `updateMany` invite `claimed` → `revoked` (`revokeReason = by_workshop | by_admin`);
2. si `claimOutcome = ownership_created` → cerrar el ownership referenciado (`endsAt = now`) con guard `endsAt: null`;
3. emitir `vehicle-claim.revoked` (post-commit) → mail al reclamante si tiene cuenta.

Resultado: el vehículo **vuelve a "sin titular"** (sin ownership primario activo — semántica D-155), sin tocar transferencias ni histórico de atenciones.

**Justificación:** sin la FK no hay forma robusta de saber *qué* ownership creó el claim (hoy solo `acquiredByTransferId` marca procedencia; un match por `startsAt` es frágil). La adición es nullable y no altera lecturas existentes (Prisma solo lo incluye si se pide).

**Rechazado:** borrar el ownership (rompería la invariante D-155 de forma destructiva y perdería trazabilidad de quién fue reclamante) y `type`/`endsAt` hackeado por timestamp.

---

### D-TL-VC-12 — Reclamo sobre vehículo con titular activo: bloqueo en el commit, identidad primero

**Decisión:** el chequeo de titular activo ocurre en `POST /public/:token/commit` **con la sesión ya resuelta** (identidad conocida):

| Situación (hay ownership primario activo `endsAt: null`, `type <> 'co_owner'`) | Resultado |
|---|---|
| `sessionUserId === activeOwner.userId` (titular registrado reclamando — atajo de D-VC-9) | `claimed` + `outcome: already_owner`; **no** se crea otra fila de ownership |
| `sessionUserId !== activeOwner.userId` | `claim_blocked` + fila en `VehicleClaimAttempt` + eventos → mail al **titular** y al **taller** (D-VC-6) |
| Titular es `company` (concesionaria, `dealershipId`) | siempre bloqueo (el claimant es persona) |
| Sin titular activo | `claimed` + `outcome: ownership_created` |

**Por qué no se bloquea antes (en `verify`):** en la etapa de verificación **no hay identidad** (es pública y anónima por diseño — D-VC-8). Bloquear ahí impediría que el titular legítimo verifique su propio vehículo. **F-1 resuelto (2026-11-01):** la **generación** se omite si el vehículo tiene titular activo (regla 2 de D-TL-VC-9 + aviso en panel); estas transiciones T8/T9 quedan como **guarda residual** para invites creadas *antes* de una transferencia posterior — el chequeo en el commit sigue siendo la última línea.

---

### D-TL-VC-13 — Odómetro por multiple choice (F-3, decidido): solo sin VIN, 4-6 rangos + "No lo sé"

**Decisión:** cuando el vehículo **no tiene VIN** (con VIN manda F-2: últimos 4, y nada más), el factor odómetro se verifica con **multiple choice** en vez de tipeo libre:

- El backend genera **4-6 rangos de ~250 km** alrededor del valor real (`CareEpisode.mileageIn`); el rango correcto es el que contiene el odómetro registrado. Se agrega la opción **"No lo sé"**, que deriva a `manual_review` (T6) **sin gastar intentos** más allá del normal (cuenta como un intento, como cualquier otra opción).
- **Orden aleatorizado por invite** (semilla = `inviteId`, para que sea estable en reintentos del mismo invite pero distinto entre invites); el backend **nunca** revela cuál era el rango correcto.
- El challenge se sirve en un **endpoint propio**: `GET /api/vehicle-claims/public/:token/challenge?licensePlate=…` → `200 {"data":{"options":["45.000–45.250 km", …, "No lo sé"]}}` — **solo las opciones**, sin el valor real ni indicación de cuál es. El `GET` pre-verificación (bootstrap) sigue devolviendo **únicamente** `status`/`canVerify` (AC-3 intacto, D-VC-4). El challenge queda plate-gated: si `licensePlate` no coincide → **400 con el mensaje único** (mismo anti-enumeración que `verify`).
- En `verify`, el body envía `{licensePlate, mileageRangeId: "r1"… | "no_lo_se"}` (las opciones emitidas por el challenge, en vez de `mileage` tipeado); un id fuera de las opciones emitidas para ese invite → 400 mensaje único.

**Honestidad sobre el mecanismo (riesgo residual aceptado, no control fuerte):**
- Las opciones **revelan una ventana de ~1.500 km** alrededor del valor real — es inherente al mecanismo y aceptado.
- Con **4 opciones y 5 intentos**, un atacante por fuerza bruta acierta con probabilidad ~**76%** (`1 − (3/4)^5 ≈ 0.763`). El multiple choice **filtra accidentes** (dedo gordo, curiosos, gente que no es el dueño), **no autentica**.
- La mitigación real del squatting es **aviso pasivo al taller (D-TL-VC-15) + revocación con un click + disputa del dueño real (D-TL-VC-16)**; el multiple choice se apoya en ellos.

---

### D-TL-VC-14 — Orden VERIFICAR → REGISTRAR/LOGIN → RECLAMAR con ticket JWT (F-10, decidido)

**Decisión:** `verified` es un **estado intermedio real** y la verificación **NO consume el single-use** (solo lo consume el compromiso en `claimed`):

1. `POST /verify` superado → `verified` (`verifiedAt = now`) + devuelve un **ticket firmado de vida corta**.
2. El frontend redirige a **`/register` (email) o `/login`** existentes — el flujo de auth **se reusa, no se duplica** (incluye Google cuando exista), preservando el destino de vuelta al reclamo.
3. Con sesión válida, `POST /commit {ticket}` → se crea `VehicleOwnership` y el invite pasa a `claimed` (**ahí** se consume el single-use).

**Ticket: JWT firmado, sin persistencia (justificación):** el repo ya tiene infra JWT (`@nestjs/jwt`, `JWT_SECRET`) y un precedente de claims de corta vida en `wizard.controller.ts`; una tabla nueva de tickets agregaría un modelo + limpieza para datos que **no necesitan consultarse** (se validan por firma). Claims: `{inviteId, result: "verified"|"manual_review", scope: "vehicle_claim"}`, TTL **20 min** (dentro de la ventana 15-30 min pedida). El ticket **no** lleva el token del invite (no es portador de acceso: el commit además resuelve la sesión y revalida el invite).

**Expiración del ticket → `verified → verification_required` sin gastar intentos:** si el ticket venció o es inválido, el commit responde `401 TICKET_EXPIRED` y el invite vuelve a `verification_required` (`verifiedAt = null`), **sin** incrementar `failedAttempts` ni tocar el lock (el usuario re-verifica normalmente). **Por qué no consume el single-use en verify:** si lo consumiera, alguien que verifica y abandona en el registro mataría el link del dueño real (riesgo que F-10 viene a cerrar).

---

### D-TL-VC-15 — Aviso PASIVO al taller al reclamarse (confirmación obligatoria descartada)

**Decisión:** al pasar a `claimed`, el taller recibe **aviso por mail + en el panel**: *"Juan reclamó su Corolla ABC123"*. **No tiene que hacer nada** — es informativo. Si algo le suena mal, **revoca con un click** (acción ya existente, `vehicle-claim.revoke`).

**Descartado explícitamente:** **confirmación obligatoria del taller** antes de que el reclamo sea válido. Sumarle al taller la responsabilidad de verificar identidad de personas no escala (es un taller, no una ventanilla de identificación), y **no fue aceptado por el fundador** (2026-11-01). El modelo queda: aviso pasivo + revocación a discreción + disputa (D-TL-VC-16) como vía de recurso.

---

### D-TL-VC-16 — Disputa del dueño real (recuperación de claim squatting): modelo + contrato diseñados ahora, implementación fase posterior

**Decisión:** si el vehículo aparece `claimed` y el dueño real no es quien lo reclamó, puede abrir una **disputa** con evidencia (foto de la cédula verde / título). La revisa **HCDV nunca el taller** (el taller es sospechoso potencial o no tiene la evidencia).

- **Modelo `VehicleClaimDispute`** (§3.1): invite/vehicle, claimant (el que reclamó), motivo, evidencia (imágenes en R2 — `StorageR2Service.upload()`), estado, resolución, revisor (`reviewedById`, HCDV), timestamps.
- **Endpoint público mínimo** para abrirla: `POST /api/vehicle-claims/public/dispute` (multipart, token + motivo + fotos) → `202 {id}`. Válido **solo** sobre invites `claimed` (para estados abiertos existe la revocación del taller); sin throttle de token (es el canal de denuncia, no del atacante — sí `default` por IP).
- **Resolución a favor del dueño real:** (1) **revocar la titularidad indebida** — `VehicleClaimInvite → revoked(dispute_lost)` + deshace del ownership vía el mismo camino de D-TL-VC-11 (auditoría: evento `vehicle-claim.dispute-resolved` con `ownershipUndone: true`); (2) **reasignar** con auditoría — si el disputante tiene cuenta: HCDV crea el `VehicleOwnership` directamente (`acquiredByClaimInviteId` apunta al invite del reclamante original para trazabilidad de la recuperación); si no tiene cuenta: invite nueva **fast-track** (se omite la verificación de odómetro por decisión de HCDV). Toda resolución queda en la fila `resolution` + `reviewedById` + `resolvedAt`.
- **Fase posterior:** el modelo y este contrato quedan **diseñados ahora** (schema en PR-1 o en el PR de disputa); la implementación se planifica como fase posterior (§11).

---

## 3. Modelo de datos propuesto

### 3.1 Modelos nuevos (propuesta — NO se modifica `prisma/schema.prisma` en este documento)

```prisma
model VehicleClaimInvite {
  id                   String                @id @default(uuid()) @db.Uuid
  vehicleId            String                @map("vehicle_id") @db.Uuid
  workshopId           String                @map("workshop_id") @db.Uuid
  careEpisodeId        String?               @map("care_episode_id") @db.Uuid
  tokenHash            String                @unique @map("token_hash") @db.VarChar(64) // sha256(token) hex — el token crudo NUNCA se persiste (D-TL-VC-3, S-1)
  qrObjectKey          String?               @map("qr_object_key") @db.VarChar(300)   // imagen del QR persistida en R2 (re-display sin token, D-VC-10)
  status               VehicleClaimStatus    @default(pending)
  expiresAt            DateTime              @map("expires_at")           // createdAt + 7d (D-VC-1)
  ownerPhone           String?               @map("owner_phone") @db.VarChar(30) // contacto, NO auth (D-VC-8)
  claimantUserId       String?               @map("claimant_user_id") @db.Uuid   // cuenta vinculada al verificar/comprometer
  openedAt             DateTime?             @map("opened_at")            // primer GET (métrica piloto)
  verifiedAt           DateTime?             @map("verified_at")
  failedAttempts       Int                   @default(0) @map("failed_attempts")
  lastFailedAt         DateTime?             @map("last_failed_at")
  verificationLockedAt DateTime?             @map("verification_locked_at")      // lock temporal: ≥5 fallos, auto-libera a los 30 min (§6.4, F-4)
  lockoutCount         Int                   @default(0) @map("lockout_count")        // lockouts acumulados; el 3er → auto-revocación (§6.4, F-4)
  usedAt               DateTime?             @map("used_at")              // seteado al pasar a claimed — SOLO el consumo del single-use está acá: `verify` NO lo consume (F-10: verificar no mata el link)
  blockedAt            DateTime?             @map("blocked_at")
  revokedAt            DateTime?             @map("revoked_at")
  revokedByUserId      String?               @map("revoked_by_user_id") @db.Uuid
  revokeReason         VehicleClaimRevokeReason?
  claimOutcome         VehicleClaimOutcome?  // ownership_created | already_owner
  createdByUserId      String?               @map("created_by_user_id") @db.Uuid // SetNull si baja el miembro
  createdAt            DateTime              @default(now()) @map("created_at")
  updatedAt            DateTime              @updatedAt @map("updated_at")
  vehicle              Vehicle               @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  workshop             Workshop              @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  careEpisode          CareEpisode?          @relation(fields: [careEpisodeId], references: [id], onDelete: SetNull)
  claimant             User?                 @relation(fields: [claimantUserId], references: [id], onDelete: SetNull)
  revokedBy            User?                 @relation(fields: [revokedByUserId], references: [id], onDelete: SetNull)
  createdBy            User?                 @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  attempts             VehicleClaimAttempt[]
  @@index([vehicleId, status])
  @@index([workshopId, createdAt])
  @@map("vehicle_claim_invites")
}

enum VehicleClaimStatus { pending verification_required verified manual_review claimed claim_blocked expired revoked }
enum VehicleClaimRevokeReason { by_workshop by_admin manual_review_rejected vehicle_deleted max_attempts dispute_lost }
enum VehicleClaimOutcome { ownership_created already_owner }

model VehicleClaimAttempt {
  id         String                  @id @default(uuid()) @db.Uuid
  inviteId   String                  @map("invite_id") @db.Uuid
  outcome    VehicleClaimAttemptOutcome
  ip         String?                 @db.VarChar(45)  // IP TRUNCADA: /24 (IPv4) o /48 (IPv6); retención 90 días (S-2)
  userAgent  String?                 @map("user_agent") @db.VarChar(300)
  plateInput String?                 @map("plate_input") @db.VarChar(20)  // patente normalizada intentada
  createdAt  DateTime                @default(now()) @map("created_at")
  invite     VehicleClaimInvite      @relation(fields: [inviteId], references: [id], onDelete: Cascade)
  @@index([inviteId, createdAt])
  @@map("vehicle_claim_attempts")
}

enum VehicleClaimAttemptOutcome { verification_failed verification_passed manual_review claim_success claim_already_owner claim_blocked lockout_started lockout_released auto_revoked }

model VehicleClaimDispute {
  id               String                    @id @default(uuid()) @db.Uuid
  inviteId         String                    @map("invite_id") @db.Uuid          // el invite reclamado (fase: claimed)
  vehicleId        String                    @map("vehicle_id") @db.Uuid
  claimantUserId   String?                   @map("claimant_user_id") @db.Uuid    // quien reclamó (puede no tener cuenta si el ownership fue heredado de otro claim)
  openedByUserId   String?                   @map("opened_by_user_id") @db.Uuid   // el dueño real que abre la disputa (si tiene cuenta)
  contactPhone     String?                   @map("contact_phone") @db.VarChar(30) // canal de contacto del disputante (si no tiene cuenta)
  motivo           String                    @db.VarChar(500)                    // motivo en texto libre
  evidenceKeys     String[]                  @map("evidence_keys")               // keys en R2 (fotos cédula verde/título) — StorageR2Service
  status           VehicleClaimDisputeStatus @default(open)
  resolution       String?                   @db.VarChar(1000)                   // dictamen de HCDV
  reviewedById     String?                   @map("reviewed_by_id") @db.Uuid      // revisor HCDV — NUNCA el taller
  openedAt         DateTime                  @default(now()) @map("opened_at")
  resolvedAt       DateTime?                 @map("resolved_at")
  createdAt        DateTime                  @default(now()) @map("created_at")
  updatedAt        DateTime                  @updatedAt @map("updated_at")
  invite           VehicleClaimInvite        @relation(fields: [inviteId], references: [id], onDelete: Cascade)
  vehicle          Vehicle                   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  openedBy         User?                     @relation(fields: [openedByUserId], references: [id], onDelete: SetNull)
  reviewedBy       User?                     @relation(fields: [reviewedById], references: [id], onDelete: SetNull)
  @@index([status, openedAt])
  @@index([vehicleId])
  @@map("vehicle_claim_disputes")
}

enum VehicleClaimDisputeStatus { open under_review resolved_claimant resolved_rejected }
```

**Relaciones agregadas a modelos existentes:** `Vehicle.claimInvites VehicleClaimInvite[]` + `Vehicle.claimDisputes VehicleClaimDispute[]`, `Workshop.claimInvites VehicleClaimInvite[]`, `CareEpisode.claimInvites VehicleClaimInvite[]`, `User.<claimInvites/revokedClaims/createdClaims/disputesOpened/disputesReviewed>`, `VehicleOwnership.acquiredByClaimInviteId String? @db.Uuid` (+ relación, espejo de `acquiredByTransferId`).

**Nota F-10 (ticket):** el ticket de verificación **no** agrega campos ni tablas — es un JWT firmado (D-TL-VC-14); el único campo de soporte en la fila es `verifiedAt`, que ya existe y ahora también marca de dónde se puede revertir a `verification_required` por expiración de ticket.

**FK rationale:** `vehicle` **Cascade** (precedente `VehicleTransferQr.vehicle` — un vehículo borrado no debe dejar invites huérfanos ni bloquear su baja); `workshop` **Restrict** (histórico, patrón `CareEpisode.workshop`); índices únicos parciales en SQL manual (D-TL-VC-8).

### 3.2 Cambios requeridos sobre el schema actual (verificados en código)

| Supuesto / pieza | Estado verificado | Qué hace este módulo |
|---|---|---|
| Contacto del propietario | **Alineado con el spec paralelo:** `docs/specs/workshop-checkin-flow.md` §7.3.3 crea la tabla `VehicleOwnerContact` (registro activo único por vehículo, `status: available\|unavailable`) y declara "el módulo de reclamo lee el registro activo" | El módulo **lee** el registro activo al generar (D-TL-VC-9) y **snapshotea** el teléfono en `VehicleClaimInvite.ownerPhone` (qué número salió en ese invite, aunque el contacto se corrija después). `ownerPhone = null` ⇔ "sin canal de reclamo" (QR en mostrador). **No** escribe `VehicleOwnerContact` (F-7). |
| Texto libre de marca/modelo | **D-038 enmendado parcialmente** por `docs/specs/workshop-checkin-flow.md` §7.3.1: `Vehicle` gana `brandName`/`modelName` (alta desde taller; F-010 personal queda como estaba — OA-06 del spec) | Copy de mails/panel: hidratar con fallback de **3 niveles** `version → brandName/modelName → patente` (precedente de fallback: `transfer-request-email.listener.ts:53-56`). |
| "`VehicleOwnership` requiere `userId`" | **A nuance importante:** la columna es **nullable** (`schema:778` `userId String?`) — el DROP NOT NULL es de la migración `20260918000002_add_organizational_owner` — **PERO** el CHECK `vehicle_ownerships_owner_xor` de esa misma migración exige `user_id XOR dealership_id NOT NULL`: **no puede existir una fila sin persona ni concesionaria**. El requisito se cumple a nivel BD, no a nivel Prisma. | **Resolución en este módulo:** un vehículo "sin cuenta" queda **sin fila de ownership** hasta que el claim la cree con `claimantUserId` (el reclamante debe iniciar sesión o registrarse — D-TL-VC-4/5). El contacto intermedio (celular) vive en la invitación. "Sin titular" = **no hay ownership primario activo** (`ends_at IS NULL AND type <> 'co_owner'`, semántica D-155). |
| Titular sin cuenta = `type=company, userId=null` | Existe solo para concesionarias (D-128, `prisma-vehicle.repository.ts:58+`) — no sirve para persona sin cuenta | No se reutiliza; una persona sin cuenta no puede ser titular hasta reclamar con sesión. |
| "Invitación al cerrar la atención" | **Ahora posible:** `docs/specs/workshop-checkin-flow.md` implementa el comando `close` (B-4) y emite `care-episode.closed` con `{ careEpisodeId, vehicleId, workshopId }` post-commit (§6.3, AC 8); antes esta transición no existía en código | Listener `@OnEvent('care-episode.closed')` con regla de **primer cierre** (D-TL-VC-9): genera solo si no hay invite vigente ni reclamo previo; reactiva si el último expiró; nada si está revocado. |
| `User.phone` | Opcional, sin unique, sin E.164 (`schema:16`); sin normalización en código (grep negativo) | Solo se muestra/usa para armar `wa.me` en cliente. **Jamás** auth/OTP. El celular del invite (`ownerPhone`) tampoco. |
| Baja de vehículos | `delete-vehicle.handler.ts`: soft-delete si hay historial (`deletedAt`), hard-delete si no | Cascade borra invites en hard-delete; soft-delete detectado al acceso → `revoked(vehicle_deleted)` (§9 AC-16). |
| Permisos | Son **filas de seed**, no columnas | 4 entradas nuevas en `prisma/seed.ts` (sin migración de schema). Matriz (F-5, confirmado): `create`/`list` → `owner`+`mechanic`; `review`/`revoke` → **solo `owner`** (+ `super_admin` vía bypass). |

### 3.3 Migración (`npm run db:migrate` — aditiva, NO destructiva)

SQL generado equivalente a: `CREATE TYPE` × 6 enums (4 del claim + `vehicle_claim_dispute_status` + outcome de intentos), `CREATE TABLE vehicle_claim_invites` (con `token_hash` **unique** — sin columna de token crudo, S-1 — + `qr_object_key` + `lockout_count`) + `vehicle_claim_attempts` (FKs, `ip` truncada) + `vehicle_claim_disputes` (FKs, `evidence_keys TEXT[]`, fase posterior — §11), `CREATE UNIQUE INDEX ... token_hash`, 2 índices de lista, `ALTER TABLE vehicle_ownerships ADD COLUMN acquired_by_claim_invite_id UUID` + FK, y los **2 índices únicos parciales** escritos a mano en la migración (patrón documentado en `20261007140000_vehicle_ownerships_unique_active_primary/migration.sql`: Prisma 6 los ignora en el diff; se dejan comentario en la migración).

Post-checks: `npm run db:generate`, `npm run build`, smoke de queries existentes de vehicles/ownerships (los campos nuevos no alteran selects existentes).

---

## 4. Máquina de estados

Estados **terminales**: `claimed`, `claim_blocked`, `revoked` (`expired` **no** es terminal: admite reactivación en el primer cierre posterior — T18).

| # | Origen | Destino | Disparador | Guarda / nota |
|---|---|---|---|---|
| T1 | — | `pending` | Listener `care-episode.closed` (primer cierre) o `POST /vehicle-claims` (taller) — mismas reglas D-TL-VC-9 | Si ya hay invite vigente → devuelve el existente (idempotente); si el vehículo ya fue reclamado **o tiene titular activo** → 409 `active_owner` (regla 2, F-1); si el último invite está `revoked`/`claim_blocked` → la acción manual crea invite **nueva** (esos estados no cuentan como activos en el índice parcial) |
| T2 | `pending` | `verification_required` | Primer `GET /public/:token` (side-effect, precedente H-23) + `openedAt` | Solo si no venció; **no** expone datos (§6.5) |
| T3 | `pending`, `verification_required` | `verification_required` (queda) | `POST .../verify` fallido | Lock no activo, no vencido; `failedAttempts++`, `lastFailedAt`, fila en `VehicleClaimAttempt` |
| T4 | `pending`, `verification_required` | `verification_required` + `verificationLockedAt` | `failedAttempts ≥ 5` (tras T3), salvo que sea el fallo que completa el **3er** lockout (→ T19) | **Lock temporal (F-4):** `lockoutCount++`, fila `lockout_started`, taller notificado (§7). **Auto-liberación a los 30 min** (lazy al acceso — sin cron, sin reset manual): `verificationLockedAt + 30min < now` → `failedAttempts = 0`, `verificationLockedAt = null`, fila `lockout_released`; el reintento legítimo continúa normal |
| T5 | `pending`, `verification_required` | `verified` | `verify` OK: patente coincide **y** coincide el factor aplicable — **VIN últimos 4 si hay VIN registrado (el VIN excluye al odómetro, F-2); si no, rangos de multiple choice (F-3)** | `verifiedAt = now`; emite `vehicle-claim.verified` (log, sin mail); responde **ticket JWT de 20 min** (D-TL-VC-14). **NO consume el single-use** (`usedAt` queda null — F-10) |
| T6 | `pending`, `verification_required` | `manual_review` | `verify`: patente OK pero **no existe** ningún dato verificable (sin VIN capturado y sin `mileageIn` en la última atención); o el usuario eligió **"No lo sé"** en el challenge (F-3) | D-VC-2: nunca aprobación automática; también responde ticket (resultado `manual_review`) |
| T7 | `verified` | `claimed` (`ownership_created`) | `commit` con **ticket válido** + sesión y **sin** titular activo | `$transaction`: `updateMany(verified→claimed)` (count 0 → 409) + `VehicleOwnership.create` con `acquiredByClaimInviteId`; **acá** se consume el single-use (`usedAt`); `P2002` de D-155 → trata como T9 |
| T8 | `verified` | `claimed` (`already_owner`) | `commit` con ticket + sesión **igual** al titular activo | Sin escritura de ownership (guarda residual post-F-1: invites creadas antes de una transferencia posterior — D-TL-VC-12) |
| T9 | `verified` | `claim_blocked` | `commit` con ticket + sesión ≠ titular activo (o `P2002` de T7) | `blockedAt`, intento logueado, emite `vehicle-claim.blocked` → mails titular + taller (D-VC-6) |
| T10 | `verified` | `manual_review` | `commit` sin sesión → `401 AUTH_REQUIRED` (no es transición; redirige a `/register`/`/login`, F-10); con sesión y resultado `manual_review` → `claimantUserId` vinculado, espera revisión | El claim se "corta" esperando revisión |
| T20 | `verified` | `verification_required` | **Expiración del ticket** (TTL 20 min): `commit` con ticket vencido/inválido → `401 TICKET_EXPIRED` (D-TL-VC-14) | `verifiedAt = null`; **sin** incrementar `failedAttempts` ni tocar el lock; el usuario re-verifica normalmente |
| T11 | `manual_review` | `claimed` (`ownership_created`) | `POST /vehicle-claims/:id/approve` (taller) | Requiere `claimantUserId` (si no → 409); `$transaction` idéntica a T7 |
| T12 | `manual_review` | `revoked` (`manual_review_rejected`) | `POST /:id/reject` (taller) | — |
| T13 | `claimed` | `revoked` (`by_workshop` o `by_admin`) | `POST /api/vehicle-claims/:id/revoke` (taller → `by_workshop`) · `POST /api/admin/vehicle-claims/:id/revoke` (admin → `by_admin`, §5.3) | **Deshace** el ownership creado (T11/T7) → vehículo "sin titular" (D-TL-VC-11), idéntico en ambos: `ownershipUndone:true` en la respuesta |
| T14 | `pending`, `verification_required`, `verified` | `revoked` (`by_workshop` o `by_admin`) | Revocación sobre invite sin consumir: taller (`by_workshop`) o admin (`by_admin`, §5.3) | `manual_review` **no** se revoca por ninguno de los dos: 409 y se cierra con T12 `reject` (taller), que emite `manual_review_rejected` y avisa al reclamante. Revocarlo como `by_workshop`/`by_admin` dejaría el rechazo sin mail |
| T15 | cualquier no-terminal | `expired` | Acceso (GET/verify/commit) con `expiresAt < now`; el listado solo lo calcula para display | Lazy (D-TL-VC-7) |
| T16 | cualquier no-terminal | `revoked` (`vehicle_deleted`) | Acceso con `vehicle.deletedAt != null` | Notifica al taller (mail) |
| T17 | `claim_blocked`, `claimed`, `expired`, `revoked` | — | Acceso posterior | Genérico "el reclamo ya no está disponible" (§6.6); `verify`/`commit` → 409/410 |
| T18 | `expired` | `pending` | **Reactivación** en el siguiente cierre de atención (`care-episode.closed`) — regla 3 de D-TL-VC-9 | **Rotación confirmada (F-12):** mismo `id`, **token + hash nuevos** (los QR/link vencidos quedan muertos), `expiresAt = now + 7d`, contadores en 0 (`failedAttempts`, `lockoutCount`, `verificationLockedAt`), QR regenerado en R2. `revoked` **nunca** pasa por aquí (regla 4: acción explícita del taller) |
| T19 | `verification_required` (con lock activo o `failedAttempts ≥ 5`) | `revoked` (`max_attempts`) | **Auto-revocación (F-4):** el fallo que completaría el **3er** lockout (`lockoutCount = 2`) | Fila `auto_revoked`; mail al taller ("link auto-revocado tras 3 bloqueos"); la única salida es un invite nuevo con acción explícita (F-6). Anti-DoS: 5 fallos no matan el link — hacen falta 3 ciclos completos de lockout (15 fallos + 2 esperas de 30 min): lento, costoso y detectable |

**Eventos emitidos (post-commit, patrón `BaseEvent`, después del cambio de estado exitoso — AGENTS.md):** `vehicle-claim.invited`, `vehicle-claim.verified`, `vehicle-claim.verify-failed`, `vehicle-claim.claimed`, `vehicle-claim.blocked`, `vehicle-claim.manual-review`, `vehicle-claim.revoked`, `vehicle-claim.dispute-opened`, `vehicle-claim.dispute-resolved` en `src/modules/vehicle-claims/events/`. **Evento consumido:** `care-episode.closed` con `{ careEpisodeId, vehicleId, workshopId }` (post-commit, spec `workshop-checkin-flow.md` §6.3/AC 8) — listener con las reglas de primer cierre de D-TL-VC-9.

---

## 5. Contrato API

### 5.1 API pública (token — `VehicleClaimPublicController`, sin `JwtAuthGuard`)

| Método y path | Auth / throttle | Request | Response |
|---|---|---|---|
| `GET /api/vehicle-claims/public/:token` | ThrottlerGuard: `{ default: 10/60s, vehicleClaimToken: 10/60s }` | — | 200 `{"data": {"status": "pending", "canVerify": true}}` o `{"data":{"status":"expired","canVerify":false}}`… **NADA más** (§6.5). 404 `Link no válido` si el token no existe |
| `GET /api/vehicle-claims/public/:token/challenge` | `{ default: 10/60s, vehicleClaimToken: 5/300s }` (S-3: el challenge alimenta el factor del verify → bucket estricto 5/5 min) | `?licensePlate=ABC123` (plate-gated) | 200 `{"data":{"options":[{"id":"r1","label":"45.000–45.250 km"},…,{"id":"unknown","label":"No lo sé"}]}}` — **solo opciones** (F-3, D-TL-VC-13). Sin VIN no hay challenge (400 mensaje único). 400 mensaje único si la patente no coincide |
| `POST /api/vehicle-claims/public/:token/verify` | `{ default: 5/300s, vehicleClaimToken: 5/300s }` (patrón claim del wizard) | `{"licensePlate":"ABC123","vinLast4":"1234"?,"mileageRangeId":"r1"?"no_lo_se"?}` (DTO class-validator, whitelist; el backend determina el factor: con VIN registrado solo cuenta `vinLast4` y cualquier `mileageRangeId` se **ignora** — F-2) | 200 `{"data":{"status":"verified","ticket":"<jwt>","expiresIn":1200}}` · 200 `{"data":{"status":"manual_review","ticket":"<jwt>"}}` · **400 mensaje único** (§6.6) · 404 token inexistente · 409 lock/vencido/no disponible. **No consume el single-use** (F-10) |
| `POST /api/vehicle-claims/public/:token/commit` | `{ default: 5/300s, vehicleClaimToken: 5/300s }`; sesión **requerida** desde cookie (`resolveSessionUserId` wizard) | `{"ticket":"<jwt>"}` | 200 `{"data":{"status":"claimed","outcome":"ownership_created"\|"already_owner"}}` · **401 `AUTH_REQUIRED`** (frontend redirige a `/register` o `/login` con `?next=` preservando el token — F-10) · **401 `TICKET_EXPIRED`** (vuelve a `verification_required` sin gastar intentos) · 200 `{"data":{"status":"manual_review"}}` (vínculo ok, espera revisión HCDV) · 409 `{"data":{"status":"claim_blocked"}}` (mensaje genérico, sin datos del titular) · 409 single-use · 410 no disponible |
| `POST /api/vehicle-claims/public/dispute` | `default` por IP (no por token: es el canal del **dueño real**, no del atacante — D-TL-VC-16); multipart | `multipart/form-data`: `token`, `motivo`, `evidence[]` (fotos cédula/título, vía `StorageR2Service`) | **202** `{"data":{"id":"uuid"}}` — solo sobre invites `claimed`; 400/404 si el invite no está reclamado (para estados abiertos, revoca el taller). Fase posterior (§11) |

**Contrato crítico (D-VC-4):** el GET pre-verificación devuelve únicamente `status` y `canVerify`. El formulario ("Reclamá tu vehículo" + patente) es **estático en el frontend** — no se configura desde el backend para no revelar si el taller capturó VIN. Ni patente, ni historial, ni nombre, ni taller, ni kilometraje, ni marca. El paso del factor (últimos 4 del VIN o rangos de odómetro) aparece **solo** en el `challenge`/`verify`, después de que la patente coincide (F-3).

### 5.2 API autenticada — taller (`VehicleClaimsController`)

Guards: clase `JwtAuthGuard` + `ContextGuard`; método `WorkshopOnlyGuard` + `PermissionsGuard` (orden verbatim de `care-episodes.controller.ts:66,85`).

| Método y path | Permiso | Request | Response |
|---|---|---|---|
| `POST /api/vehicle-claims` | `vehicle-claim.create` | `{"vehicleId":"uuid","careEpisodeId":"uuid"?,"ownerPhone":"+54911…"?}` (si viene `ownerPhone` se usa como snapshot; si falta, se lee el registro activo `VehicleOwnerContact` — D-TL-VC-9) | 201 (o 200 si reutiliza/reactiva según reglas D-TL-VC-9; **409** `reason:"already_claimed"\|"active_owner"` con copy "Este vehículo ya tiene titular; no se envió invitación" — F-1) `{id, vehicleId, licensePlate, status, link, whatsappUrl, qrImageUrl, ownerPhone, expiresAt, createdAt}` — **`link`/`whatsappUrl` solo en esta respuesta** (S-1: token en claro una única vez); `link = ${FRONTEND_URL}/reclamo/<token>` |
| `GET /api/vehicle-claims?page&limit&status` | `vehicle-claim.list` | query | `{data:[{id, vehicleId, licensePlate, status (efectivo, D-TL-VC-7), claimOutcome, openedAt, verifiedAt, usedAt, failedAttempts, createdAt…}], meta:{total, page, limit, totalPages, counts:{pending:…, claimed:…}}}` — envelope patrón F-023 (`DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`) |
| `GET /api/vehicle-claims/:id` | `vehicle-claim.list` | — | Detalle: campos + `qrImageUrl` (QR persistido en R2 vía URL firmada — re-display D-VC-10 **sin** token ni link, S-1) + `attempts` + `vehicle` (patente, marca/modelo/año vía catálogo con fallback) +, solo en `manual_review`, `claimant:{firstName,lastName,email}` |
| `POST /api/vehicle-claims/:id/approve` | `vehicle-claim.review` | — | 200 `claimed`. 409 si `claimantUserId` null ("aún no hay cuenta vinculada") o si apareció un titular activo (P2002 → `claim_blocked`) |
| `POST /api/vehicle-claims/:id/reject` | `vehicle-claim.review` | — | 200 `revoked(manual_review_rejected)` |
| `POST /api/vehicle-claims/:id/revoke` | `vehicle-claim.revoke` | `{"reason":"texto"?}` | 200 `revoked(...)`; si estaba `claimed` con `ownership_created` → además cierra el ownership (respuesta incluye `ownershipUndone:true`). **409 si está `manual_review`**: usar `reject` (T12) para que el reclamante reciba el mail |

**Scoping:** el handler valida `invite.workshopId === ctx.workshopId` → `404` si es de otro taller (no 403: no revela existencia — patrón de detalle del módulo). `super_admin`: bypass de `PermissionsGuard` solo aplica si tiene contexto WORKSHOP (membresía activa vía `ContextResolver`), idéntico al resto del módulo (D-TL-F023-7 como precedente).

### 5.3 API admin (decisión D-VC-1: "revocable por el taller o un admin"; F-8 → endpoint nuevo con permiso dedicado)

Guards — patrón verbatim de `administration.controller.ts` (anti-bypass D-024 A2): `JwtAuthGuard` a nivel de clase + `PermissionsGuard` por método con `@Permissions(...)`. **Sin `ContextGuard` y sin `WorkshopOnlyGuard`**: el endpoint opera **sin contexto WORKSHOP** (un `super_admin` sin membresía de taller puede revocar). Como los `POST` de ese controller no declaran `HttpCode` (default 201), este método **debe** llevar `@HttpCode(HttpStatus.OK)` para respetar el 200 del contrato.

| Método y path | Permiso | Request | Response |
|---|---|---|---|
| `POST /api/admin/vehicle-claims/:id/revoke` | `admin.vehicle-claims.manage` (nuevo, patrón `admin.vehicles.*` en `administration.controller.ts`) | `{"reason":"texto"?}` — DTO `RevokeClaimDto` reutilizado (string con trim, ≤500). **No se persiste** (no hay columna de texto libre); el motivo persistido es el enum del invite. | **200** `{"data":{"status":"revoked","reason":"by_admin","ownershipUndone":true\|false}}`. `ownershipUndone:true` solo si estaba `claimed` + `ownership_created` (cierra el ownership en la misma transacción — D-TL-VC-11, igual que el revoke del taller). **404** `CLAIM_NOT_FOUND_MESSAGE` si `:id` no existe (**sin** scoping por taller: el admin ve cualquier invite). **409** `CLAIM_MANUAL_REVIEW_REJECT_MESSAGE` en `manual_review` → cerrar con `reject` del taller (T12) — ver **pendiente de decisión** más abajo. **409** `CLAIM_UNAVAILABLE_MESSAGE` en `expired`/`revoked`/`claim_blocked` y en carrera (`updateMany` count 0) |
| `GET/PATCH /api/admin/vehicle-claims/disputes/:id` (fase posterior) | `admin.vehicle-claims.manage` | — | Cola de disputas de HCDV: listar `open`/`under_review`, resolver con `resolution` → revoca `dispute_lost` + reasignación (D-TL-VC-16). **El taller nunca ve ni resuelve disputas** |

**Notas del revoke admin:**

- **Actor `by_admin`:** `revokeReason = 'by_admin'` + `revokedByUserId = id del admin` (por eso F-8 descarta la impersonación: con impersonación la auditoría apuntaría al usuario impersonado). El `reason` libre del body no viaja a la BD.
- **Evento:** `vehicle-claim.revoked` con `reason: 'by_admin'` → el listener C-4 (`vehicle-claim-revoked.listener.ts`) tiene case explícito `by_admin` → **sin mail**, solo warn: ni al reclamante ni al taller. Asimetría con `by_workshop`, que avisa al reclamante únicamente si deshizo el ownership.
- **Reuso del handler (implementado — `b263cef`):** `RevokeClaimCommand` acepta `string | RevokeClaimContext` (unión discriminada `{type:'workshop', workshopId}` | `{type:'admin'}`; el `string` mantiene el call site del taller). El handler hace `findFirst({where:{id, workshopId?}})` — solo `id` en contexto admin — y deriva `revokeReason`/evento del contexto (`by_admin` | `by_workshop`), sin lógica duplicada: reglas de estado, 409, deshace de ownership y guarda de carrera (`updateMany` con el `workshopId` de la fila) idénticos para ambos.
- **Permiso y seed (implementado — `b263cef`):** entrada nueva en el array `permissions` de `prisma/seed.ts` (`module:'admin'`, `resource:'vehicle-claims'`, `action:'manage'`, `code:'admin.vehicle-claims.manage'`) **más** la función autocontenida `seedAdminVehicleClaimPermission()` invocada en `main()`: upsert por `code` + link del permiso **solo a `super_admin`**. *Corrección respecto del contrato original:* `seedPermissions()`/`seedSystemRoles()` están **desactivados en `main()`**, por eso el upsert no puede vivir ahí — función propia es el patrón activo del seed (`seedCareEpisodeClosePermission`, `seedVehicleClaimPermissions`); el array `permissions` queda como catálogo declarativo. **No** se asigna a roles de taller ni, en MVP, al system role `admin` — consistente con `admin.vehicles.list/read`, que tampoco lo tienen. Tras `npm run db:seed`, considerar el `PermissionCache` (TTL 5 min): reiniciar o esperar antes del smoke.

**PENDIENTE DE DECISIÓN (producto) — revoke admin sobre `manual_review`:**

- **Qué sabemos:** el handler devuelve 409 `CLAIM_MANUAL_REVIEW_REJECT_MESSAGE` ("usá Rechazar") en `manual_review` **antes** de evaluar revocabilidad; el cierre canónico es T12 `reject` (emite `manual_review_rejected` y avisa al reclamante) y hoy solo existe en el controller del taller con `vehicle-claim.review`.
- **Qué no sabemos:** si HCDV debe poder cerrar un `manual_review` desde el endpoint admin — el admin no tiene endpoint `reject` propio, y el argumento operativo de F-8 (taller inactivo/sin miembros) aplica también acá.
- **Recomendación (no resuelta en este documento):** mantener el **409** en C-6 (paridad de reglas; evitar que un evento de cierre tipo taller salga del contexto admin) y, si producto lo pide, agregar `POST /api/admin/vehicle-claims/:id/reject` con el mismo permiso en un PR posterior (puede colgar de la cola de disputas de la fase posterior).

### 5.4 Métricas del piloto

Sin endpoint nuevo: `GET /api/vehicle-claims` devuelve `meta.counts` por estado y el filtro `status`; el piloto se mide por reclamos de propietarios (`claimed` / `manual_review` / `claim_blocked` / `expired`). Si se necesita cross-taller, es trabajo de `dashboard` (fuera de alcance).

---

## 6. Reglas de validación y seguridad

### 6.1 Token (S-1: hasheado)
- Entropía: `randomBytes(32)` → 64 hex (256 bits). En BD **solo** `sha256(token)` en `tokenHash @unique` (colisión → retry, P2002 → regenerar); el token crudo jamás se persiste.
- Lookup público: hashear el token entrante y buscar por hash (determinista — `failedAttempts`, throttle por token y single-use sin cambios).
- QR: imagen generada al crear y persistida en R2 (`qrObjectKey`); el panel re-muestra la imagen (URL firmada), nunca el token. `link`/`whatsappUrl` salen solo en la respuesta de creación.
- Ni token ni hash en logs ni en eventos (correlacionar por `inviteId`).
- Single-use materializado en T7/T8/T11 (`usedAt` + guarda de estado).
- **Límite del hash:** no evita la filtración por URL (logs de proxy, historial del navegador, `Referer`); por eso single-use, expiración de 7 días y rate-limit (§6.3) son controles **independientes e igual de necesarios**.

### 6.2 Expiración
- 7 días desde creación (D-VC-1), evaluada en cada acceso (T15). Sin extensión en vida del invite. Si expiró → el **siguiente cierre** de una atención lo reactiva **rotando token+hash** (T18, F-12 confirmada); si está revocado → solo acción explícita del taller (invite nueva, §5.2, F-6).

### 6.3 Rate-limit (por IP **y** por token — S-3 confirmado 2026-11-01)
- **IP:** `@Throttle` por ruta con bucket `default` (GET 10/60s — precedente preview QR; verify/commit 5/300s — precedente `wizard.controller.ts:50`), sin modificar el comportamiento del default global.
- **Token (por método):** bucket con nombre nuevo `vehicleClaimToken` en `ThrottlerModule.forRoot` (`app.module.ts:39-54`, aditivo) con `getTracker: (req) => String(req.params.token)`:
  - `GET` bootstrap: **10 req/min por token**.
  - `challenge` + `POST` (verify + commit): **5 req/5 min por token** (S-3: el challenge alimenta el factor del verify, comparte el bucket estricto).
  - Bloquea fuerza bruta aunque el atacante cambie de IP. Un usuario legítimo que se equivoca dos veces no queda afectado.
- **Conteo durable:** `failedAttempts` en BD (§6.4) — el throttler es volátil; el contador no. **Ventana de conteo: 15 min** (si pasan 15 min desde el primer fallo de la ráfaga, el contador vuelve a 0 sin lock).

### 6.4 Control de intentos fallidos (F-4, decidido: escalera lock → auto-revocación)
- Cada `verify` fallido: `failedAttempts++` + fila `VehicleClaimAttempt` (con `ip` **truncada** — /24 IPv4, /48 IPv6 —, `userAgent`, `plateInput` normalizado). También emite `vehicle-claim.verify-failed` → mail al taller (indicio de fuga/reenvío indebido).
- **Escalera exacta (S-3 confirmado):**
  1. **5 fallos dentro de la ventana de 15 min → lock** (`verificationLockedAt`, `lockoutCount++`, fila `lockout_started`): `verify` responde el mensaje único de lock ("muchos intentos, contactá al taller"); taller notificado (§7).
  2. **Auto-liberación a los 30 minutos** (lazy al acceso — sin cron y sin reset manual por persona): `verificationLockedAt + 30min < now` → `failedAttempts = 0`, `verificationLockedAt = null`, fila `lockout_released`; el reintento legítimo del dueño continúa normal.
  3. **3 lockouts acumulados → auto-revocación:** el fallo que completaría el 3er lockout (`lockoutCount = 2`) → `revoked(max_attempts)` (T19, fila `auto_revoked`) + **mail al taller**, que debe generar un invite nuevo con acción explícita (F-6).
- **Regla anti-DoS (por qué lock ≠ revoke):** una revocación directa a los 5 fallos daría a cualquiera con el link el poder de matarlo a propósito. El lock de 30 min no mata nada; la auto-revocación exige **3 ciclos completos de lockout** (15 fallos + 2 esperas de 30 min): cara, lenta y detectable (3 notificaciones al taller), nunca silenciosa.
- **Retención (S-2):** filas de `VehicleClaimAttempt` con más de **90 días** se depuran (runbook operativo — el repo no tiene cron). La política definitiva (incluido `userAgent`) se valida con asesoría legal.

### 6.5 Exposición de datos por endpoint (control central)

| Endpoint | Expone |
|---|---|
| `GET /public/:token` **pre-verificación** | **Solo** `status` + `canVerify`. Cero: patente, historial, nombre, taller, kilometraje, marca/modelo, teléfono |
| `challenge` | Solo las opciones de rango (+ "No lo sé") — revela una ventana de ~1.500 km, aceptado (F-3). Sin valor real ni marca del rango correcto |
| `verify` OK | `status` + `ticket` (JWT de 20 min, sin datos del vehículo) |
| `verify` falla | **Un único mensaje 400** (idéntico para patente inexistente, patente ajena, VIN mal, rango de odómetro mal y factor faltante — anti-enumeración) |
| `commit` bloqueado | Mensaje genérico "el vehículo ya tiene titular registrado" — **sin** nombre/email/datos del titular |
| `commit` éxito | `status` + `outcome` (el propietario ya superó la verificación; nada más) |
| Generación (taller, **una sola vez**) | `link` + `whatsappUrl` (contienen el token) únicamente en la respuesta de creación, sobre HTTPS, al miembro con `vehicle-claim.create` (S-1) |
| Detalle (taller) | Datos que el taller ya conoce + `qrImageUrl` (imagen del QR en R2, URL firmada) — **sin** token ni link en texto (S-1) |
| `manual_review` detalle | + cuenta del reclamante (nombre/email) — solo con `vehicle-claim.review`, justificado para revisar |

### 6.6 Comparación de datos sin filtrar información
- Normalización: patente `trim().toUpperCase()` (D-037/D-042) **de ambos lados**; VIN `trim().toUpperCase().slice(-4)`; el rango de odómetro se envía como `mileageRangeId` ∈ opciones emitidas (F-3) o `no_lo_se` — nunca un número tipeado.
- **Factor aplicable (F-2/F-3, decidido):** con VIN registrado el único factor son los últimos 4 del VIN (cualquier `mileageRangeId` en el body se ignora); sin VIN → **multiple choice** de rangos de ~250 km sobre el odómetro de la última atención (D-TL-VC-13); sin ninguno → `manual_review`. El 400 sigue siendo único ante cualquier fallo.
- Mensajes: **`400 "No pudimos verificar los datos del vehículo. Revisá la patente y los datos ingresados."`** para cualquier fallo de verificación. El server jamás dice *cuál* falló ni si la patente existe (además, la comparación es contra `invite.vehicle` — nunca se buscan otras patentes).
- **Honestidad sobre el multiple choice (riesgo residual ACEPTADO, F-3):** las opciones revelan una ventana de ~1.500 km alrededor del valor real (inherente al mecanismo); con **4 opciones y 5 intentos** un atacante por fuerza bruta acierta ~**76%** (`1 − (3/4)^5`). El multiple choice **filtra accidentes, no autentica**. La mitigación real es el **aviso pasivo al taller + revocación con un click + disputa del dueño real** (D-TL-VC-15/16); el mecanismo se documenta como control débil, no como barrera.
- Estados terminales del link: sí se distinguen (`expired` / `revoked` / `claimed`) para UX del dueño real — el token es de 256 bits y el endpoint está rate-limited; el riesgo de oráculo es despreciable frente al beneficio de que el propietario sepa qué hacer ("contactá al taller"). Queda como confirmación F-9.
- Token inexistente: `404 "El link no es válido."` (igual para cualquier token basura).

### 6.7 Otros
- **Celular ≠ autenticación (D-VC-8):** `ownerPhone`/`User.phone` nunca validan identidad ni habilitan login/recuperación; no hay endpoints OTP. La prueba de posesión es el token + la sesión de cuenta.
- **Validación:** DTOs con `class-validator` bajo el `ValidationPipe` global (`whitelist: true`); `licensePlate` con `@Matches(/^[A-Za-z0-9]{2,10}$/)` (formato D-037), `vinLast4` `@Length(4,4)`, `mileageRangeId` `@IsIn(opciones emitidas para ese invite)` (F-3) o `no_lo_se`, `ticket` `@IsJWT()`.
- **Errores:** envelope existente vía `AllExceptionsFilter`; códigos de estado 401/404/409/410 usados como en wizard/QR.
- **Mail:** `MailService.send()` es la única frontera de error (D-109 — un fallo de mail nunca revierte el claim); listeners con try/catch propio (patrón `transfer-request-email.listener.ts`).

---

## 7. Notificaciones

| Disparador (evento) | Destino | Canal | Contenido |
|---|---|---|---|
| `vehicle-claim.invited` | **Propietario** | Si `ownerPhone != null`: **WhatsApp manual** (`wa.me` con link prellenado, lo envía el taller) + **QR en pantalla** (imagen persistida en R2 — S-1) como respaldo. Si `ownerPhone == null` ("sin canal de reclamo", registro activo `unavailable`): **solo QR en mostrador / link manual** (y email automático solo si F-11 se aprueba) | "Reclamá tu vehículo en Autentia" + link |
| `vehicle-claim.verify-failed` (cada fallo) | Taller | Mail (`Workshop.email`, si existe) + panel | "Intento fallido de reclamo en {patente} (intento N)" |
| `vehicle-claim.claimed` | **Taller** (D-VC-5 / D-TL-VC-15: **aviso pasivo**, no confirmación) | Mail + panel | "{Nombre} reclamó el vehículo {patente}" — informativo, **no requiere acción**; si le suena mal, revoca con un click. Mitigación anti-squatting #1 |
| `vehicle-claim.claimed` | Reclamante | Mail (si tiene cuenta) | Confirmación + link a su historial |
| `vehicle-claim.blocked` | **Titular activo** | Mail (`User.email` del titular) | "Alguien intentó reclamar el vehículo {patente} que ya figura a tu nombre" |
| `vehicle-claim.blocked` | Taller | Mail + panel | "Reclamo bloqueado: {patente} ya tiene titular" |
| `vehicle-claim.manual-review` | Taller | Mail + panel | "Reclamo a revisar: {patente} (sin dato verificable)" + CTA al panel |
| `vehicle-claim.revoked` (con `ownershipUndone`) | Reclamante | Mail (si tiene cuenta) | "El reclamo de {patente} fue revocado por el taller" |
| `vehicle-claim.revoked` (`manual_review_rejected`) | Reclamante | Mail (si tiene cuenta) | "El reclamo de {patente} fue rechazado" — variante `review_rejected`: no hubo ownership, así que no dice "ya no figura a tu nombre" |
| `vehicle-claim.revoked` (`max_attempts`, auto — F-4) | **Taller** | Mail + panel | "El link de {patente} fue auto-revocado tras 3 bloqueos; generá uno nuevo" |
| `vehicle-claim.dispute-opened` (fase posterior) | **HCDV** | Mail + cola admin | "Disputa de titularidad: {patente}" — el taller **no** recibe ni resuelve disputas (D-TL-VC-16) |
| `expired` | — | Sin mail | Se calcula en listado (D-TL-VC-7) |

- **Infra:** templates nuevos en `MAIL_TEMPLATES` (`src/common/mail/mail.types.ts:19-38`): `vehicle_claim_invitation`, `vehicle_claim_workshop_notification`, `vehicle_claim_blocked_owner`, `vehicle_claim_result` + métodos en `mail.service.ts` que delegan a `send()` (idempotencia/retry intactos) + `MailContext` extendido con `vehicleId`/`inviteId` (aditivo). Listeners `@OnEvent('vehicle-claim.*')` en el propio módulo (patrón `workshop-invitation-email.listener.ts`), registrados en el `providers` del módulo.
- **WhatsApp:** manual, sin API (D-VC-10). **SMS:** no existe infraestructura, no se crea. El mail es solo notificación — **nunca** transporta el link de reclamo a un tercero sin cuenta (el link va por canal que el taller controla: WhatsApp/QR).
- **Confirmación obligatoria del taller: DESCARTADA (D-TL-VC-15):** se evaluó exigir que el taller confirme cada reclamo antes de validarlo; **no se adopta** — sumarle al taller responsabilidad de verificar identidad de personas no escala (no es su oficio) y el fundador no lo aceptó (2026-11-01). Se queda con aviso pasivo + revocación a discreción + disputa como recurso.
- **Evento consumido:** el listener `@OnEvent('care-episode.closed')` (D-TL-VC-9) es best-effort: try/catch propio + log por `careEpisodeId` (nunca por token); su fallo no revierte ni retrasa el cierre del `CareEpisode` (spec `workshop-checkin-flow.md` CV-16/RF-13).

---

## 8. Criterios de aceptación

### Happy path
- **AC-1:** Miembro con `vehicle-claim.create` en contexto WORKSHOP genera un invite para `vehicleId` válido → 201 con `link`, `whatsappUrl` (**solo en esta respuesta** — S-1: el token en claro no persiste ni se re-muestra), `qrImageUrl` (QR persistido en R2), `expiresAt = createdAt + 7d`, `status: pending`; en BD existe únicamente `tokenHash` (vía manual; la vía automática del primer cierre está en AC-22).
- **AC-2:** Repetir la generación para el mismo vehículo con invite activo → devuelve el **mismo** invite (200, idempotente; sin cadena de tokens) con `status`/`qrImageUrl` pero **sin** `link` (el texto del link no se entrega de nuevo — S-1; el reenvío es por QR).
- **AC-3:** (Control central) El `GET /public/:token` de un invite `pending` responde **solo** `status` y `canVerify`; un test de contrato afirma que el body no contiene `licensePlate`, `vehicle`, `workshop`, `mileage`, `brand`, `model`, nombre ni teléfono — ni siquiera en campos anidados.
- **AC-4 (precedencia F-2/F-3):** con VIN registrado: patente correcta + `vinLast4` correcto → 200 `verified` + ticket (**aunque** venga un `mileageRangeId` cualquiera — se ignora); patente correcta + `vinLast4` mal + rango correcto → 400. Sin VIN: `GET /challenge` devuelve 4-6 rangos + "No lo sé" (nunca el valor real); patente correcta + rango correcto → 200 `verified`; rango incorrecto → 400; `no_lo_se` → `manual_review` con ticket. El challenge con patente incorrecta → 400 mensaje único.
- **AC-5:** `POST /commit {ticket}` con sesión → `claimed/ownership_created`: se crea `VehicleOwnership {type:'owner', endsAt:null, acquiredByClaimInviteId}` y el invite queda `claimed` con `usedAt`. El `verify` previo **no** seteó `usedAt` (F-10). Un segundo `commit`/`verify` → 409 (single-use).
- **AC-6:** El taller ve el **QR en pantalla** desde el detalle del invite incluso tras recargar la página (imagen persistida en R2 vía URL firmada — re-display sin token, S-1); la respuesta del detalle no contiene `token` ni `link`. En la creación, el botón de WhatsApp usa el `whatsappUrl` de esa única respuesta.
- **AC-7:** Tras cada reclamo exitoso se emite `vehicle-claim.claimed` post-commit y el taller recibe el mail (o log de skip si `Workshop.email` es null); el reclamante con cuenta recibe confirmación.

### Casos borde
- **AC-8 (link expirado):** con `expiresAt < now`, el GET responde `status: expired`, `canVerify: false`, **sin ningún dato del vehículo**; `verify`/`commit` → error no disponible; el invite pasa a `expired` en BD (lazy) y el listado del taller lo muestra `expired`.
- **AC-9 (ya usado):** invite `claimed` → GET/verify/commit responden "no disponible" sin datos; el `usedAt` original no cambia.
- **AC-10 (revocado):** revoke por el taller → idem AC-9 con `status: revoked` y `revokedByUserId`/`revokedAt` seteados; emit `vehicle-claim.revoked`.
- **AC-11 (vehículo con dueño activo):** sesión ≠ titular → `claim_blocked` en el `commit`, fila en `VehicleClaimAttempt` con `claim_blocked`, mail al titular **y** al taller, y **cero** cambios en `vehicle_ownerships`.
- **AC-12 (titular legítimo):** sesión == titular activo → `claimed/already_owner` sin crear segunda fila de ownership (el índice D-155 sigue intacto).
- **AC-13 (datos incorrectos / anti-enumeración):** patente inexistente, patente de otro vehículo, VIN incorrecto y rango de odómetro incorrecto producen **bytes idénticos** de respuesta 400 (mismo `message`, mismo status); cada uno incrementa `failedAttempts` y crea una fila de intento.
- **AC-14 (escalera F-4 + throttle S-3):** 5 fallos dentro de la ventana de 15 min → `verificationLockedAt` seteado + `lockoutCount: 1` + fila `lockout_started`, taller notificado; intentos dentro de los 30 min reciben el mensaje de lock (sin datos del vehículo); a los 30 min el lock **se libera solo** (`lockout_released`) y el dueño verifica normal. Tercer lockout → `revoked(max_attempts)` + fila `auto_revoked` + mail al taller; la única salida es un invite nuevo (F-6). Cada lock/liberación/revocación deja fila en `VehicleClaimAttempt`. El throttle por token permite como máximo 10 GET/min (bootstrap) y 5/5 min para challenge, verify y commit; pasarse devuelve 429 sin filtrar datos.
- **AC-15 (sin dato verificable → revisión manual):** vehículo sin VIN y sin `mileageIn` en su última atención → patente OK deja el invite en `manual_review` (nunca `claimed`); el `commit` con sesión vincula `claimantUserId`; `approve` → `claimed/ownership_created`; `approve` antes de vincular cuenta → 409; `reject` → `revoked(manual_review_rejected)`.
- **AC-16 (vehículo eliminado/dado de baja):** hard-delete (sin historial) → Cascade elimina el invite → GET responde 404 genérico; soft-delete (`deletedAt`, ADR-005) → al acceder el invite queda `revoked(vehicle_deleted)`, responde "no disponible" y el taller es notificado.
- **AC-17 (revocación devuelve a "sin titular"):** revoke de un invite `claimed/ownership_created` → el ownership creado queda `endsAt` seteado (`acquiredByClaimInviteId` guard con `endsAt: null`), no existe ownership primario activo, el reclamante recibe mail; revoke de un invite sin consumir no toca ownerships.
- **AC-18 (normalización de patente):** generar/verificar con `" abc123 "` matchea `ABC123` y con `abc123` también (D-037/D-042).
- **AC-19 (celular no es auth):** ningún endpoint del módulo acepta `phone` como credencial; no existen rutas OTP; `ownerPhone` solo aparece en respuestas autenticadas del taller.
- **AC-20 (scoping):** un miembro del taller B con los permisos no puede leer ni revocar invites del taller A (404) y en contexto PERSONAL recibe 403 `WorkshopOnlyGuard`.
- **AC-21 (calidad):** `npm run build` y `npm test` verdes (specs de handlers/controllers nuevos: máquina de estados, anti-enumeración single-use, hash lookup, challenge F-3, ticket F-10, guard order por reflection, scoping); migración aditiva aplicada en dev; seed re-ejecutable idempotente con los 4 permisos nuevos.
- **AC-22 (solo primer cierre):** dado un vehículo sin invites, el primer `care-episode.closed` crea el invite (`pending`, con `careEpisodeId`); un segundo cierre (mismo u otro taller) **no** crea ni modifica invites; si el invite vigente expiró, el cierre lo **reactiva** (T18: mismo `id`, token+hash nuevos, contadores en 0 — F-12); si el último está `revoked`, el cierre **no** hace nada y la única salida es `POST /api/vehicle-claims` (invite nueva — F-6); si el vehículo ya fue reclamado (`claimed`) **o tiene titular activo** (cualquier origen), el cierre no genera nada (F-1).
- **AC-23 (sin canal de reclamo):** vehículo con registro activo `VehicleOwnerContact.status=unavailable` (o sin registro): el cierre genera el invite igual con `ownerPhone: null`; el listener salta el envío (sin `whatsappUrl`); el panel del taller muestra QR/link (re-display); ningún mail con link sale del backend.
- **AC-24 (titular activo → omisión con aviso, F-1):** `care-episode.closed` (o `POST /api/vehicle-claims`) sobre un vehículo con ownership primario activo **no** genera invite: el listener registra `skipReason: active_owner` (log por `vehicleId`), el panel muestra el aviso "Este vehículo ya tiene titular; no se envió invitación" (nunca silencio) y el endpoint manual responde 409 `active_owner` con ese copy; en BD no se crea fila.
- **AC-25 (nunca aprobación solo con patente, D-VC-2):** con cualquier dato verificable disponible (VIN registrado **o** `mileageIn` en la última atención), un `verify` que solo acierta la patente **no** llega a `verified`; sin ningún dato verificable, el invite queda en `manual_review` y **jamás** en `claimed` sin `approve` humano.
- **AC-26 (F-10, verificar → registrar → reclamar):** `verify` exitoso devuelve ticket y deja el invite en `verified` **sin** setear `usedAt`; `commit` sin sesión → 401 `AUTH_REQUIRED` (el frontend redirige a `/register` o `/login` con `?next=` preservando el token) y el invite sigue `verified`; `commit` con ticket vencido → 401 `TICKET_EXPIRED` y el invite vuelve a `verification_required` con `verifiedAt: null` **sin** incrementar `failedAttempts` ni `lockoutCount`; `commit` con sesión y ticket válido → `claimed` + `usedAt` seteado. Un ticket de otro `inviteId` → 401.
- **AC-27 (aviso pasivo, no confirmación):** al pasar a `claimed`, se emite el aviso al taller (mail + ítem en el panel) con nombre del reclamante y patente; **no** existe estado ni paso de confirmación del taller y el reclamo es válido sin intervención suya; el taller puede revocar con un click y el ownership se deshace (AC-17).
- **AC-28 (disputa del dueño real, fase posterior):** `POST /api/vehicle-claims/public/dispute` sobre un invite `claimed` → 202 con `id` y fila `VehicleClaimDispute` (`status: open`, evidencia en R2); sobre un invite no `claimed` → 409; la resolución solo la puede hacer HCDV (`reviewedById`), y a favor del disputante revoca el invite (`revoked(dispute_lost)`), deshace el ownership indebido y reasigna con `resolution` + `resolvedAt` auditados.

---

## 9. Casos borde y riesgos

| Caso / riesgo | Comportamiento / mitigación |
|---|---|
| Link fotografiado/reenviado a un tercero (fuga más probable) | La verificación (patente + factor) filtra; el tercero sin factor cae a fallo → taller notificado (T3/T4). Mitigación D-VC-10: taller confirma celular antes de enviar y tiene QR de respaldo |
| Claim squatting: alguien reclama antes que el dueño real | Primer reclamo gana (decisión asumida) + mitigaciones: **aviso pasivo al taller** en cada reclamo (sin confirmación), log de intentos, revoke que deshace el ownership → "sin titular" (AC-17) y **disputa del dueño real** revisada por HCDV (D-TL-VC-16) |
| Multiple choice del odómetro: acierto por azar (F-3) | **Riesgo residual aceptado y documentado:** 4 opciones + 5 intentos ⇒ ~76% de acierto por azar (`1 − (3/4)^5`); las opciones revelan una ventana de ~1.500 km. **Filtra accidentes, no autentica.** Se apoya en aviso pasivo + revocación + disputa. La inversión real post-piloto es OTP al celular |
| Vehículos sin VIN caen al régimen débil del odómetro | **Palanca recomendada (no obligatoria):** capturar el VIN en el ingreso (foto del parabrisas — 5 s, spec `workshop-checkin-flow.md` RF-4). Cada vehículo con VIN sale del multiple choice y usa verificación fuerte (últimos 4) |
| Reclamo "exitoso" con solo la patente (patente es pública) | Nunca: con dato verificable disponible el segundo factor es obligatorio; **sin** dato disponible → solo `manual_review` (D-VC-2) |
| Invite activo duplicado por bug/regresión | Índice único parcial en BD (T1) |
| Vehículo sin canal de reclamo (contacto `unavailable`) | El invite se genera igual en el primer cierre con `ownerPhone: null`; ruta QR en mostrador / link manual (D-TL-VC-9, AC-23); un cierre posterior no re-genera — el respaldo es el re-display del panel |
| Carrera de dos claims concurrentes | `updateMany` atómico + índice D-155 → segundo recibe P2002 → `claim_blocked` |
| Fallo de mail post-commit | D-109: mail nunca revierte; listener con try/catch y log por `inviteId` (sin token) |
| `Workshop.email` null | Skip con warn (patrón listeners existentes); el panel in-app es el respaldo |
| Estado `expired` "fantasma" en listados | El listado calcula el status efectivo (no depende del lazy write) |
| ~~Tokens crudos en BD~~ **cerrado (S-1)** | En BD solo `tokenHash` (SHA-256); el token en claro existe únicamente en la respuesta de creación, en el QR persistido (R2) y en el navegador del dueño. Riesgo residual: filtración por URL (proxy/historial/`Referer`) — cubierta por single-use + expiración 7d + rate-limit (controles independientes, §6.1) |
| PII de IP/UA en `VehicleClaimAttempt` | **Cerrado (S-2):** IP **truncada** (/24 IPv4, /48 IPv6) + retención de **90 días** (depuración por runbook — sin cron en repo); política definitiva pendiente de asesoría legal |
| Roles de taller **custom** no reciben `vehicle-claim.*` | Mismo problema S-2 de F-023: documentado; recomendación MVP = aceptar y documentar |
| Cierre de atención (comando `close` = B-4, provisto por el spec paralelo) | Listener `care-episode.closed` con reglas de primer cierre (D-TL-VC-9); la vía explícita queda como acción manual del taller (F-6) |
| El claimant nunca vincula cuenta (`manual_review` eterno) | Rechazo manual o expiración por `expiresAt` (7 días); ver §6.4 |
| Cierre sobre vehículo con titular activo (transferencia posterior a la generación) | Sin invite nuevo (F-1: aviso en panel); los invites ya creados resuelven por identidad en el commit — `already_owner` o `claim_blocked` (T8/T9, D-TL-VC-12) |

---

## 10. Decisiones del fundador: resueltas y abiertas

### Resueltas y aplicadas al documento (2026-11-01)
- **S-1 — token hasheado + QR persistido en R2:** D-TL-VC-3, §3.1 (`tokenHash`, `qrObjectKey`), §6.1, AC-1/AC-2/AC-6, PR-1/PR-3.
- **S-2 — IP truncada + retención 90 días:** §3.1 (`ip` /24, /48), §6.4, §9.
- **F-1 — titular activo → se OMITE el invite:** D-TL-VC-9 (regla 2), T1, §9, AC-22/AC-24; T8/T9 quedan como guarda residual (D-TL-VC-12).
- **F-2 — el VIN EXCLUYE al odómetro:** D-VC-2 (§1.3), D-TL-VC-6, T5, §5.1, §6.6, AC-4.
- **F-4 — lock 30 min + auto-revocación al 3er lockout:** §6.4, T4/T19, `lockoutCount`, AC-14.
- **F-5 — `review`/`revoke` solo `owner` + `super_admin`:** D-TL-VC-10, §3.2.
- **F-6 — `POST /api/vehicle-claims` conservado como única salida tras `revoked`/`claim_blocked`:** D-TL-VC-9 (regla 4), T1.
- **F-12 — rotación de token+hash al reactivar (T18):** T18, §6.2.
- **F-3 — odómetro por multiple choice (solo sin VIN):** D-TL-VC-13, D-VC-2, §4 (T5), §5.1 (`/challenge`), §6.6, AC-4/AC-13. Riesgo residual ~76% documentado como aceptado (§9).
- **S-3 — números de throttle y ventana del lock:** §6.3 (GET 10/min por token, POST 5/5 min por token, ventana de conteo 15 min), §6.4 (5 fallos → lock 30 min, 3 lockouts → auto-revocación).
- **F-10 — orden VERIFICAR → REGISTRAR/LOGIN → RECLAMAR:** D-TL-VC-14, §3.1 (`verifiedAt`, `usedAt` solo en `claimed`), §4 (T5/T7-T10/T20), §5.1 (`/verify` devuelve ticket, `/commit` lo consume), AC-5/AC-26.
- **Aviso pasivo al taller (confirmación obligatoria descartada):** D-TL-VC-15, §7, AC-27, §9.
- **Disputa del dueño real:** D-TL-VC-16, §3.1 (`VehicleClaimDispute`), §5.1 (`POST .../public/dispute`), §5.3 (cola HCDV), AC-28, fase posterior en §11.

### Abiertas (requieren confirmación) — ⛔ = bloqueante para el PR indicado

#### Fundador
- **F-7 (menor, no bloqueante):** el override `ownerPhone` del body de `POST /vehicle-claims` (§5.2) ¿solo afecta el snapshot del invite (propuesto — no escribe `VehicleOwnerContact`, tabla dueña del módulo de check-in) o debe corregir el registro de contacto (implica write cross-module, RF-6)? *La fuente del teléfono ya está fijada por el spec paralelo: registro activo `VehicleOwnerContact`, campo `phoneE164` (D-173).*
- ~~**F-8**~~ **RESUELTA → endpoint nuevo:** revocación por super_admin: `POST /api/admin/vehicle-claims/:id/revoke` con permiso dedicado `admin.vehicle-claims.manage` (§5.3, plan 02 §11). *Nota al margen: al momento de escribir, la fila F-8 sigue listada en la tabla de "aún abiertas" de `DECISION-REGISTER.md` (~:5305) con esa misma recomendación por defecto ("Endpoint nuevo con permiso dedicado"); al cerrarla formalmente en el registro, actualizar esa fila.*
- **F-9:** ¿los estados terminales del link se distinguen en el copy (`expired` vs `revoked` vs `claimed`, propuesto) o un único "este reclamo ya no está disponible"?
- **F-11:** cuando el propietario **ya tiene cuenta**, ¿además del WhatsApp manual se le envía el mail de invitación automático (propuesto opcional) o solo el envío manual del taller?

#### Security
- **S-4:** asignación de `vehicle-claim.*` a roles custom de taller (procedimiento: aceptar y documentar, recomendado).

#### PM / producto
- **P-1:** métricas del piloto: ¿`meta.counts` del listado alcanza (propuesto) o se quiere un bloque en el dashboard?
- **P-2 ⛔ (bloquea PR-6, contenido):** copy de la página pública "Reclamá tu vehículo" y de los 4 mails (es-AR, tono Autentia) — aprobación de contenido.

---

## 11. Orden de implementación (por PRs)

| PR | Alcance | Archivos principales |
|---|---|---|
| **PR-1 — Schema + seed + deps** | Modelos/enums nuevos (incl. `tokenHash` unique — **sin** token crudo, S-1 —, `qrObjectKey`, `lockoutCount`, `verifiedAt`, outcomes de lockout en intentos, `VehicleClaimDispute` con su enum), FK `VehicleOwnership.acquiredByClaimInviteId`, 2 índices únicos parciales (SQL manual), 4 permisos en seed + matriz F-5 (`review`/`revoke` solo `owner`), dependencia nueva `qrcode` en `package.json` (QR backend, S-1). Sin lógica. | `prisma/schema.prisma`, `prisma/migrations/<nueva>`, `prisma/seed.ts`, `package.json` |
| **PR-2 — API pública** | Módulo + controller público (`GET` bootstrap / `GET challenge` / `verify` con ticket / `commit`, lookup por **hash** del token — S-1, F-10), handlers con máquina de estados (incl. escalera de lock F-4), DTOs, throttles S-3 (incl. bucket `vehicleClaimToken` en `app.module.ts`), log de intentos, eventos `vehicle-claim.*`, specs unitarios (matriz de estados, anti-enumeración, single-use, hash lookup, challenge F-3, ticket F-10). | `src/modules/vehicle-claims/**`, `src/app.module.ts` |
| **PR-3 — API taller** | Controller autenticado (create idempotente con **generación del QR y subida a R2** — S-1, `link`/`whatsappUrl` one-time — / list / detail con `qrImageUrl` firmada / approve / reject / revoke con deshace de ownership), guards + permisos, scoping por taller, specs de guard order y revoke. | `src/modules/vehicle-claims/controllers`, commands de revoke/review/create, specs |
| **PR-4 — Notificaciones** | Templates + métodos `MailService` + listeners `@OnEvent` + tests de listeners (skip sin `Workshop.email`, sin PII, sin token en logs). | `src/common/mail/mail.types.ts`, `mail.service.ts`, `src/modules/vehicle-claims/listeners/**` |
| **PR-5 — Admin + métricas** | Endpoint de revoke admin (`administration`) + `meta.counts` del listado (**`meta.counts` ya implementado** — queda solo el endpoint). | `src/modules/administration/controllers/administration.controller.ts`, `administration.module.ts`, `revoke-claim.command/handler`, `prisma/seed.ts` (permiso admin) |
| **PR-6 — Frontend (`web-follow-app`)** | Página pública `/reclamo/[token]` **fuera** de `(dashboard)` (precedente `src/app/transfer/qr/[token]/page.tsx` e `invitations/[token]/page.tsx`) con el control pre-verificación, el **multiple choice de rangos** (F-3) y el salto a `/register`/`/login` con `?next=` + ticket (F-10); panel del taller (generar, confirmar celular, QR persistido S-1, `wa.me` en la creación, revocar, cola de revisión manual, aviso "ya tiene titular" F-1); tipos + funciones API. | `web-follow-app/src/app/reclamo/[token]/page.tsx`, componentes del panel, `src/lib/api.ts`, `src/types/vehicle-claim.ts` |
| **PR-7 — Hook `care-episode.closed`** (depende de la fase C del spec de check-in) | Listener `@OnEvent('care-episode.closed')` → reglas de primer cierre (generar / reactivar / nada — D-TL-VC-9) + spec del flujo en `docs/specs/`. | `src/modules/vehicle-claims/listeners/`, `docs/specs/vehicle-claim-flow.md` |
| **PR-8 — Disputa del dueño real** (fase posterior, no bloquea el piloto) | `POST /public/dispute` + cola admin de HCDV (listar/resolver) + resolución que revoca y reasigna con auditoría (D-TL-VC-16, AC-28). El modelo `VehicleClaimDispute` ya entra en PR-1. | `src/modules/vehicle-claims/**`, `src/modules/administration/**` |

**Precondiciones/orden:** PR-1 → PR-2 → PR-3 → (PR-4 ∥ PR-5) → PR-6. PR-7 requiere la **fase C** de `docs/specs/workshop-checkin-flow.md` (comando `close` + evento `care-episode.closed`); la fase F de ese spec ("conexión con reclamo") es el lado de allá de este mismo PR. **PR-8 (disputa) es fase posterior** y no bloquea el piloto: el modelo entra en PR-1, el flujo en PR-8.

### Checklist de revisión (antes de delegar)
- [ ] D-TL-VC-1..16 aceptados (o refutados con alternativa)
- [ ] §3.2 (corrección del supuesto sobre `VehicleOwnership.userId` / CHECK XOR) validado con el fundador
- [ ] AC-1..AC-28 mapeados a tests manuales/automatizados
- [ ] Control pre-verificación (AC-3) con test de contrato
- [x] Decisiones del fundador aplicadas (2026-11-01): S-1, S-2, F-1, F-2, F-3, F-4, F-5, F-6, F-10, F-12, S-3, aviso pasivo, disputa
- [x] **F-8 → endpoint nuevo con permiso dedicado** (§5.3, contrato en plan 02 §11)
- [ ] Pendientes (§10): F-7, F-9, F-11, S-4, P-1, **P-2 ⛔ (único bloqueante, contenido)**
- [ ] Contratos públicos alineados con la página frontend (copy de estados)
- [ ] Migración aditiva + índices parciales verificados en dev

---

*Fin del diseño técnico del módulo de reclamos de vehículos — no implementar hasta aprobación de las decisiones abiertas (§10).*
