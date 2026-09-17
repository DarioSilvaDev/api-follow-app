# Especificación: Fase 2 — Alias de usuario (identificador público)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-16
> **Estado:** Lista para diseño técnico (Tech Lead) — decisiones D-077, D-078 (transición), D-091 confirmadas
> **Basado en:** DECISION-REGISTER sección 25 (D-077, D-078, D-091), spec Fase 1 v2 (vehiculo-transfer-panel-flow.md), código verificado
> **Código afectado:** `prisma/schema.prisma` + migración, `src/modules/users/*` (nuevos endpoints), `src/modules/vehicles/queries/*` (transición alias), `frontend/src/app/(dashboard)/profile/page.tsx`, `frontend/src/types/*`

---

## 1. Problema

El email es PII y hoy se usa como identificador de la contraparte en las transferencias por email (registro D-054 usa nombres; el alias no existe). El contrato D-078 ya expone `alias` (nullable) en las respuestas de transferencias, pero:

- `User.alias` no existe en el schema — el campo está congelado en `null` desde Fase 1.
- El usuario no tiene dónde definir su identidad pública estable (independiente del email).
- No hay manera de buscar a un usuario por alias (para que un emisor encuentre al receptor sin saber su email).

## 2. Objetivo

Implementar el **alias público editable** tipo billetera virtual:

1. Datos: `User.alias` + `User.lastAliasChangedAt` (migración).
2. Endpoints: `GET/PATCH /users/me/alias` (auto-gestión) y extensión de `GET /users/search` para buscar por alias.
3. Reglas: formato, unicidad case-insensitive, cooldown 15 días (D-091), inmutabilidad con transferencia pendiente (D-077).
4. Transición D-078: el backend de transferencias empieza a incluir el alias real (`alias: true` en select, eliminar mapping `null`).
5. Frontend: edición en perfil + display en transferencias/timeline (labels por alias cuando exista).

## 3. Actores

| Actor | Acceso |
|---|---|
| Cualquier usuario autenticado | Ver y editar su propio alias (`/users/me/alias`). |
| Emisor en transferencia | Derecho a invitar vía alias (búsqueda en el diálogo de transferencia — se evalúa en la iteración 1; el MVP mantiene email+alias en la búsqueda). |
| Receptor | El alias aparece como identidad del emisor en el panel/timeline (D-078). |

## 4. Decisiones de producto aplicables

| ID | Decisión | Alcance |
|----|----------|---------|
| D-077 | Alias editable `^[a-z0-9._-]{3,30}$`, único case-insensitive, **inmutable mientras exista una transferencia pendiente** que lo use como identificador | Completo |
| D-091 | Cooldown de cambio: 15 días. Alta inicial gratuita. 409 CONFLICT con días restantes | Completo |
| D-078 (transición) | Select `alias: true` en handlers de listas + eliminar mapping `alias: null` (Fase 1 lo dejó comentado explícitamente) | Completo |

**Regla de negocio pendiente de validación con el Tech Lead (no inventar):** el límite del alias en la búsqueda del diálogo de transferencia (si el emisor puede invitar "por alias" en lugar de "por email") NO está resuelto. En el MVP el receptor puede ser identificado por email (Fase 1) o escaneando QR (Fase 3); el invitar por alias en el diálogo es opcional y puede hacerse post-MVP. → **Decisión de producto tomada por PM en esta spec:** el diálogo de transferencia se mantiene por email en MVP; el alias se expone solo como identidad visual (no se sustituye el input de email). Evita sobrealcance y mantiene SR#12 (no enumeración por alias en el diálogo).

## 5. Contrato Backend

### 5.1 Migración (Datos)

```prisma
model User {
  // ...campos existentes...
  alias                String?   @unique @map("alias") @db.VarChar(30)
  lastAliasChangedAt   DateTime? @map("last_alias_changed_at")
}
```

- `alias` nullable (no todos los usuarios lo definen).
- **Unicidad case-insensitive:** Prisma `@unique` es case-sensitive a nivel de columnas estándar. Para cumplir D-077 (único case-insensitive), agregar **índice único funcional** en PostgreSQL en la migración:
  ```sql
  CREATE UNIQUE INDEX "users_alias_lower_idx" ON "users" (LOWER("alias"));
  ```
  (decisión de indexación as a Database reviewer; el enforcement en el handler también normaliza a lowercase antes de validar duplicado para dar 409 con mensaje claro en vez de constraint error).
- El alias se persiste **en lowercase** (normalización server-side).

### 5.2 Endpoints

**`GET /users/me/alias`** (JwtAuth) → 200

```jsonc
{
  "alias": "juan-perez",              // string | null
  "lastAliasChangedAt": "2026-09-01T...", // DateTime | null
  "nextChangeAllowedAt": "2026-09-16T..." // (lastAliasChangedAt + 15 días; null si alias null)
}
```

**`PATCH /users/me/alias`** (JwtAuth) — body `{ alias?: string | null }`

