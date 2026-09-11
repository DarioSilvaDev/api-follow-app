# Especificación: F-014 — Timeline del Vehículo (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-11
> **Estado:** Borrador para validación técnica (Tech Lead)
> **Basado en:** docs/features.md (F-014 "Timeline vacío"), F-010..F-013, D-035..D-049

---

## 1. Problema

El propietario puede ver el detalle de su vehículo (ficha, fotos, documentos, últimos 5 km) pero **no tiene una línea de tiempo con el historial completo de eventos significativos**:

- El backend ya expone `GET /api/vehicles/:id/history` (transfers + mileages + ownerships, ordenados por fecha).
- El frontend no consume este endpoint, no tiene tipos para transfers ni UI de timeline.
- El usuario no puede reconstruir la historia del vehículo: ¿cuándo lo registró?, ¿cuándo cambió de titular?, ¿qué kilometraje registró y cuándo?

## 2. Objetivo

Mostrar en la vista de detalle una **sección "Historial"** con los eventos del vehículo ordenados cronológicamente (más reciente primero), de forma que el propietario pueda reconstruir la historia básica de su vehículo.

**F-014 es "Timeline vacío" (roadmap):** muestra eventos del propio vehículo (transfers, kilometrajes, cambios de propiedad). **NO incluye episodios de taller** (service records, appointments, work orders, estimates) — esos son F-020+ (CareEpisodes, Fase 2 del roadmap).

## 3. Actores

