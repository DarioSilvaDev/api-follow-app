# Especificación: F-010 — Registrar Vehículo (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-09
> **Estado:** Aprobado para implementación
> **Basado en:** features.md Fase 1 (F-010), ADR-004/ADR-005, D-001 (cookies HttpOnly), D-020 (Active Context)

---

## 1. Problema

El producto no permite a un propietario registrar su vehículo desde el frontend,
por lo que el primer journey del Core Domain ("el paciente") no puede ejecutarse:

- No existe pantalla de vehículos en `frontend/`.
- No existe formulario de registro ni listado de "Mis vehículos".
- El dashboard solo muestra datos de sesión; no hay navegación hacia vehículos.

El backend ya implementa `POST /api/vehicles`, `GET /api/vehicles` y `GET /api/vehicles/:id`
(con ownership y permisos), pero **no hay consumidor del contrato** y existen
**ajustes menores de robustez** (normalización de placa, manejo de VIN duplicado,
consistencia de respuesta) que deben cerrarse antes de exponerlo al usuario.

## 2. Objetivo

Completar el journey F-010 de extremo a extremo:

1. El propietario registra su vehículo desde el frontend.
2. El vehículo queda asociado como **owner** (VehicleOwnership activo).
3. El propietario ve su vehículo en el listado "Mis vehículos".
4. El registro respeta el contexto activo (MVP: solo PERSONAL).
5. Errores de negocio (placa/VIN duplicados) se muestran claramente al usuario.

## 3. Actores

| Actor | Descripción |
|---|---|
| **Propietario autenticado** | Usuario con sesión activa (cookies HttpOnly D-001) que registra y consulta sus vehículos. |
| **Backend HCDV** | Expose contratos ya implementados; ajustes menores de robustez. |

> **Fuera de alcance (MVP):** taller registrando vehículos en contexto WORKSHOP,
> co-ownership al alta, compra de vehículo a través de transferencia (F-015+).

## 4. Decisiones de producto (confirmadas 2026-09-09)

| ID (a registrar) | Decisión | Detalle |
|---|---|---|
| **D-035** | Registro solo en contexto PERSONAL en MVP | El vehículo se asocia al `user.id` autenticado como `owner`. Los miembros de taller **no** registran vehículos en esta iteración (WORKSHOP → post-MVP). El frontend no envía `X-Context-Type` (default PERSONAL) para estas llamadas. |
| **D-036** | VIN opcional en MVP | El formulario lo permite opcional; la UI informa que completarlo mejora la trazabilidad. No bloquear el registro por falta de VIN. |
| **D-037** | Placa: formato libre + normalización | Alfanumérico de 2–10 caracteres. El backend normaliza a mayúsculas + trim (al buscar y al guardar) para impedir duplicados "abc123" vs "ABC123". Sin regex por país en MVP. |
| **D-038** | Catálogo opcional, sin texto libre | El selector marca → modelo → versión (catálogo) es opcional. Si no se selecciona versión, quedan vacíos y el registro continúa. No hay campos de texto libre para marca/modelo/versión en esta iteración. |

> Estas decisiones se formalizarán en `DECISION-REGISTER.md` (IDs D-035..D-038)
> al cierre de la iteración.

## 5. Contratos Backend (verificados en código)

### POST /api/vehicles
```text
Auth: cookie access_token (JwtAuthGuard) + ContextGuard
     (sin X-Context-Type → default PERSONAL, D-020 A1)
Body: {
  licensePlate: string        // obligatorio
  vin?: string                // opcional (D-036), unique en BD
  engineNumber?: string       // opcional, unique en BD
  versionId?: string (uuid)   // opcional (D-038), catálogo
  manufactureYear?: number    // 1900–2100
  modelYear?: number          // 1900–2100
  color?: string
  notes?: string
}
Response: 201 → VehicleResponseDto
          { id, licensePlate, vin, engineNumber, versionId, brand, model, version,
            manufactureYear, modelYear, color, notes, createdAt, updatedAt, ... }
Efectos:
  - Crea Vehicle.
  - Crea VehicleOwnership { userId: auth.user.id, type: 'owner', startsAt: now }.
  - Emite VehicleRegisteredEvent (vehicle.registered).
Errores:
  401 (sin sesión)
  409 → "Vehicle with plate 'X' already exists" (placa duplicada, D-037 normalización)
  409 → mensaje claro VIN/engineNumber duplicado (ajuste propuesto, ver §9)
```

