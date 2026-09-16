# Especificación: Fase 1 — Panel de Transferencias (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-15 (v2 — validada por UX y Tech Lead)
> **Estado:** Aprobada para implementación — journeys y naming validados por @ux-ui-hcdv; diseño técnico D-078 aprobado por Tech Lead; nueva decisión D-092 incorporada
> **Basado en:** decisiones de transferencia D-077..D-092 (DECISION-REGISTER sección 25), UX Flujo 2 "Panel" (@ux-ui-hcdv), backend de transfers existente (verificado en código)
> **Código afectado:** `src/modules/vehicles/*` (transfers), `frontend/src/components/ui/tabs.tsx` (nuevo), `frontend/src/components/transfer/*` (nuevo), página `(dashboard)/transferencias` (nueva), `/vehicles/[id]` (CTA Transferir)

---

## 1. Problema

Hoy el backend de transferencias está implementado (crear / incoming / outgoing / accept / reject / cancel), pero el conductor **no tiene ninguna superficie para gestionar transferencias**:

- No hay pantalla para ver transferencias recibidas ni enviadas.
- No hay acción "Transferir" desde el detalle del vehículo ni desde un panel.
- Las respuestas del backend son asimétricas (incoming solo `fromUser`, outgoing solo `toUser`) y exponen email de la contraparte (PII), lo que obliga al frontend a inferir la contraparte desde la sesión (frágil) o a mostrar PII no deseada.
- No existe el componente Tabs (D-089) para estructurar el panel.
- Una transferencia `pending` vencida bloquea la creación de una nueva transferencia para ese vehículo (check `existingPending` sin filtrar vencidas) — bloqueo silencioso sin journey de salida.

El journey "transferir un vehículo" es central para el valor del producto (cambio de titularidad). Sin UI, la feature es inutilizable por el usuario final.

## 2. Objetivo

Completar el journey **"el propietario transfiere su vehículo; el receptor acepta/rechaza y ambos ven el estado"** de extremo a extremo, mediante un **Panel de Transferencias** dedicado (Flujo 2 aprobado por UX), con:

1. **Contrato simétrico** en el backend (D-078): `fromUser` + `toUser` en todas las respuestas, sin email de contraparte.
2. **Panel** con pestañas (D-089) "Recibidas" / "Enviadas" y acciones por estado (mapeo validado por UX).
3. **CTA "Transferir"** compartido (D-084): desde el detalle del vehículo y desde el panel, usando un mismo diálogo.
4. **Desbloqueo de vehículos** bloqueados por transferencias vencidas (D-092).

Esta iteración NO incluye alias editable (Fase 2) ni QR (Fase 3).

## 3. Actores

