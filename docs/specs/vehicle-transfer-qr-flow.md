# Especificación: Fase 3 — Transferencia por QR (presencial / concesionaria)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-16
> **Estado:** Lista para diseño técnico (Tech Lead) — decisiones D-079..D-086, D-088, D-090 confirmadas
> **Basado en:** DECISION-REGISTER sección 25 (D-079..D-086, D-088, D-090), spec Fase 1 v2, código verificado
> **Código afectado:** `prisma/schema.prisma` + migración (`VehicleTransferQr`), `src/modules/vehicles/*` (nuevos commands/queries QR), `frontend/src/app/(auth)/transfer/qr/[token]/page.tsx` (nuevo), `frontend/src/app/(dashboard)/vehicles/[id]/*` (generar QR), frontend scanner

---

## 1. Problema

El flujo de transferencia por email (Fase 1) requiere que el emisor **conozca la cuenta (email)** del receptor. En ventas presenciales o concesionaria el emisor (o el concesionario) **no conoce la cuenta del comprador**, y el comprador tampoco quiere compartir email si no es necesario. Además, el flujo por email tiene un TTL de 7 días — ventana larga para un bearer de transferencia.

Se necesita un mecanismo de transferencia **presencial, anónimo para el receptor**, con consentimiento explícito al aceptar.

## 2. Objetivo

Implementar la transferencia mediante **QR escaneable** (D-080..D-086, D-088, D-090):

1. **Modelo**: `VehicleTransferQr` (token único, expiresAt, source, consumido una sola vez).
2. **Generación**: el owner crea un QR presencial (1h) o de concesionaria (48h); un solo QR activo por vehículo (409 si hay otro pendiente, D-079).
3. **Consumo**: cualquier usuario autenticado escanea → preview idempotente → confirmación de identidad → aceptación one-shot que completa la transferencia en transacción atómica (D-081, D-082, D-083).
4. **Deep link**: `FRONTEND_URL/transfer/qr/{token}` (D-080) con ruta `(auth)` protegida.
5. **Expiración**: detección + evento `expired` + email solo al emisor (D-088).
6. **Frontend**: generación (QR visible/descargable) + escáner (`html5-qrcode`, D-090) + pantalla de confirmación.

## 3. Actores

| Actor | Acceso |
|---|---|
| Owner activo | Genera QR (presencial/concesionaria), revoca QR pendiente, ve countdown/estado. |
| Cualquier usuario autenticado (receptor walk-in) | Escanea/resuelve deep link → preview → confirma identidad → acepta. |
| Concesionario (sin rol) | No es actor de sistema: imprime/exhibe el QR generado por el owner (D-085: solo TTL + metadata source). |
| No autenticado | El deep link redirige a login y vuelve al QR (no puede ver preview sin sesión). |
| super_admin | Sin cambios en esta fase. |

## 4. Decisiones de producto aplicables

| ID | Decisión | Implementación |
|----|----------|----------------|
| D-079 | 1 QR activo por vehículo; rechazar 409 con mensaje + revocación explícita del owner | Command de generación + revoke |
| D-080 | Deep link `HTTPS FRONTEND_URL/transfer/qr/{token}`; token en path; requiere auth | Ruta `(auth)/transfer/qr/[token]` |
| D-081 | Aceptación QR → `completed` directo, transacción atómica (`requested → ownership_closed → ownership_created → completed`) | Command `accept-transfer-qr` |
| D-082 | Cualquier usuario autenticado escanea + confirmación explícita de identidad; el QR jamás nombra al destinatario | Pantalla de confirmación |
| D-083 | Preview (GET) idempotente/reutilizable; solo accept consume el token | `GET .../qr/:token` + accept one-shot + throttling en preview |
| D-085 | Concesionaria = solo TTL + metadata `source: 'presencial' \| 'concesionaria'` | Campo source en token |
| D-086 | TTLs: presencial 1h (3600s) / concesionaria 48h (172800s) | `expiresAt` server-side |
| D-088 | Expiración: evento `expired` + notificar solo al emisor | Detección (lazy/sweeper, decisión TL) + listener email |
| D-090 | Frontend: `qrcode.react` (generación) + `html5-qrcode` (escaneo) | 2 dependencias nuevas |

Complementos de Fase 1 aplicables: las respuestas de transferencias son simétricas (D-078), el panel ya maneja estados (badge) y notificaciones email existentes (D-087: email solamente).

## 5. Modelo de Datos — `VehicleTransferQr`