### GET /api/vehicles
```text
Auth: cookie access_token + ContextGuard
Query: page?, limit?  (defaults: page=1, limit=DEFAULT_PAGE_SIZE; máx MAX_PAGE_SIZE)
Response: 200 →
  { data: Vehicle[] (ownerships activos del usuario + foto primaria),
    meta: { total, page, limit, totalPages } }
Filtro: ownerships.some({ userId, endsAt: null })
```

### GET /api/vehicles/:id
```text
Auth: cookie access_token + assertOwnershipOrSharedAccess (VehicleAccessService)
Response: 200 → VehicleResponseDto
Errores: 404 (no existe), 403 (sin acceso)
```

### Catálogo (para el selector marca → modelo → versión)
```text
GET /api/vehicle-brands          → marcas (orden nombre asc)
GET /api/vehicle-models?brandId  → modelos por marca
GET /api/vehicle-versions?modelId → versiones por modelo
Auth: cookie access_token (JwtAuthGuard)
```

> **Nota contrato (inconsistencia detectada):** `GET /api/vehicles` (list) devuelve
> objetos crudos de Prisma (sin `brand/model/version` desnormalizados), mientras
> `GET /api/vehicles/:id` usa `VehicleResponseDto`. El Tech Lead debe uniformar el
> contrato (ver §9).

## 6. User Journeys

### 6.1 Registrar vehículo (flujo principal)

```
Actor: Propietario autenticado
  ↓
Contexto: Abre /vehicles (o navega desde el dashboard) y presiona "Registrar vehículo"
  ↓
Sistema: GET /api/vehicle-brands (opcional pre-carga del catálogo)
  ↓
Acción: Completa el formulario:
        - Placa (obligatoria)
        - Marca → Modelo → Versión (opcional, catálogo en cascada)
        - VIN (opcional, con nota de trazabilidad)
        - Año de fabricación, color, notas (opcionales)
  ↓
Sistema:
  1. Valida formato en cliente (Zod) y normaliza placa
  2. POST /api/vehicles (credentials: include)
  3. 201 → vehículo creado como owner
  4. Redirige a /vehicles (o al detalle) mostrando el nuevo vehículo
  ↓
Resultado: Vehículo registrado y visible en "Mis vehículos"
```

### 6.2 Error: placa duplicada

```
Actor: Propietario autenticado que registra una placa existente
  ↓
Sistema: POST /api/vehicles → 409 CONFLICT
  ↓
UI: Muestra "Ya existe un vehículo registrado con esa placa"
  ↓
Resultado: El formulario conserva los datos; el usuario corrige la placa
```

### 6.3 Error: VIN/engineNumber duplicado (ajuste backend propuesto)

```
Actor: Propietario autenticado que registra un VIN existente
  ↓
Sistema: POST /api/vehicles → 409 CONFLICT (hoy: 500 P2002 sin manejar)
  ↓
UI: Muestra "Ya existe un vehículo registrado con ese VIN" (o engineNumber)
  ↓
Resultado: Sin error 500; mensaje claro
```

### 6.4 Listar "Mis vehículos"