| Actor | Acceso |
|---|---|
| Owner activo | Crea transferencias (POST /:id/transfer), cancela las propias enviadas, ve el panel. |
| Receptor (cualquier usuario autenticado con cuenta) | Ve la transferencia pendiente en el panel (Recibidas), acepta o rechaza. |
| super_admin | Acceso de administración (read-path actual); no cambia en esta iteración. |
| Usuario con acceso compartido | Sin cambios: no puede transferir (ownership-only, Security Review #8). |

**Panel en cualquier contexto:** los endpoints de transfers son user-scoped; el panel es accesible sin importar el Active Context (decisión UX/P: mantener simple; ocultar en WORKSHOP no se recomienda en Fase 1). El CTA "Transferir" del detalle sí se restringe a owner + PERSONAL (RF-6).

## 4. Decisiones de producto aplicables (extraídas de D-077..D-092)

| ID | Decisión | Alcance en Fase 1 |
|----|----------|-------------------|
| D-078 | Respuestas simétricas `fromUser` + `toUser` en todos los endpoints; nunca email de la contraparte (solo la sesión ve el suyo) | **SÍ** — backend + frontend |
| D-084 | "Transferir" en detalle del vehículo Y en el panel, compartiendo el mismo diálogo | **SÍ** — frontend |
| D-089 | Tabs con `@base-ui/react` (envolver en `components/ui/tabs.tsx`, cero dependencias nuevas) | **SÍ** — frontend |
| D-092 | Una transferencia `pending` vencida **NO** bloquea crear una nueva (fix `existingPending`: `expiresAt null OR > now`); un item expirado en Enviadas conserva "Cancelar" para limpieza; expirada = terminal para el receptor (sin acciones) | **SÍ** — backend (fix 1 línea) + frontend (recomputo) |
| D-077 | Alias editable (Fase 2) — el contrato YA incluye `alias` (nullable) para no cambiar shape después | **Contrato** (nullable), no UI de edición |
| D-079 | Notificaciones email (listeners existentes) | **YA existe** — sin cambios |
| D-083 | Cooldown alias 15 días | Fuera (Fase 2) |
| D-080 | Deep link QR HTTPS | Fuera (Fase 3) |
| D-081/D-082/D-085/D-086/D-087/D-088/D-090/D-091 | QR y expiración proactiva | Fuera (Fase 3) |

La expiración lazy ya existe en `AcceptTransferHandler` (marca `expired` al intentar aceptar); D-088 define el mecanismo proactivo — decisión técnica del TL (lazy-first confirmada; sweeper opcional en Fase 3) — **no bloquea Fase 1**.

## 5. Contrato Backend

### 5.1 Estado actual (verificado en código)

| Endpoint | Guard / Autorización | Comportamiento |
|----------|---------------------|----------------|
| `POST /vehicles/:id/transfer` | Handler valida ownership (`ownerships[0].userId === fromUserId`) | Crea `pending`, `expiresAt` = 7 días, evento `vehicle.transfer.requested` (email). 400 genérico si el email no existe (anti-enumeración). 400 si ya hay pendiente **vigente** (D-092 — cambio). 400 si auto-transferencia. |
| `GET /vehicles/transfers/incoming` | JWT (cualquier autenticado) | `where: { toUserId: userId }`, incluye `vehicle` (placa/años/color) + `fromUser` (id, first, last, **email** — a eliminar) |
| `GET /vehicles/transfers/outgoing` | JWT | `where: { fromUserId: userId }`, incluye `vehicle` + `toUser` (id, first, last, **email** — a eliminar) |
| `PATCH /vehicles/transfers/:id/accept` | Handler: `toUserId === userId` | Transacción: cierra ownership, crea ownership nuevo, `completed`, eventos `ownership_closed/ownership_created/completed`. Lazy-expiry (`expired` + 400). Email `vehicle.transfer.accepted`. |
| `PATCH /vehicles/transfers/:id/reject` | Handler: `toUserId === userId` | Rechaza a `rejected`. |
| `PATCH /vehicles/transfers/:id/cancel` | Handler: `fromUserId === userId` | Cancela a `cancelled`. Verificado: NO chequea expiración (permite cancelar vencidas — requerido para desbloquear vehículos). |

### 5.2 Cambio requerido (D-078 + D-092)

**A. Simetría en `get-incoming-transfers` y `get-outgoing-transfers`:**

```jsonc
// GET /vehicles/transfers/incoming (response item)
{
  "id": "...",
  "status": "pending",             // pending | accepted | rejected | cancelled | completed | expired
  "requestedAt": "...",
  "expiresAt": "...",
  "notes": null,
  "createdAt": "...",
  "vehicle": { "id": "...", "licensePlate": "ABC123", "manufactureYear": 2018, "modelYear": 2019, "color": "Rojo" },
  "fromUser": { "id": "...", "firstName": "Ana", "lastName": "Pérez", "alias": null },   // contraparte (emisor)
  "toUser":   { "id": "<mi id>", "firstName": "Yo", "lastName": "Mismo", "alias": null } // local
}

// GET /vehicles/transfers/outgoing (response item)
// Mismo shape: fromUser = local, toUser = contraparte (receptor)
```

Reglas:

- **`email` se elimina de la contraparte** en ambas listas, y del usuario local también (el frontend usa la sesión). El item nunca incluye `email` de ningún usuario.
- **`alias` se agrega al CONTRATO como nullable** (`{ id, firstName, lastName, alias }`). **Atención técnica verificada (TL): la columna `User.alias` NO existe aún en el schema.** Por lo tanto el `select` de Prisma NO debe incluir `alias` (fallaría en runtime en Fase 1); el handler **inyecta `alias: null` post-query** (mapping). En Fase 2 el select suma `alias: true` y el mapping se elimina. Test debe verificar que el select enviado a Prisma no contiene `alias`.
- **Select de Prisma:** `fromUser`/`toUser` → `{ id, firstName, lastName }` (sin email, sin alias). Mapping posterior agrega `alias: null`.
- Los **handlers de mutación** (`accept/reject/cancel`) — **D-TL-1 (Tech Lead): se quedan como están** (entidad cruda, sin DTO). No exponen PII hoy (verificado: devuelven la entidad sin `include`), cero consumidores del body (el panel re-sincroniza invalidando listas), y unificar tendría costo en el path transaccional de `accept` sin beneficio funcional. Registrar en DECISION-REGISTER: "Fase 2 evalúa unificar mutaciones al DTO simétrico con costo bajo".
- `POST /:id/transfer` — **cambio D-092 (aprobado por PM):** el check `existingPending` deja de bloquear por vencidas. Fix sugerido por TL (1 línea):
  ```ts
  where: { vehicleId, status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
  ```
  Sin cambios en el resto del handler ni listeners.
- **Sin `PermissionsGuard` granular**: los endpoints son ownership-scoped por handler (patrón actual). Los permisos `vehicle.transfer.*` (si existen en seed) no se activan en esta iteración — consistente con F-013 (permisos granulares con contexto workshop, post-MVP).

### 5.3 Contrato de errores

| Error | HTTP | Superficie | Mensaje de usuario (voseo, validado UX) |
|-------|------|------------|------------------------------------------|
| Email no existe | 400 | Diálogo | "No se pudo enviar la solicitud. Verificá que el destinatario tenga una cuenta e intentá nuevamente." *(genérico, anti-enumeración SR#12 — NO cambiar)* |
| Auto-transferencia | 400 | Diálogo | "No podés transferir el vehículo a vos mismo. Ingresá el email de otra persona." |
| Ya hay pendiente **vigente** | 400 | Diálogo | "Ya existe una solicitud pendiente para este vehículo." + acción **"Ver solicitud"** → pestaña Enviadas |
| No owner (raza post-apertura) | 403 | Diálogo | "Ya no sos el titular de este vehículo. La transferencia no se pudo realizar." |
| Vehículo no existe | 404 | Diálogo | "El vehículo ya no existe o fue eliminado." |
| Transfer no existe | 404 | Acción de ítem | "Esta solicitud ya no existe. La lista se actualizó." + refresh |
| No pending (carrera) | 400 | Acción de ítem | "Esta solicitud ya no está pendiente." + refresh |
| Expirada (al aceptar, lazy) | 400 | Aceptar | "La solicitud venció y ya no puede aceptarse." → marca Expirada + refresh |
| No corresponde (403 accept/reject/cancel) | 403 | Acción de ítem | "No tenés permiso para realizar esta acción." + refresh |
| 409 (defensivo; ningún endpoint de Fase 1 lo emite — el 409 es de QR Fase 3/D-079) | 409 | Cualquiera | Mismo handling que 400 genérico |
| Genérico | 5xx/otro | Cualquiera | "No se pudo completar la acción. Intentá nuevamente." |

**Importante:** nunca mostrar el mensaje crudo del backend (anti-enumeración + UX). Ver `frontend/src/lib/transfer-errors.ts` (implementado) como referencia del mapeo.

## 6. User Journeys (validados UX — aprobados con ajustes incorporados)

### 6.1 Flujo principal — Propietario transfiere a un receptor

```
Actor: Owner autenticado (contexto PERSONAL)
  ↓
Contexto: /vehicles/[id] (detalle) → CTA "Transferir"  (o desde panel → CTA "Transferir vehículo")
  ↓
Acción: abre TransferDialog → ingresa email del receptor + notas (opcional) → "Enviar solicitud"
  ↓
Sistema: POST /vehicles/:id/transfer → crea pending → email al receptor → cierra diálogo con éxito
  ↓
Resultado: el owner ve la transferencia en el panel (pestaña "Enviadas") con estado "Pendiente"
  y accion "Cancelar". El receptor ve la entrada en "Recibidas" con acciones "Aceptar" / "Rechazar".
```

**Errores visibles dentro del diálogo (validados UX — Ajuste 1):**

| Caso | Comportamiento requerido |
|---|---|
| El propietario ingresa **su propio email** | Error inline: "No podés transferir el vehículo a vos mismo..." — diálogo abierto con datos intactos |
| **Ya hay pendiente vigente** | Error inline + acción "Ver solicitud" → navega al panel (Enviadas) — **CTA del error, no solo texto** |
| El usuario **ya no es owner** (raza) | Error inline: "Ya no sos el titular..." + **invalidar queries** (el diálogo permanece abierto con los datos intactos para que el usuario lea el mensaje; las queries invalidadas resincronizan CTA y lista) |

Helper pre-submit del campo email (UX): "El destinatario debe tener una cuenta en Autentia." (no rompe anti-enumeración SR#12; es info pública del producto).
Éxito: "Solicitud enviada" — "El destinatario recibirá un email para aceptar o rechazar la transferencia."

### 6.2 Flujo principal — Receptor acepta

```
Actor: Receptor autenticado
  ↓
Contexto: /transferencias → pestaña "Recibidas" → entrada con vehículo + emisor + estado
  ↓
Acción: "Aceptar" → confirmación "¿Confirmás que querés recibir este vehículo? Al aceptar, pasará a estar a tu nombre."
  ↓
Sistema: PATCH /transfers/:id/accept → transacción de ownership → email al emisor
  ↓
Resultado: la entrada pasa a "Completada". Feedback transitorio inline ("Transferencia aceptada. El vehículo ahora es tuyo.").
  Se invalidan AMBAS listas (incoming y outgoing — la contraparte ve el cambio) y "Mis vehículos" (el vehículo aparece inmediatamente).
  El timeline del vehículo (F-014) muestra la transferencia "completada" y la propiedad transferida.
```

### 6.3 Flujo alternativo — Receptor rechaza

```
Acción: "Rechazar" → confirmación "¿Seguro que querés rechazar esta solicitud? El vehículo seguirá perteneciendo al emisor." → PATCH reject
  ↓
Resultado: entrada a "Rechazada" (la rechacé yo). El emisor ve el estado; el reintento es una NUEVA transferencia (CTA "Transferir vehículo").
```

### 6.4 Flujo alternativo — Emisor cancela pendiente

```
Acción: "Cancelar" (Enviadas, estado pending o expirada) → confirmación:
  Primario: "Sí, cancelar solicitud" · Cierre: "Volver"   (evitar colisión de labels con "Cancelar")
  ↓
Resultado: entrada a "Cancelada". 
```

**D-092 / Ajuste 2 (UX):** en Enviadas, un item **expirado conserva "Cancelar"** (el backend ya lo permite; desbloquea el vehículo para una nueva transferencia). En Recibidas, expirada = **terminal, sin acciones** (el receptor no puede aceptar — backend 400 — ni rechazar; semántica limpia: el timeline no debería mostrar "Transferencia rechazada" de algo ya vencido).

### 6.5 Flujo alternativo — Expirada (recomputo client-side)

```
Sistema: listas devuelven status "pending" con expiresAt pasado (lazy — aún no persiste "expired")
  ↓
Frontend: calcula effectiveStatus = (status === "pending" && expiresAt && expiresAt < now) ? "expired" : status
  ↓
Resultado: el panel muestra "Expirada" desde el día 1 sin esperar D-088.
  Enviadas: badge "Expirada" + "Vencía el {fecha}" + acción "Cancelar".
  Recibidas: badge "Expirada" + "La solicitud venció el {fecha}" + sin acciones.
  Al intentar aceptar una vencida: 400 "Transfer has expired" (lazy persist) → actualizar + refresh.
  El emisor puede crear una nueva transferencia (D-092: ya no bloquea).
```

### 6.6 Flujo alternativo — Carrera ("Transfer is not pending")

```
Acción: Aceptar/Rechazar/Cancelar sobre una entrada que la contraparte ya resolvió → 400 "Transfer is not pending"
  ↓
Resultado: error por-item (NO romper la lista): "Esta solicitud ya no está pendiente." + refresh.
  Prevención: doble-submit deshabilitado (botón con spinner "Aceptando…/Rechazando…/Cancelando…" y fila deshabilitada durante la mutación).
```

### 6.7 Empty states (Ajuste 3 UX)

- **Recibidas vacía:** "Sin transferencias recibidas" / "Cuando alguien te transfiera un vehículo, la solicitud aparecerá acá." (sin acción).
- **Enviadas vacía:** "Sin transferencias enviadas" / "Cuando transfieras un vehículo, vas a poder seguir el estado desde acá." + CTA "Transferir vehículo".
- **Usuario sin vehículos propios** (CTA del panel): selector de vehículo vacío → estado guiado "No tenés vehículos para transferir" + link a `/vehicles/new`.

## 7. Requisitos Funcionales (RF)

### RF-1 — Backend: simetría D-078 en listas

- `get-incoming-transfers` y `get-outgoing-transfers` retornan `fromUser` y `toUser` completos: `{ id, firstName, lastName, alias }` (alias inyectado post-query como `null`; el select NO incluye alias).
- La contraparte NO expone email. El usuario local tampoco (la UI usa la sesión).
- El `vehicle` incluido se mantiene igual (id, licensePlate, manufactureYear, modelYear, color).
- Filtro `where` (toUserId/fromUserId) y `orderBy: { createdAt: 'desc' }` preservados (regresión).

### RF-2 — Frontend: tipos (D-TL-4)

- **NO mutar `VehicleTransfer`** (timeline F-014). Crear tipo derivado nuevo:
  ```ts
  export interface TransferUser { id: string; firstName: string; lastName: string; alias: string | null }
  export interface VehicleTransferListItem extends VehicleTransfer {
    vehicle: { id: string; licensePlate: string; manufactureYear: number | null; modelYear: number | null; color: string | null };
    fromUser: TransferUser;
    toUser: TransferUser;
  }
  export function transferUserName(u: TransferUser): string // alias ?? `${firstName} ${lastName}`
  ```
- Documentar que en Fase 1 `alias` siempre es `null` (se puebla en Fase 2).
- El merge del timeline usa `firstName`/`lastName` (verificado en `vehicle-history.ts`) — el cambio es seguro.

### RF-3 — Frontend: componente Tabs (D-089)

- `components/ui/tabs.tsx` envolviente de `@base-ui/react/tabs` con estilo shadcn.
- **API verificada (D-TL-3, Tech Lead — Context7):** `@base-ui/react/tabs` exporta `Root`, `List`, `Tab`, `Panel`, `Indicator`. **`Trigger`/`Content` NO existen (son de Radix).** El wrapper mapea: `Tabs = Root`, `TabsList = List`, `TabsTrigger = Tab`, `TabsContent = Panel` (ambos requieren prop `value`). Cero dependencias nuevas.

### RF-4 — Frontend: TransferDialog compartido (D-084)

- Componente `components/transfer/transfer-dialog.tsx` usado desde:
  - `/vehicles/[id]` (CTA "Transferir" — visible solo owner vigente + PERSONAL; modo detalle: vehículo fijo; subtítulo con el vehículo), y
  - `/transferencias` (CTA "Transferir vehículo"; modo panel: selector de vehículos propios con filtro `isVehicleOwner`).
- Form: email (validación) + notas (opcional, máx 500), RHF + zod (patrón existente). Helper del email: "El destinatario debe tener una cuenta en Autentia."
- Errores de la §5.3 con mensajes de usuario (voseo); nunca mensajes crudos. Éxito → "Solicitud enviada" + cerrar + invalidar queries.
- Caso "ya hay pendiente vigente": error inline + acción "Ver solicitud" → `/transferencias`.

### RF-5 — Frontend: página Panel `/transferencias`

- Ruta `(dashboard)/transferencias` (protegida por proxy, navegación principal + link en header/sidebar).
- Dos listas vía Tabs:
  - **Recibidas** (GET incoming): vehículo, emisor (`firstName lastName` o alias en Fase 2+), estado, fecha; acciones Aceptar/Rechazar.
  - **Enviadas** (GET outgoing): vehículo, receptor, estado, fecha; acción Cancelar (si pending **o expirada**).
- **Recomputo client-side de expirada:** `effectiveStatus = pending && expiresAt < now ? 'expired' : status`.
- Estados: loading (spinner + `role="status"`; `placeholderData: keepPreviousData` al cambiar de tab), error + "Reintentar" por pestaña, empty states de §6.7.
- Estados (badge) en español: **Pendiente / Aceptada / Rechazada / Cancelada / Completada / Expirada** — coherentes con timeline F-014 (mismas raíces; casing por contexto). Sustantivo siempre "transferencia/tranferencias" (nunca "traspaso").
- Acciones con confirmación (Dialog existente, patrón PhotosSection — nunca `window.confirm`); feedback con banner transitorio inline (no existe toast y no se agregan dependencias); invalidar AMBAS listas + `["vehicles"]` post-aceptación.
- Errores por-item (§5.3) + refresh; doble-submit deshabilitado.
- Sin email de la contraparte en la UI (solo nombre o alias futuro). Item enlaza al detalle del vehículo.
- Accesibilidad: banners `role="status"`, badges con texto (color solo como refuerzo), targets táctiles ≥ 44px.

### RF-6 — Detalle del vehículo: CTA "Transferir"

- Botón visible solo para owner vigente y contexto PERSONAL (mismo gate que "Registrar servicio": `owner && activeContext === null`).
- Si ya existe una transferencia pendiente vigente, el backend responde 400; error inline con acción "Ver solicitud" (RF-4). Inválida timeline del vehículo post-éxito.

### RF-7 — Regresión / consistencia

- Timeline F-014 intacto (el merge sigue funcionando con el shape actual; `VehicleTransfer` no se muta — tipo derivado).
- Los journeys de taller (F-020 / 2-2) no se tocan.
- No hay migración de base de datos en esta iteración (D-078 es solo query shape; `alias` llega con Fase 2).

### RF-8 — Backend: desbloqueo por vencidas (D-092)

- `POST /:id/transfer`: el check `existingPending` filtra vencidas (`OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]`) — permite crear nueva transferencia si la anterior venció.
- Sin cambios en `cancel` (ya permite cancelar vencidas — requerido).
- Test: crear nueva transferencia tras una vencida = OK; con pending vigente = 400.

## 8. Alcance

### Dentro (Fase 1)

- Backend: simetría D-078 en las dos listas (+ tests) + fix D-092 en `POST /:id/transfer` (+ test).
- Frontend: Tabs (D-089), TransferDialog (D-084), página `/transferencias`, CTA en detalle, tipo derivado (RF-2), recomputo de expirada (RF-5), errors/loading/empty, confirmaciones, banner inline.
- Tests backend y frontend (panel, tabs, dialogo, acciones, casos de error validados UX).

### Fuera (próximas fases)

- Alias editable (Fase 2): migración `User.alias`, `lastAliasChangedAt`, cooldown D-083, edición en perfil, búsqueda por alias; incluir `alias: true` en el select de transfers y eliminar mapping.
- QR (Fase 3): modelo `VehicleTransferQr`, deep link D-080, TTLs D-086, aceptación directa D-081, escaneo D-090.
- Expiración proactiva (D-088): lazy-first confirmado (TL); sweeper in-process opcional en Fase 3.
- Unificar DTO simétrico en mutaciones (D-TL-1: evaluar en Fase 2 con costo bajo).
- Permisos granulares `vehicle.transfer.*` (post-MVP con contexto workshop).
- Delegación de transferencia / rol de concesionaria (D-085).

## 9. Decisiones del Tech Lead (resueltas en validación)

1. **D-TL-1 — Mutaciones `accept/reject/cancel`: sin DTO simétrico en Fase 1.** Razón: no exponen PII (entidad cruda sin include), cero consumidores del body, costo en path transaccional sin beneficio. Contrato congelado; Fase 2 evalúa unificar.
2. **D-TL-2 — Expiración proactiva (D-088): lazy-first.** Sin job en Fase 1 (no agregar `@nestjs/schedule` sin necesidad). Fase 3: sweeper in-process opcional (provider con `onModuleInit`/`setInterval`). La lazy ya cubre el gate de integridad.
3. **D-TL-3 — Tabs `@base-ui/react` v1.8.0:** API real es `Root/List/Tab/Panel/Indicator` (no `Trigger/Content`). Wrapper shadcn mapea los nombres.
4. **D-TL-4 — Tipo derivado `VehicleTransferListItem`** en lugar de mutar `VehicleTransfer` (protege timeline F-014).

## 10. Criterios de Aceptación

### Backend

- [ ] Dado un usuario con transfers recibidas, cuando llama `GET /vehicles/transfers/incoming`, entonces cada item incluye `fromUser` y `toUser` con `{ id, firstName, lastName, alias }` y **no** expone `email` de ningún usuario.
- [ ] Dado un usuario con transfers enviadas, cuando llama `GET /vehicles/transfers/outgoing`, entonces cada item incluye `fromUser` y `toUser` con el mismo shape y sin `email`.
- [ ] Dado que no existen transfers, cuando se llama cualquiera de las listas, entonces se responde `200 []`.
- [ ] Dado un POST de transferencia, cuando el email no existe, entonces se responde 400 con mensaje genérico (sin revelar existencia) — comportamiento existente preservado.
- [ ] Dado un vehículo con una transferencia **vencida** (pending + expiresAt pasado), cuando el owner llama `POST /:id/transfer`, entonces se crea la nueva transferencia (D-092).
- [ ] Dado un vehículo con una transferencia **pendiente vigente**, cuando el owner llama `POST /:id/transfer`, entonces se responde 400 "already pending".
- [ ] Regresión: los tests existentes de `accept/reject/cancel/transfer` pasan sin cambios de comportamiento.

### Frontend

- [ ] Dado un owner autenticado, cuando abre `/vehicles/[id]`, entonces ve el botón "Transferir" solo si es owner vigente y contexto PERSONAL.
- [ ] Dado el botón "Transferir" en detalle o panel, cuando completa email + notas y envía, entonces el diálogo muestra éxito ("Solicitud enviada") y el panel muestra la entrada en "Enviadas" (estado Pendiente).
- [ ] Dado que el usuario ingresa **su propio email**, entonces el diálogo muestra "No podés transferir el vehículo a vos mismo...", permanece abierto con los datos intactos.
- [ ] Dado que ya hay pendiente vigente, entonces el diálogo muestra "Ya existe una solicitud pendiente..." **con la acción "Ver solicitud"** que navega a `/transferencias`.
- [ ] Dado que el usuario ya no es owner, entonces el diálogo muestra "Ya no sos el titular..." y se invalidan las queries.
- [ ] Dado el panel con ambas pestañas, cuando cambia de "Recibidas" a "Enviadas", entonces las listas se cargan de las queries respectivas sin recarga completa de página.
- [ ] Dado un item en "Recibidas" con estado pending, cuando el usuario pulsa "Aceptar" y confirma, entonces el item pasa a "Completada", se invalidan both listas y "Mis vehículos", y se muestra banner inline de éxito.
- [ ] Dado un item en "Recibidas" con estado pending, cuando el usuario pulsa "Rechazar" y confirma, entonces el item pasa a "Rechazada".
- [ ] Dado un item en "Enviadas" con estado pending **o expirada**, cuando el usuario pulsa "Cancelar" (confirmación "Sí, cancelar solicitud" / "Volver"), entonces el item pasa a "Cancelada".
- [ ] Dado un item en "Recibidas"/"Enviadas" con `pending` pero `expiresAt` pasado, entonces el panel muestra **"Expirada"** (recomputo client-side) sin esperar al backend.
- [ ] Dado un item "Expirada" en Recibidas, entonces no se muestran acciones; en Enviadas se muestra "Cancelar".
- [ ] Dado que un item ya no está pending (carrera) al intentar una acción, entonces se muestra "Esta solicitud ya no está pendiente." + refresh, sin romper la lista.
- [ ] Dado un email inexistente en el diálogo, entonces se muestra el mensaje genérico del 400 sin redirigir.
- [ ] Dado que una transferencia venció, cuando se intenta aceptar, entonces se muestra "La solicitud venció y ya no puede aceptarse." y la lista refresca a "Expirada".
- [ ] Dado empty states: Recibidas vacía muestra "Sin transferencias recibidas" (sin acción) y Enviadas vacía muestra "Sin transferencias enviadas" + CTA "Transferir vehículo"; sin vehículos propios, el CTA del panel muestra "No tenés vehículos para transferir" + link a `/vehicles/new`.
- [ ] La UI nunca muestra el email de la contraparte en el panel (solo nombre o alias futuro). Nada de "traspaso" en el copy (siempre "transferencia").

### Calidad

- [ ] Backend: tests de simetría en los dos handlers de listas (shape, ausencia de email) + test de D-092 (vencida no bloquea / vigente bloquea) + test de select sin `alias`.
- [ ] Frontend: tests del panel (pestañas, estados, acciones, empty/error, expirada recomputo), diálogo (validación, errores §5.3, caso "Ver solicitud"), tipos.
- [ ] Build backend OK, build frontend OK, suite frontend existente intacta (196 passed baseline; los 6 fallos preexistentes detectados por frontend-tech-lead son deuda externa a Fase 1: `vehicles-page` contador "—" y `vehicle-detail-page` copy/confirm — decidir si se corrigen en paralelo).
- [ ] Sin dependencias nuevas en backend; frontend solo `@base-ui/react` ya instalado.

## 11. Dependencias

- Decisiones D-077..D-092 (registradas en DECISION-REGISTER sección 25).
- UX Flujo 2 aprobado (@ux-ui-hcdv) — journeys §6 y naming validados.
- Backend de transfers existente (mutaciones sin cambios — D-TL-1).
- `@base-ui/react` v1.8.0 (ya instalado) para Tabs (API verificada D-TL-3).
- Timeline F-014 (frontend ya consume transfers — compatibilidad del shape; tipo derivado D-TL-4).

## 12. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Romper el shape que consume el timeline F-014 | `VehicleTransfer` no se muta (D-TL-4, tipo derivado); el merge usa `firstName`/`lastName` (verificado en `vehicle-history.ts`). |
| `select: { alias: true }` antes de Fase 2 = runtime error (columna inexistente) | El select NO incluye alias; `alias: null` se inyecta post-query; test verifica el select sin alias. |
| Cambiar el shape de mutaciones y romper consumo existente | D-TL-1: mutaciones congeladas en Fase 1; registro de nota "Fase 2 evalúa unificar". |
| Tabs de `@base-ui/react` con API distinta (Trigger/Content no existen) | D-TL-3: API verificada vía Context7; error sería build-time de todas formas (falla temprana). |
| PII: email de contraparte expuesto en UI por error | Contrato backend sin email (tests de ausencia) + `transfer-errors.ts` mapea mensajes + revisión de PR. |
| 409/400 ambiguos en pantalla | Mapeo de errores específico por acción (§5.3, validado UX); 409 tratado como defensivo. |
| Item expirado bloquea nuevas transferencias (journey sin salida) | D-092: fix de 1 línea en `POST` + "Cancelar" disponible en Enviadas expirada. |
| Doble-submit / carreras entre usuarios | Botón deshabilitado durante mutación; error "ya no está pendiente" con refresh. |
| Tests stale preexistentes (6 fallos baseline) | Documentados por frontend-tech-lead; NO son regresión de Fase 1; decidir corrección en paralelo (deuda técnica). |