```prisma
model VehicleTransferQr {
  id               String       @id @default(uuid()) @db.Uuid
  vehicleId        String       @map("vehicle_id") @db.Uuid
  createdByUserId  String       @map("created_by_user_id") @db.Uuid
  token            String       @unique
  status           QrStatus     @default(pending)  // pending | consumed | expired | revoked
  source           String       @default("presencial") // 'presencial' | 'concesionaria' (D-085)
  expiresAt        DateTime     @map("expires_at")
  consumedAt       DateTime?    @map("consumed_at")
  consumedByUserId String?      @map("consumed_by_user_id") @db.Uuid
  revokedAt        DateTime?    @map("revoked_at")
  createdAt        DateTime     @default(now()) @map("created_at")

  vehicle  Vehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  createdBy User   @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)
  consumedBy User? @relation(fields: [consumedByUserId], references: [id], onDelete: SetNull)

  @@index([token])
  @@index([vehicleId, status])
  @@map("vehicle_transfer_qrs")
}
```

Convenciones del modelo (verificar con Database/TL):

- `token` único aleatorio (crypto random, formato recomendado: `nanoid`/`randomUUID` sin guiones o similar; decisión TL).
- **Invariante**: como máximo un `VehicleTransferQr` con `status='pending'` y `expiresAt > now` por vehículo — enforced en el command de generación (check previo + 409 D-079; opcional: índice parcial único `@@unique([vehicleId, status])` con condición, decisión Database).
- `VehicleTransfer` asociado: al aceptar se crea `VehicleTransfer` `completed` (D-081) con `acquiredByTransferId` en la nueva ownership (mismo patrón que `accept-transfer`). El QR referencia al transfer creado (agregar `transferId String?` si se requiere para trazabilidad — decisión Database/TL).
- El `VehicleTransferEvent` registra: `qr_generated` (opcional), `requested`, `ownership_closed`, `ownership_created`, `completed` al aceptar; `expired` y `revoked` para el QR.

## 6. Contrato Backend — endpoints QR

### 6.1 Generar QR

**`POST /vehicles/:id/qr`** (JwtAuth, ownership-only por handler — patrón existente) — body: `{ source: 'presencial' | 'concesionaria' }`

- Valida owner activo (`ownerships[0].userId === userId`); 403 si no.
- Check invariante: si existe QR `pending` **no vencido** para el vehículo → **409 CONFLICT** (D-079) con mensaje: "Ya existe un QR pendiente para este vehículo. Vencimiento: {expiresAt}. Podés revocarlo o esperar su vencimiento." + data (qrId, expiresAt).
- Crea QR con TTL según source (D-086): `expiresAt = now + (presencial ? 3600 : 172800) segundos`.
- Responde:

```jsonc
{
  "id": "...", "token": "abc123...", "source": "presencial",
  "status": "pending", "expiresAt": "...",
  "url": "https://frontend/transfer/qr/abc123...",   // D-080 (FRONTEND_URL)
  "secondsRemaining": 3600
}
```

- Emite evento `vehicle.transfer.qr_generated` (listener futuro opcional; no requerido MVP).

### 6.2 Preview (idempotente, D-083)

**`GET /vehicles/transfer/qr/:token`** (JwtAuth obligatorio) → si no autenticado, el frontend redirige a login con `?next=` (precedente D-028) y vuelve.

- Resuelve token → 404 "QR inválido o expirado" si no existe.
- Reglas de estado:
  - `revoked` → 410 GONE (o 404 uniforme; decisión TL) mensaje "QR revocado".
  - `consumed` → 409 "QR ya utilizado" (el frontend lo usa para mostrar estado).
  - `pending` + `expiresAt > now` → 200 preview.
  - `pending` + vencido → 410 (lazy-mark `expired` + status) mensaje "QR expirado".
- NO consume (idempotente); aplicar throttling (anti-enumeración, D-083 nota).

Preview 200:

```jsonc
{
  "status": "pending",
  "source": "presencial",
  "expiresAt": "...",
  "vehicle": { "id": "...", "licensePlate": "ABC123", "manufactureYear": 2018, "modelYear": 2019, "color": "Rojo" },
  "fromUser": { /* id, firstName, lastName, alias — D-078, sin email */ },
  "notes": null
}
```

### 6.3 Aceptar QR (one-shot, D-081/D-082/D-083)

**`POST /vehicles/transfer/qr/:token/accept`** (JwtAuth) — body: `{ confirmation: "ACEPTAR" }` (o `confirmation: true`; formato a decisión TL. Requisito de producto: el frontend manda una **confirmación explícita de identidad**, D-082).