```
Actor: Propietario autenticado
  ↓
Contexto: Abre /vehicles
  ↓
Sistema:
  1. GET /api/vehicles (credentials: include)
  2. 200 → data + meta (paginación)
  3. Estado vacío: CTA "Registrar vehículo"
  ↓
Resultado: Listado con placa, marca/modelo/versión, año, color
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Alta como owner (D-035)
- Todo vehículo creado genera `VehicleOwnership` del usuario autenticado con `type: 'owner'`
  y `startsAt: now` (comportamiento backend existente, se mantiene).
- El alta solo aplica en contexto PERSONAL (MVP). El frontend no envía `X-Context-Type`
  al crear/consultar vehículos.

### RF-2: Normalización de placa (D-037)
- La placa se normaliza a mayúsculas + trim en backend (buscar + guardar).
- Formato aceptado: alfanumérico, 2–10 caracteres (validación backend y cliente).
- Placa duplicada (tras normalización) → `409 CONFLICT`.

### RF-3: Identificadores opcionales (D-036 / D-038)
- `vin`, `engineNumber`, `versionId`, `manufactureYear`, `modelYear`, `color`, `notes` son opcionales.
- `vin` duplicado → `409 CONFLICT` con mensaje específico (ajuste propuesto).
- `engineNumber` duplicado → `409 CONFLICT` con mensaje específico (ajuste propuesto).
- Sin selección de catálogo, el vehículo se guarda sin `versionId`; la UI muestra
  marca/modelo/versión como "—".

### RF-4: Catálogo en cascada
- El formulario carga marca → modelo → versión desde el catálogo público (JWT).
- Si el catálogo falla o está vacío, el registro sigue siendo posible sin versionId (D-038).

### RF-5: Sesión y permisos
- Registro solo con sesión activa (middleware de rutas + backend enforcement).
- El backend es la frontera final: un usuario sin sesión recibe 401, sin acceso 403.

### RF-6: Errores visibles
- 409 placa/VIN/engine → mensaje claro junto al campo.
- 401 → redirige a /login (interceptor refresh existente).
- Error de red/500 → mensaje genérico con reintento.
- Botones submit con spinner + disabled durante la petición.

### RF-7: Post-registro
- Tras 201, redirigir a `/vehicles` mostrando el nuevo vehículo (refetch de la lista).
- El dashboard puede mostrar el estado "Propietario de vehículo" actualizado (`isVehicleOwner`).

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Ajuste backend menor:
  - Normalización de placa (D-037).
  - Manejo de P2002 para VIN/engineNumber → 409 (D-036).
  - (Tech Lead) Uniformar contrato list vs detail.
- Frontend:
  - `vehicleApi` en `src/lib/api.ts` (list, create) + catálogo.
  - Tipos `types/vehicle.ts` alineados al contrato verificado.
  - Página `/vehicles` (listado + estado vacío).
  - Página `vehicles/new` (formulario de registro).
  - Navegación mínima desde `/dashboard` hacia "Mis vehículos" (link/card).
  - Tests: formulario (validación, submit, 409), listado, normalización de placa en cliente.

### Fuera (próximas iteraciones / NO romper)
- Editar vehículo (F-011), detalle completo (F-013), timeline vacío (F-014).
- Sidebar completo y navegación Fase 2 del plan-frontend (solo link mínimo aquí).
- Registro en contexto WORKSHOP; co-ownership al alta; compañía como owner.
- Búsqueda de vehículos (F-012).
- Subida de fotos/documents durante el alta (endpoints existen; se integran en F-013).

## 9. Cambios Técnicos Sugeridos (para análisis del Tech Lead)

> El PM define QUÉ y POR QUÉ. El Tech Lead define CÓMO.

| Área | Sugerencia | Nota |
|---|---|---|
| Normalización placa | En `RegisterVehicleHandler` y `findByLicensePlate`: `trim().toUpperCase()` antes de buscar/crear; validación DTO (2–10 alfanumérico) | Evitar duplicados case-insensitive. |
| P2002 para VIN/engineNumber | En `PrismaVehicleRepository.create`: capturar `PrismaClientKnownRequestError` (P2002) y relanzar `ConflictException` distinguiendo campo | Hoy respondería 500. Campo `meta.target` distingue licensePlate/vin/engineNumber. |
| Contrato list vs detail | Unificar `GET /api/vehicles` para devolver vehículos con `brand/model/version` (mismo shape que `VehicleResponseDto`); revisar paginación/meta | Hoy el listado expone raw Prisma (con `ownerships[]`, `photos[]`). Frontend necesita shape estable. |
| Validación cliente | Zod schema en el formulario espejo del DTO (placa 2–10 alfanumérica, años 1900–2100, uuid versionId) | Evitar round-trips innecesarios. |
| Catálogo | Pre-cargar marcas; cargar modelos/versiones on-demand al elegir rama | Endpoints ya existen. |

## 10. Criterios de Aceptación

### Registro (flujo principal)
- [ ] Dado un propietario autenticado, cuando completa el formulario con placa válida y presiona "Registrar", entonces `POST /api/vehicles` responde 201 y el vehículo aparece en el listado con el usuario como owner.
- [ ] Dado un registro con placa `abc123`, cuando el backend procesa, entonces guarda `ABC123`; un segundo intento con `ABC123` responde 409.
- [ ] Dado un registro con versión seleccionada del catálogo, entonces la respuesta incluye `brand`, `model`, `version` desnormalizados.
- [ ] Dado un registro **sin** selección de catálogo, entonces el vehículo se crea con `versionId: null` y el listado muestra "—" en marca/modelo/versión (sin error).

### Errores de negocio
- [ ] Dado un VIN ya registrado, cuando se intenta crear, entonces responde 409 con mensaje "Ya existe un vehículo registrado con ese VIN" (no 500).
- [ ] Dado un engineNumber ya registrado, cuando se intenta crear, entonces responde 409 con mensaje específico.
- [ ] Dado placa duplicada, cuando se intenta crear, entonces responde 409 y la UI muestra mensaje claro conservando los datos del formulario.

### Listado
- [ ] Dado un propietario con vehículos, cuando abre `/vehicles`, entonces ve su listado paginado con placa, marca/modelo/versión, año y color.
- [ ] Dado un propietario sin vehículos, cuando abre `/vehicles`, entonces ve estado vacío con CTA "Registrar vehículo".

### Navegación
- [ ] Dado un dashboard de un propietario, cuando navega, entonces existe un link visible a "Mis vehículos".
- [ ] Dado un usuario sin sesión, cuando intenta abrir `/vehicles` o `/vehicles/new`, entonces es redirigido a `/login?next=<ruta>`.

### Build / Calidad
- [ ] `npm run build` sin errores (frontend).
- [ ] Suites de test backend y frontend verdes (sin regresiones).
- [ ] Sin secretos, sin tokens en localStorage, sin cambios de schema en esta iteración (salvo decisión del Tech Lead).

## 11. Dependencias

- D-001 (cookies HttpOnly) — cliente HTTP `credentials: include`.
- D-020 / D-021 (Active Context) — default PERSONAL; sin headers de contexto en estas llamadas.
- Backend vehicles existente: `POST /api/vehicles`, `GET /api/vehicles`, `GET /api/vehicles/:id`.
- Catálogo vehicular existente: brands/models/versions (JWT).
- Error envelope D-025 — la UI mapea códigos cuando estén presentes.

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| El listado hoy expone shape distinto al detalle | Media | Tech Lead uniforma contrato (§9) antes/durante implementación frontend. |
| VIN/engineNumber duplicado responde 500 | Alta | Capturar P2002 → 409 (backend menor). |
| Usuario registra placa en minúsculas y luego duplica | Media | Normalización backend (D-037) cubre ambos flujos. |
| Catálogo vacío sin marca/modelo | Baja | El alta funciona sin versionId (D-038); UI muestra "—". |
| Sin navegación lateral (solo dashboard) | Baja | Link/card mínima en dashboard; sidebar completo en otra iteración. |

---

*Fin de la especificación F-010.*