- `{ alias: "mi-alias" }` → valida formato, lowercase, unicidad, cooldown → 200 con el objeto igual que GET.
- `{ alias: null }` → **Eliminar alias** (release del identificador). Reglas: respeta cooldown? DECISIÓN PM: **eliminar alias también respeta cooldown** (evita "limpiar y reclamar otro alias distinto" eludiendo el cooldown) — se documenta como regla de negocio.
- Errores:
  - 400 formato inválido (`^[a-z0-9._-]{3,30}$`), mensaje con el patrón esperado.
  - 409 si ya existe (case-insensitive): `"El alias ya está en uso"`.
  - 409 si cooldown activo: `"Solo podés cambiar tu alias cada 15 días. Podés cambiarlo el {fecha}"`.
  - 409 si el alias es used por un fromUser/toUser de una transferencia `pending`: `"Tu alias no puede cambiarse mientras tengas una transferencia pendiente"`.

**`GET /users/search?q=...`** — extender el handler de búsqueda existente agregando `{ alias: { contains: q, mode: 'insensitive' } }` al OR. (Ya busca email/firstName/lastName.)

### 5.3 Transición D-078 en transferencias

En `get-incoming-transfers.handler.ts` y `get-outgoing-transfers.handler.ts`:

- Cambiar `select { id, firstName, lastName }` por `select { id, firstName, lastName, alias: true }`.
- **Eliminar** el mapping `alias: null` post-query (los comentarios de Fase 1 indican exactamente este paso).
- **Regresión**: verificar que la shape de `get-vehicle-history` (timeline F-014) también incluya alias en `fromUser`/`toUser` si el frontend lo requiere — decisión técnica: el timeline debe mostrar la misma identidad visual (alias primero). A revisión del Tech Lead: incluir `alias: true` también en `get-vehicle-history`.

## 6. User Journeys

### 6.1 Flujo principal — Usuario define su alias

```
Actor: Usuario autenticado
  ↓
Contexto: /profile → sección "Tu alias" (nuevo Card)
  ↓
Acción: ingresa alias en minúsculas/símbolos → validación en vivo (formato) → Guardar
  ↓
Sistema: PATCH /users/me/alias → normaliza, valida unicidad (409 si existe) → persiste alias + lastAliasChangedAt = now
  ↓
Resultado: el alias aparece en el panel de transferencias y en el timeline como identidad
  (alias → nombre completo → "Usuario"), y pasa en las respuestas D-078.
```

### 6.2 Flujo alternativo — Cambio bloqueado por cooldown

```
Sistema: detecta lastAliasChangedAt < 15 días → 409 con fecha exacta de liberación
  ↓
Resultado: el form muestra "Solo podés cambiar tu alias cada 15 días. Podés cambiarlo el {fecha}."
  El campo permanece deshabilitado hasta esa fecha.
```

### 6.3 Flujo alternativo — Cambio bloqueado por transferencia pendiente

```
Sistema: detecta que el usuario es fromUser o toUser de al menos un VehicleTransfer status=pending → 409
  ↓
Resultado: error "Tu alias no puede cambiarse mientras tengas una transferencia pendiente."
  El usuario puede cancelar/rechazar la transferencia y reintentar.
```

### 6.4 Flujo alternativo — Alias ocupado

```
Sistema: `juan` ya existe → 409 "El alias ya está en uso"
  ↓
Resultado: validación en vivo del form con otro alias
```

### 6.5 Flujo alternativo — Eliminar alias

```
Acción: "Eliminar alias" → confirmar → PATCH { alias: null } (respeta cooldown)
  ↓
Resultado: el alias desaparece; los labels vuelven a nombre completo.
```

## 7. Requisitos Funcionales (RF)

### RF-1 — Migración

- `User.alias` (VarChar(30), nullable, unique case-insensitive vía índice funcional) + `User.lastAliasChangedAt` (nullable).
- Seed actualizado con usuarios demo con alias (si aplica).

### RF-2 — Backend: GET/PATCH /users/me/alias

- Normalización lowercase server-side, validación formato, unicidad case-insensitive (409), cooldown (409 con fecha), inmutabilidad con pending (409).
- Robustez: al eliminar alias, liberar también si no hay pendientes (regla 6.5).

### RF-3 — Backend: transición D-078

- Listas de transferencias y (a criterio TL) timeline incluyen `alias` real; eliminar mapping null.

### RF-4 — Frontend: edición en perfil

- Card "Tu alias" en `/profile`: input con validación en vivo (formato), botón Guardar, estado de cooldown (fecha de liberación), confirmación para eliminar, mensajes de error (§5.2), success banner inline con patrón existente.

### RF-5 — Frontend: display por alias

- El label de contraparte en `/transferencias` y timeline usa `alias → firstName lastName → "Usuario"` (patrón `transferUserLabel` existente). Cuando alias exista, mostrar `@alias` (con @).
- Sin cambios de contrato; solo aprovecha el campo que ya llega.

### RF-6 — Búsqueda (opcional, post-MVP / pendiente de PM en diálogo)

- `GET /users/search` extiende por alias (backend barato). **El diálogo de transferencia NO incorpora búsqueda por alias en esta fase** (decisión de alcance §4) — se documenta para no duplicar trabajo.