- Valida sesión (el receptor es el usuario autenticado).
- Resuelve token: 404 / 410 (revoked/expirado) / 409 (ya consumido).
- Chequea que el usuario autenticado **no sea el emisor** (`createdByUserId !== userId`) → 400 "No podés aceptar tu propio QR".
- En **transacción atómica** (patrón `accept-transfer`):
  - Marca QR `consumed`, `consumedAt`, `consumedByUserId`.
  - Cierra ownership actual (`endsAt = now`) + evento `ownership_closed`.
  - Crea ownership nueva del receptor (`startsAt`, `acquiredByTransferId`) + evento `ownership_created`.
  - Crea `VehicleTransfer` `completed` con `requestedAt`, `completedAt` + eventos `requested` y `completed`.
  - (Si existe transferencia email pendiente para el vehículo → decidir: 409 "hay solicitud pendiente" — D-079 espíritu; o completar igual invalidando la pendiente. **DECISIÓN PM**: 409 CONFLICT, forzar cancelar la email pendiente antes de aceptar QR — evita dos ownership/transfers activos).
- Emite evento `vehicle.transfer.accepted` (email al emisor — listener existente).
- Responde la transferencia completada (shape D-078).

### 6.4 Revocar QR (D-079)

**`DELETE /vehicles/:id/qr`** (JwtAuth, ownership-only) — revoca el QR pending activo.

- 404 si no hay QR pendiente.
- Marca `revoked` + evento `VehicleTransferEvent` tipo `cancelled` (trazabilidad D-014, nota D-079).
- Responde 200 `{ id, status: 'revoked' }`.

### 6.5 Expiración (D-088)

- Mecanismo (decisión TL — D-TL-2 en spec Fase 1): lazy-on-read (marcar `expired` al resolver preview/accept) + sweeper in-process opcional (Fase 3) para persistir y notificar al emisor.
- El requisito de producto: detectar `pending` con `expiresAt < now` → persiste `expired` → evento `expired` en `VehicleTransferEvent` → email al emisor "Tu QR expiró" + CTA regenerar. (El email al emisor: mismo patrón que `transfer-request-email.listener`.)

## 7. User Journeys

### 7.1 Flujo principal — Venta presencial con QR

```
Actor: Owner autenticado (contexto PERSONAL) + comprador walk-in
  ↓
Owner: /vehicles/[id] → "Transferir" → elegir modo "QR presencial" → Generar (POST /qr, source presencial)
  ↓
Sistema: crea QR 1h → muestra QR (qrcode.react) + countdown + opciones (Descargar/Revocar)
  ↓
Owner: muestra el QR al comprador
  ↓
Comprador: escanea con su app/cámara (html5-qrcode) → abre FRONTEND_URL/transfer/qr/{token}
  → si no está autenticado → login (redirect next) → vuelve
  ↓
Sistema (preview GET, idempotente): muestra vehículo + emisor (alias/nombre, sin email) + origen + vencimiento
  ↓
Comprador: confirma identidad ("Confirmo que soy {nombre} y acepto recibir este vehículo") → Aceptar
  ↓
Sistema (accept one-shot): transacción atómica → QR consumed → ownership transferida → transfer completed → email al emisor
  ↓
Resultado: el comprador ve "Transferencia completada"; el vehículo aparece en "Mis vehículos";
  el emisor recibe email y ve el estado en su panel (Enviadas → Completada); el timeline registra el evento.
```

### 7.2 Flujo alternativo — QR ya consumido

```
Sistema: GET preview → 409 "QR ya utilizado"
  ↓
Resultado: pantalla de estado (sin acciones); si el emisor necesita repetir, genera nuevo QR
```

### 7.3 Flujo alternativo — QR expirado (presencial >1h o concesionaria >48h)

```
Sistema: preview/accept detecta expiresAt pasado → persiste expired + evento + email al emisor
  ↓
Resultado (receptor): pantalla "QR expirado" + CTA regresar.
  Resultado (emisor): puede regenerar (nuevo POST) o revocar (si aún pending).
```

### 7.4 Flujo alternativo — Revocar QR

```
Owner: acción "Revocar QR" (solo pending) → confirmar → DELETE
  ↓
Resultado: QR revoked + evento cancelled. El vehículo queda libre para nuevo QR.
```

### 7.5 Flujo alternativo — Conflicto: QR o transferencia email pendiente

```
Owner: intenta Generar QR con transferencia email pending vigente → DECISIÓN PM: 409 con instrucción
  (resolver primero: cancelar/rechazar la solicitud email). 
  (La transferencia email y el QR no pueden convivir activos.)
Receptor: intenta Aceptar QR con transferencia email pending para el mismo vehículo
  → 409 "Ya existe una solicitud de transferencia pendiente para este vehículo".
```