| Actor | Acceso |
|---|---|
| Owner activo | Ve la sección Historial completa (con emails en transfers/ownerships cuando aplica). |
| Usuario con acceso compartido | Ve la sección Historial sin emails (PII control, Security Review #13). |
| Backend | `GET /api/vehicles/:id/history` ya existente; sin cambios. |

## 4. Decisiones de producto (confirmadas 2026-09-11)

| ID | Decisión propuesta | Detalle |
|---|---|---|
| **D-050** | **Alcance del timeline:** solo transfers, mileages y ownerships | Consistente con el roadmap (F-014 = "Timeline vacío"). Service records, appointments, work orders y estimates son **F-020+** (CareEpisodes, Fase 2). El módulo maintenance tiene su propio endpoint (`GET /maintenance/vehicles/:vehicleId/history`) que se consumirá cuando lleguen los CareEpisodes. |
| **D-051** | **Ubicación en la UI:** sección "Historial" dentro de la página de detalle (`/vehicles/[id]`), debajo de la sección de kilometraje | El detalle ya tiene secciones verticales (Ficha → Fotos → Documentos → Kilometraje). Agregar "Historial" como quinta Card. Alternativa descartada: ruta separada `/vehicles/[id]/timeline` — sin beneficio en MVP y agrega complejidad de navegación. |
| **D-052** | **Orden y desempate:** cronológico desc (más reciente primero); desempate por `createdAt`/`recordedAt`/`startsAt` según tipo | Timestamp canónico: `createdAt` para transfers, `recordedAt` para mileages, `startsAt` para ownerships. |
| **D-053** | **Sin filtros, sin paginación, sin rango de fechas en MVP** | El volumen en MVP es bajo (docenas de eventos como mucho). Los filtros (tipo, rango de fechas, actor, búsqueda) son post-MVP cuando el volumen crezca. |
| **D-054** | **Transfers:** se muestran todos los estados como entries | pending, accepted, rejected, cancelled, completed, expired — cada transfer es un evento visible en la timeline con su estado. |
| **D-055** | **Ownerships:** se muestran como entries de cambio de titular | "Inicio de propiedad" / "Propiedad transferida a [nombre]" — los ownerships representan cambios significativos. |

## 5. Contrato Backend (SIN CAMBIOS — reutilizar)

El endpoint `GET /api/vehicles/:id/history` ya existe y es suficiente para F-014:

- **Response:** `{ transfers, mileages, ownerships }` (3 arrays separados, cada uno ordenado por su fecha desc).
- **Autorización:** `assertVehicleAccess` (owner + shared + super_admin).
- **PII:** emails de owners visibles solo a owner activo o super_admin (Security Review #13).
- **Sin paginación, sin filtros, sin query params.**
- **Campos de cada entry (verificados en código):**

| Tipo | Timestamp de orden | Campos clave | Select de usuario |
|---|---|---|---|
| `VehicleTransfer` | `createdAt` | `status`, `fromUser`, `toUser`, `requestedAt`, `completedAt`, `notes` | `fromUser/toUser: {id, firstName, lastName}` (sin email) |
| `VehicleMileage` | `recordedAt` | `mileage`, `source`, `notes` | N/A |
| `VehicleOwnership` | `startsAt` | `type`, `endsAt`, `notes`, `user` | `user: {id, firstName, lastName}` + email solo owner activo |

## 6. User Journey

```
Actor: Propietario autenticado
  ↓
Contexto: En la página de detalle del vehículo (/vehicles/:id), hace scroll hasta "Historial"
  ↓
3a. Llamada GET /api/vehicles/:id → data base + últimos 5 km
3b. Llamada GET /api/vehicles/:id/history → { transfers, mileages, ownerships }
  ↓
Sistema: Merge cronológico de las 3 fuentes → orden desc → renderiza entries
  ↓
Vista (D-051):
  [Historial — Card]
  ┌─────────────────────────────────────────────┐
  │ 🚗 Registro del vehículo — 11/09/2026       │
  │ 📊 85,000 km registrado (owner) — 10/09/2026│
  │ 🔄 Propiedad transferida a Juan — 09/09/2026│
  │ 📊 80,000 km registrado (workshop) — 08/09  │
  │ 🚗 Registro del vehículo — 01/09/2026       │
  └─────────────────────────────────────────────┘
  ↓
Resultado: El propietario reconstruye la historia de su vehículo en orden cronológico
```

### Flujo alternativo: usuario con acceso compartido
```
  ↓
Ve la misma sección sin campos de email (ya lo controla el backend)
  ↓
Resultado: timeline visible sin PII
```

### Flujo alternativo: vehículo sin eventos
```
  ↓
Empty state: "Sin eventos registrados"
  ↓
Resultado: clarify expectations, no error
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Merge cronológico (frontend)
- El frontend recibe 3 arrays separados del backend y los merge en una sola lista ordenada.
- Timestamp canónico: `createdAt` para transfers, `recordedAt` para mileages, `startsAt` para ownerships.
- Orden: descendente (más reciente primero). Desempate: por timestamp (no hay regla estricta para empates exactos al milisegundo).
- Cada entry renderiza: **icono** (por tipo), **fecha formateada** (dd/mm/yyyy o relativa), **título descriptivo**, **actor** (quién lo hizo, cuando aplica), **detalle** (notas si existen).

### RF-2: Tipado de entries
Cada tipo de evento se renderiza con:
- **Transferencia:** icono de transferencia 🔄; título = "Transferencia {status}" (ej. "Transferencia completada", "Transferencia pendiente"); actor = "De {fromUser} a {toUser}".
- **Kilometraje:** icono de仪表 📊; título = "{mileage} km registrado"; actor = source (owner/workshop/etc.); notas si existen.
- **Propiedad:** icono de auto 🚗; título = "Inicio de propiedad" (si es el primer ownership) o "Propiedad transferida a {user}" (si hay previa); notas si existen.

### RF-3: Empty state
- Si no hay eventos (arrays vacíos): mostrar "Sin eventos registrados".

### RF-4: Acceso compartido (ya resuelto por backend)
- El backend oculta emails de owners a holders con shared access; el frontend simplemente renderiza lo que llega.

### RF-5: Estados de transfer (D-054)
- Todos los estados se muestran como entries visibles. El título refleja el estado:
  - `completed` → "Transferencia completada"
  - `pending` → "Transferencia pendiente"
  - `rejected` → "Transferencia rechazada"
  - `cancelled` → "Transferencia cancelada"
  - `expired` → "Transferencia expirada"

### RF-6: Coherencia con la vista de detalle
- La sección Historial se integra como una Card más en el layout vertical de `/vehicles/[id]`.
- La carga de datos del history se hace en paralelo con photos/documents (ya que el GET /:id se dispara primero, el history puede lanzarse después sin bloquear la carga inicial).

### RF-7: Tipos y API frontend
- Agregar `VehicleTransfer` y `VehicleHistoryResponse` al archivo de tipos.
- Agregar `getVehicleHistory(vehicleId)` a `vehicleApi`.
- NO se modifica el contrato del GET /:id (ya trae los últimos 5 km; el history trae todos).

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Frontend: sección "Historial" en `/vehicles/[id]`, merge cronológico, tipado, función API, empty state, tests.
- Backend: **SIN CAMBIOS** (endpoint ya existe y funciona).

### Fuera (post-MVP / próximas iteraciones)
- Service records, appointments, work orders, estimates (F-020+, CareEpisodes).
- Filtros por tipo, rango de fechas, actor, búsqueda de texto.
- Paginación.
- Eventos de fotos/documents/km registrados desde F-013 (no son entries de timeline en el MVP; podrían serlo cuando los filtros estén disponibles).
- Modelo `CareEpisode` (Fase 2 del roadmap).

## 9. Criterios de Aceptación

- [ ] Dado el detalle de un vehículo con al menos 1 transferencia, 1 kilometraje y 1 cambio de propiedad, cuando carga la página, entonces la sección "Historial" muestra los 3+ eventos ordenados cronológicamente desc.
- [ ] Dado un evento de tipo transferencia completada, entonces se muestra con icono de transferencia, fecha, título "Transferencia completada" y nombres de from/to.
- [ ] Dado un evento de tipo kilometraje, entonces se muestra con icono de仪表, fecha, título con los km y el source.
- [ ] Dado un vehículo sin eventos (sin transfers, mileages ni ownerships), entonces la sección muestra "Sin eventos registrados".
- [ ] Dado un usuario con acceso compartido, cuando abre el detalle, entonces ve el historial pero sin emails de owners (ya controlado por backend).
- [ ] Regresión: ficha, fotos, documentos, km y listado siguen funcionando correctamente (tests previos no rompen).

### Build / Calidad
- [ ] `npm test` (frontend) verde + `npm run build` sin errores.
- [ ] Sin dependencias nuevas.

## 10. Dependencias

- D-001 (cookies HttpOnly), D-020/D-021 (PERSONAL default), D-039 (solo owner edita), D-046 (acceso compartido lectura).
- Backend: `GET /api/vehicles/:id/history` ya implementado (get-vehicle-history.handler).
- F-013: patrón de página de detalle con secciones Cards, `vehicleApi.getVehicle` ya existe.

## 11. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| El frontend mergea 3 arrays con timestamps heterogéneos (date-only para serviceDate, timestamptz para otros) | Baja | En F-014 NO hay service records (date-only); todos los timestamps son timestamptz. Sin riesgo. |
| Empty state: el usuario confunde "sin eventos" con "no cargó" | Baja | Diseñar empty state con icono/texto distinguishable del loading state. |
| El array `transfers` puede incluir estados "cancelled"/"expired" que no son significativos para el usuario | Media | Decisión D-054: se muestran todos. Si el usuario feedback que son ruido, se filtra post-MVP. |
| Volumen alto de eventos en el futuro (años de uso) | Baja | Sin paginación en MVP. Cuando crezca, se agrega paginación o lazy-loading (F-020+). |

---

*Fin de la especificación F-014 (borrador).*