## 8. Alcance

### Dentro (Fase 2)

- Migración alias + `lastAliasChangedAt` + índice único funcional.
- `GET/PATCH /users/me/alias` + reglas de negocio + tests.
- Transición D-078 (select alias + eliminar mapping) + tests de regresión en lista/timeline.
- Frontend: card alias en perfil + display por alias en transfers.

### Fuera (esta fase)

- Búsqueda por alias en el diálogo de transferencia (decidido: el diálogo sigue por email).
- Validación de alias en registro (auto-crear alias inicial gratuito) — el alta inicial es gratuita en cooldown, pero "autogenerar alias al registro" NO es requisito.
- Conflictos de identidad con nombres duplicados (se resuelve por alias; no hay disambiguación adicional en MVP).

## 9. Decisiones delegadas al Tech Lead

1. **Indexación única case-insensitive**: confirmar el enfoque (índice funcional LOWER + enforcement en handler) y el orden de migración.
2. **Alias en `get-vehicle-history`**: incluir `alias: true` en el select del timeline (consistencia visual) o solo en listas. Preferencia PM: incluirlo (la UI del timeline usa `transferUserLabel`).
3. **Enforcement de cooldown a nivel de servicio** (no solo DTO): dónde vive la lógica (command handler vs. servicio compartido).
4. **Eliminar alias con cooldown**: confirmar en diseño que el 409 de "eliminar" respeta cooldown (regla de producto §6.5).

## 10. Criterios de Aceptación

### Backend

- [ ] Dado un usuario sin alias, cuando hace `GET /users/me/alias`, entonces responde `{ alias: null, lastAliasChangedAt: null, nextChangeAllowedAt: null }`.
- [ ] Dado un usuario, cuando hace `PATCH /users/me/alias { alias: "Juan-9" }`, entonces el alias se persiste normalizado (`juan-9`), y `lastAliasChangedAt` = now.
- [ ] Dado un alias `juan` ya existente, cuando otro usuario intenta `PATCH { alias: "JUAN" }`, entonces responde 409 (case-insensitive) en lugar de constraint error.
- [ ] Dado un usuario con alias, cuando intenta cambiar dentro de 15 días, entonces responde 409 con `nextChangeAllowedAt` (mensaje con fecha).
- [ ] Dado un usuario que es `fromUser` o `toUser` de una transferencia `pending`, cuando intenta cambiar o eliminar su alias, entonces responde 409 "pendiente" (D-077).
- [ ] Dado un usuario que eliminó su alias, cuando reintenta PATCH { alias: null } dentro de cooldown, entonces 409 (regla §6.5).
- [ ] Dado `GET /users/search?q=juan`, entonces los resultados incluyen usuarios con alias `juan*` además de email/nombre.
- [ ] Regresión: `get-incoming-transfers` y `get-outgoing-transfers` incluyen `alias` real (no null) sin romper la shape (tests Fase 1 siguen pasando; el test "select sin alias" se actualiza).

### Frontend

- [ ] Dado `/profile`, entonces se ve la card "Tu alias" con el estado actual (vacío o `@alias`).
- [ ] Dado que el usuario ingresa un alias inválido, entonces la validación en vivo muestra el formato esperado sin enviar.
- [ ] Dado que el alias ya existe, entonces el form muestra 409 "El alias ya está en uso".
- [ ] Dado que el cooldown está activo, entonces el input está deshabilitado y muestra "Podés cambiarlo el {fecha}".
- [ ] Dado que hay una transferencia pendiente, entonces el error 409 muestra el mensaje de pendencia.
- [ ] Dado que se guarda con éxito, entonces el banner inline confirma y el label en `/transferencias` muestra `@alias`.
- [ ] Sin PII nueva expuesta: el alias nunca sustituye al email en el diálogo de transferencia (email sigue siendo el input).

### Calidad

- [ ] Migración: `npm run db:migrate` + `db:generate` limpios (índice único case-insensitive creado).
- [ ] Backend: tests de endpoints, reglas (409s), normalización, transición D-078 (select con alias).
- [ ] Frontend: tests de la card alias (validación, cooldown, 409s, éxito) y del display por alias (label).
- [ ] Sin dependencias nuevas (alias no requiere librerías).

## 11. Dependencias

- Fase 1 (panel + contract D-078): el campo `alias` ya viaja en el contrato frontend.
- Decisiones D-077, D-091 (registradas).
- UX validación de copy en perfil (voseo).

## 12. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Unicidad case-insensitive mal implementada (constraint error 500 en vez de 409) | Índice funcional LOWER + handler que normaliza y pre-valida duplicado |
| Eliminar alias eludiendo cooldown | Regla §6.5: eliminar también respeta cooldown |
| Cambio de alias rompe la trazabilidad histórica | D-077: inmutable con transferencia pendiente; los eventos históricos ya snapshottean nombres (no el alias) en el timeline |
| Alias vacío / solo símbolos | Regex `^[a-z0-9._-]{3,30}$` + validación en vivo + normalización |