### 7.6 Flujo concesionaria

```
Idéntico al 7.1 salvo: TTL 48h (D-086) + origen "Concesionaria" (D-085). El owner puede imprimir/entregar el QR.
```

## 8. Requisitos Funcionales (RF)

### RF-1 — Migración

- `VehicleTransferQr` + índice token + índice (vehicleId, status) + (opcional) índice parcial único. Revisar FK onDelete (Restrict/SetNull) con Database.

### RF-2 — Backend: generación (POST /vehicles/:id/qr)

- Ownership-only; TTL por source; invariante 1 QR activo (409 D-079); URL D-080 armada con `FRONTEND_URL` (envs.ts ya la expone).
- Anti-enumeración / validity: token no adivinable (entropía suficiente).

### RF-3 — Backend: preview (GET /vehicles/transfer/qr/:token)

- Auth obligatorio (JwtAuth); idempotente; throttle; estados (404/409/410) con mensajes MAPPED en frontend.

### RF-4 — Backend: accept (POST .../accept)

- Auth obligatorio; one-shot en transacción; confirmación de identidad (D-082); chequeo "no soy el emisor"; **conflicto con transferencia email pendiente → 409 (decisión PM)**; timestamp modelado (requestedAt/completedAt); eventos + email.
- La transacción replica a `accept-transfer.handler` (reutilizar lógica — evaluar extraer servicio compartido; decisión TL).

### RF-5 — Backend: revoke (DELETE /vehicles/:id/qr)

- Ownership-only; solo pending; marca revoked + evento cancelled.

### RF-6 — Backend: expiración (D-088)

- Lazy-on-read (preview/accept marcan expired) + sweeper opcional; evento `expired`; email al emisor.

### RF-7 — Frontend: deep link + preview/confirmación

- Ruta `(auth)/transfer/qr/[token]/page.tsx`: si no autenticado → `login?next=/transfer/qr/{token}`; si autenticado → preview (vehículo + emisor + origen + vencimiento) con botón "Aceptar y recibir vehículo" → confirmación explícita → mutación → pantalla final (éxito/error/consumido/expirado).
- Sin email de contraparte (D-078).

### RF-8 — Frontend: generación en vehículo

- En `/vehicles/[id]` dentro del flujo Transferir (o panel): modo QR → selector presencial/concesionaria (D-085) → muestra QR (qrcode.react), URL, countdown, botones "Descargar/Imprimir" y "Revocar". Estado 409 si hay otro QR activo (con CTA revocar).
- El countdown se calcula de `expiresAt` (server-side), no local.

### RF-9 — Frontend: escaneo (D-090)

- Página de escaneo (Vender/Panel → "Escanear QR") con `html5-qrcode` (cámara + upload) + **fallback manual de ingreso de token** (nota D-090). Tras detectar la URL, navega al deep link.

### RF-10 — Frontend: tipos y errores

- `VehicleTransferQr` type + `QrStatus`; mapeo de errores (404/409/410) con copy en español (voseo). El panel de Enviadas usa el nuevo estado (QR consumed → transfer completed; QR revoked → panel sin entrada de transferencia).

## 9. Alcance

### Dentro (Fase 3)

- Migración `VehicleTransferQr`.
- Backend: 4 endpoints (generar/preview/accept/revoke) + expiración (lazy + sweeper opcional).
- Frontend: deep link + preview/confirmación, generación en vehículo (modo QR del TransferDialog), escaneo, fallback manual.
- Tests backend + frontend. Accesibilidad (banners, labels de contraparte).

### Fuera (esta fase)

- Rol de concesionaria como actor de sistema (D-085: solo metadata; el dealer real es post-MVP).
- Notificaciones in-app (D-087: email solamente).
- Impresión en papel con branding.
- QR para "historial compartido" (VehicleShare ya cubre lectura; este QR es de transferencia).

## 10. Decisiones delegadas al Tech Lead / Database

1. **Formato del token** (entropía/longitud; `nanoid` vs UUID) y dónde se genera.
2. **Índice parcial único** para el invariante 1-QR-pendiente (PostgreSQL partial unique index con WHERE status='pending').
3. **Códigos de estado preview**: 404 uniforme vs 410 GONE para revoked/expired (consistencia con APIs existentes).
4. **Reutilización de la transacción de `accept-transfer`** (extraer servicio vs replicar).
5. **Sweeper D-088**: intervalo, batch, decisión de no-introducir `@nestjs/schedule` (preferencia: setInterval in-process, precedent D-TL-2).
6. **Confirmación de identidad**: formato del body de accept (string vs boolean) — requisito funcional es "confirmación explícita".
7. **FK/onDelete** del modelo (`Restrict` vs `SetNull` para `consumedBy`).
8. **Protección de la página de confirmación** contra CSRF/clickjacking (machanismos existentes; Security).

## 11. Criterios de Aceptación

### Backend

- [ ] Dado un owner con vehículo sin QR, cuando hace `POST /vehicles/:id/qr { source: 'presencial' }`, entonces responde QR con `expiresAt ≈ now + 3600s` y URL canónica con FRONTEND_URL.
- [ ] Dado un owner, cuando hace `POST ... { source: 'concesionaria' }`, entonces `expiresAt ≈ now + 172800s`.
- [ ] Dado un QR pending activo, cuando el owner genera otro, entonces responde 409 con dato del QR existente.
- [ ] Dado un QR pending, cuando un usuario autenticado consulta `GET /vehicles/transfer/qr/:token`, entonces responde preview sin consumir (dos GETs seguidos siguen OK) y sin email de contraparte.
- [ ] Dado un QR pending, cuando un usuario autenticado acepta con confirmación, entonces en la misma transacción: QR `consumed`, ownership cerrada y creada, `VehicleTransfer` `completed`, eventos registrados.
- [ ] Dado un QR pending, cuando el usuario que lo creó intenta aceptarlo, entonces 400 "no podés aceptar tu propio QR".
- [ ] Dado un QR consumido, cuando otro usuario acepta, entonces 409 "ya utilizado".
- [ ] Dado un QR vencido (expiresAt pasado), cuando se consulta preview o accept, entonces se persiste `expired` + evento `expired` + email al emisor (lazy).
- [ ] Dado un vehículo con transferencia email pending, cuando se intenta aceptar QR (o generar QR), entonces 409 con instrucción (decisión PM §7.5).
- [ ] Dado un QR revoked, cuando se consulta, entonces 404/410 "revocado".
- [ ] Regresión: tests Fase 1/2 siguen pasando; suite backend completa verde.

### Frontend

- [ ] Dado `/vehicles/[id]` → flujo Transferir → modo QR, cuando el owner genera, entonces se muestra el QR renderizado + URL + countdown + botones Descargar/Revocar.
- [ ] Dado un QR existente (409), entonces la UI muestra error con CTA "Revocar QR existente".
- [ ] Dado un deep link `transfer/qr/{token}` sin sesión, entonces se redirige a login con `next` y vuelve.
- [ ] Dado el preview, entonces se ve vehículo + emisor (alias/nombre, sin email) y se puede aceptar tras confirmación explícita.
- [ ] Dado el escaneo con `html5-qrcode`, entonces detecta la URL y navega; si la cámara falla, existe fallback de ingreso manual de token.
- [ ] Dado un QR consumido/expirado/revocado, entonces las pantallas muestran el estado correspondiente sin acciones destructivas.
- [ ] Sin PII: nunca se muestra email de contraparte en preview/panel.

### Calidad

- [ ] Migración limpia (`db:migrate`/`db:generate`); índice token + invariante.
- [ ] Tests de transacción de accept (eventos + ownership) y de 409s (D-079, conflicto email+QR).
- [ ] Frontend: tests de preview/confirmación, generación (countdown, 409), scanner (fallback manual).
- [ ] Security review de la página de preview (throttling, CSRF, clickjacking) antes de QA.

## 12. Dependencias

- Fase 1 (panel, contract D-078, expiración lazy en accept) y Fase 2 (alias en fromUser).
- Decisiones D-079..D-086, D-088, D-090.
- Frontend: agregar `qrcode.react` + `html5-qrcode` (2 dependencias nuevas, D-090).
- Email listeners existentes.

## 13. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| QR bearer filtrado (capacidad transaccional) | TTL corto (D-086) + confirmación de identidad (D-082) + one-shot (D-083) + auth en preview |
| Dos transferencias activas (email + QR) | 409 en generación y accept (decisión PM §7.5) |
| `expired` no persistido (solo lazy) y confusión de estado | Sweeper in-process (D-088) persiste y notifica; frontend no depende de persistencia para UX |
| Entropía de token insuficiente | Decisión TL de formato (nanoid/random) + tests |
| Enumeración de preview (divulgar vehículos por token) | Throttling + 404 uniforme |
| Permiso de cámara en producción (HTTPS) | Fallback manual de token (nota D-090) |