# Especificación: F-011 — Editar Vehículo (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-09
> **Estado:** Aprobado para implementación
> **Basado en:** features.md Fase 1 (F-011), ADR-005, D-035..D-038, F-010 (spec + QA)

---

## 1. Problema

El propietario puede registrar su vehículo (F-010) pero **no puede corregirlo ni mantenerlo**:

- El listado "Mis vehículos" no ofrece acción de edición.
- No existe página/UI de edición en `frontend/`.
- El backend expone `PATCH /api/vehicles/:id` pero con debilidades:
  - `repository.update()` no hidrata `version.model.brand` → responde raw Prisma (sin `brand/model/version`), a diferencia del contrato unificado de F-010.
  - No captura P2002 → placa/VIN/engine duplicados al editar responden **500** (deben ser 409).
  - No normaliza la placa al editar (D-037 solo aplica en register) → permite duplicados "abc123" vs "ABC123".
- La edición es parte esencial del ciclo de vida del vehículo: datos correctos = historia confiable.

## 2. Objetivo

Completar el journey F-011 de extremo a extremo:

1. El propietario accede a la edición de un vehículo desde "Mis vehículos".
2. Ve el formulario precargado con los datos actuales (GET /:id).
3. Modifica datos y guarda (PATCH /:id) → el vehículo se actualiza y el listado refleja el cambio.
4. Errores de negocio (placa/VIN/engine duplicados) → 409 con mensaje claro, conservando el formulario.
5. Solo el propietario (owner) puede editar en MVP.

## 3. Actores

| Actor | Descripción |
|---|---|
| **Propietario autenticado** | Usuario con sesión activa (cookies HttpOnly D-001) que es **owner** del vehículo (ownership activa, `type: 'owner'`). |
| **Backend HCDV** | Ajusta el contrato `PATCH /api/vehicles/:id` existente (hidratación, P2002, normalización). |

> **Fuera de alcance (MVP):** edición por usuarios con acceso compartido (solo owner);
> cambio de ownership/transferencia; edición de fotos/documentos (F-013); borrado físico de historial.

## 4. Decisiones de producto (confirmadas 2026-09-09)

| ID | Decisión | Detalle |
|---|---|---|
| **D-039** | Solo el owner puede editar | `PATCH /api/vehicles/:id` usa `assertVehicleOwned` (no `assertVehicleAccess`). Usuarios con acceso compartido pueden consultar (GET) pero no editar en MVP. |
| **D-040** | Campos editables = todos los del alta, en PATCH parcial | Mismos campos de `RegisterVehicleDto` (placa, vin, engineNumber, versionId, años, color, notes), solo los enviados. Corregir el VIN registrado mal es legítimo (el `id` y el historial del vehículo permanecen). |
| **D-041** | Duplicados al editar → 409, no 500 | P2002 (placa/VIN/engine) en `update()` se traduce igual que en register (mensaje específico). |
| **D-042** | Normalización de placa también al editar | Mismo enfoque que D-037: `trim().toUpperCase()` antes de buscar/guardar en el update. |
| **D-043** | Vaciar campos opcionales en edición persiste `null` | Un campo opcional de texto/número (`vin`, `engineNumber`, `color`, `notes`, `manufactureYear`, `modelYear`) vaciado por el usuario se envía como `null` explícito → el backend lo persiste como NULL. **El catálogo (`versionId`) NO se envía como `null`**: si el usuario no lo cambia, se omite (`undefined`) para no borrar la rama (RF-2). `licensePlate` es obligatorio y no se puede vaciar. |

> Se registran en `DECISION-REGISTER.md` al cierre de la iteración (D-039..D-043).

## 5. Contrato Backend (verificado en código — ajustes necesarios)

### PATCH /api/vehicles/:id (existe; requiere ajustes)
```text
Auth: cookie access_token (JwtAuthGuard) + ContextGuard (default PERSONAL, D-020 A1)
Autorización: HOY assertVehicleAccess → DEBE CAMBIAR a assertVehicleOwned (D-039)
Body (parcial; UpdateVehicleDto = PartialType(RegisterVehicleDto)):
  { licensePlate?, vin?, engineNumber?, versionId?, manufactureYear?, modelYear?, color?, notes? }
  D-043: los campos opcionales de texto/número pueden enviarse como null para VACIARLOS
  (class-validator @IsOptional() acepta null; Prisma persiste NULL). versionId nunca viaja null (omitir = no tocar).
HOY:
  - repository.update(id, dto) → prisma.vehicle.update SIN include → responde raw Prisma (sin brand/model/version)
  - P2002 duplicado → 500 (sin manejo)
  - placa no normalizada (permite duplicado case-insensitive)
DEBE (ajustes):
  - repository.update(id, dto) → include version.model.brand (idéntico a create/list/get de F-010)
  - capturar P2002 → 409 CONFLICT con mensaje específico (reusar mapUniqueViolation)
  - normalización placa: trim().toUpperCase() en el handler (como register) + red de seguridad en update del repository si corresponde
Response: 200 → VehicleResponseDto (desnormalizado)
Errores: 401 (sin sesión) · 403 (no owner) · 404 (no existe) · 409 (duplicados)
```

### GET /api/vehicles/:id (existe; sin cambios)
```text
Auth: cookie access_token + assertOwnerShipOrSharedAccess (VehicleAccessService)
Response: 200 → VehicleResponseDto (ya desnormalizado, verificado en QA F-010)
Se usa para precargar el formulario de edición.
```

## 6. User Journey

```
Actor: Propietario autenticado (owner)
  ↓
Contexto: En "Mis vehículos" (/vehicles) presiona "Editar" en un vehículo
  ↓
Sistema:
  1. Navega a /vehicles/:id/edit (ruta protegida por proxy)
  2. GET /api/vehicles/:id → precarga el formulario
  3. Si no es owner → 403 (mensaje de error; la ruta solo se ofrece a owners)
  ↓
Acción: Modifica campos (placa, catálogo, años, color, notas) y presiona "Guardar"
  ↓
Sistema:
  1. Valida en cliente (Zod, espejo de register)
  2. PATCH /api/vehicles/:id (credentials: include)
  3. 200 → invalidate ["vehicles"] → redirect /vehicles (listado actualizado)
  4. 409 → mensaje junto al campo (placa/VIN) o general (engineNumber); datos conservados
  ↓
Resultado: Vehículo actualizado y visible en "Mis vehículos"
```

### Flujo alternativo: acceso denegado
```
Actor: Usuario con acceso compartido (no owner) intenta abrir edición
  ↓
Sistema: GET /:id → 200 (tiene acceso de consulta) pero la UI no ofrece "Editar"
  (o PATCH directo → 403)
  ↓
Resultado: No puede editar; el botón "Editar" solo se muestra a owners
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Solo owner edita (D-039)
- El backend usa `assertVehicleOwned` en `PATCH /api/vehicles/:id`.
- La UI solo muestra "Editar" a usuarios cuyo `ownerships` tenga `type: 'owner'` activa.
- Acceso compartido (grant-access) = solo lectura en MVP.

### RF-2: PATCH parcial (D-040)
- Solo los campos enviados se actualizan (PartialType).
- Si `versionId` no se envía, no se toca la versión existente (≠ register donde null = sin versión).

### RF-3: Duplicados → 409 (D-041)
- Placa/VIN/engineNumber duplicados (de otro vehículo) → 409 CONFLICT con el mismo mensaje que register.
- Mensajes: "Ya existe un vehículo registrado con esa placa" / "... ese VIN" / "... ese número de motor".

### RF-4: Normalización de placa (D-042)
- Al editar, la placa se normaliza a mayúsculas + trim antes de buscar duplicados y antes de guardar.

### RF-5: Pre-carga del formulario
- `GET /api/vehicles/:id` (ya desnormaliza) alimenta el form.
- El catálogo se precarga con la marca/modelo/versión actuales (preselección en la cascada).

### RF-6: Errores visibles
- 409 → mensaje junto al campo, formulario conserva valores.
- 401 → redirect /login (refresh interceptor existente).
- 403 → mensaje de acceso denegado.
- 404 → pantalla "vehículo no encontrado".
- 500/red → mensaje genérico.

### RF-7: Post-guardado
- 200 → invalidate ["vehicles"] + redirect /vehicles.
- El listado muestra los datos actualizados sin navegación manual.

### RF-8: Vaciar campos opcionales (D-043)
- Si el usuario vacía un campo opcional de texto/número, el frontend envía `null` explícito.
- El backend (DTO con `@IsOptional()`) acepta `null` y Prisma persiste NULL en la columna.
- El catálogo NO se vacía con `null`: `versionId` se omite salvo cambio explícito (RF-2).
- `licensePlate` es obligatorio: no se puede vaciar (el form la requiere; `null` sería rechazado por la validación).

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Backend:
  - `update()` con include de `version.model.brand` + P2002→409 (reuso de mapUniqueViolation).
  - Normalización de placa en el handler de update (y red de seguridad en repository si aplica).
  - Controller: `assertVehicleAccess` → `assertVehicleOwned` en PATCH.
  - Tests: handler update (200/404/409 placa/VIN/engine, normalización), repository update (include + P2002).
- Frontend:
  - `vehicleApi.getVehicle(id)` + `vehicleApi.updateVehicle(id, input)`.
  - Página `/vehicles/[id]/edit` (form precargado, reutiliza schema zod del register).
  - Botón "Editar" en el listado (solo visible para owners — según data del listado).
  - Redirect/refetch post-200; manejo 409/403/404.
  - **D-043:** campos opcionales vaciados → `null` explícito; `versionId` omitido si no cambia.
  - Tests: página de edición (precarga, submit, 409, vaciado D-043), update en api.test, listado con botón Editar.

### Fuera (próximas iteraciones / NO romper)
- Borrar vehículo con historial (bulk soft-delete, bug pre-existente DELETE 500 — ticket separado ya registrado en Sección 17).
- Edición por usuarios con acceso compartido; transferencia/co-ownership (F-015+).
- Edición de fotos/documents/mileages (F-013).
- Timeline (F-014), vista de detalle completa (F-013).

## 9. Cambios Técnicos Sugeridos (para análisis del Tech Lead)

> El PM define QUÉ y POR QUÉ. El Tech Lead define CÓMO.

| Área | Sugerencia | Nota |
|---|---|---|
| Hidratación update | Replicar en `update()` el include de `create()`/list/get (F-010 §10): `version.model.brand` | Respuesta 200 desnormalizada, contrato unificado. |
| P2002 en update | Capturar `PrismaClientKnownRequestError` P2002 en `update()` y relanzar 409 vía el mismo `mapUniqueViolation` (extraerlo a método reutilizable del repository) | Hoy 500. |
| Normalización placa | En `UpdateVehicleHandler`: `trim().toUpperCase()` si viene `licensePlate`; red de seguridad en repository si aplica | D-042; consistente con D-037. |
| AUTHZ PATCH | Cambiar `assertVehicleAccess` → `assertVehicleOwned` (verificar método disponible en controller) | D-039. |
| Frontend | `vehicleApi.getVehicle` + `updateVehicle`; página edit con schema zod compartido; botón Editar solo owner | Reuso de componentes/form de F-010. |

## 10. Criterios de Aceptación

### Edición (flujo principal)
- [ ] Dado un owner con vehículo, cuando presiona "Editar" en el listado, entonces navega a `/vehicles/:id/edit` con el formulario precargado (GET /:id).
- [ ] Dado el formulario precargado, cuando modifica color/años/notas y guarda, entonces PATCH responde 200 con `brand/model/version` desnormalizados y el listado refleja el cambio tras redirect.
- [ ] Dado el formulario precargado, cuando cambia la placa a "abc999" y guarda, entonces el vehículo queda con "ABC999" (D-042).
- [ ] Dado un PATCH sin `versionId`, entonces la versión existente NO se borra (la rama del catálogo se mantiene).
- [ ] Dado un form donde el usuario vacía "Color"/"Notas"/"VIN", entonces el PATCH envía `null` para ese campo y el backend persiste NULL (al recargar, el campo aparece vacío). El catálogo NO se vacía aunque el usuario no lo toque (D-043).

### Errores de negocio
- [ ] Dado un PATCH con placa ya registrada (de otro vehículo), entonces responde 409 "Ya existe un vehículo registrado con esa placa" (no 500) y la UI muestra el mensaje junto al campo conservando los datos.
- [ ] Dado un PATCH con VIN ya registrado, entonces responde 409 con mensaje específico (no 500).
- [ ] Dado un PATCH con engineNumber ya registrado, entonces responde 409 con mensaje específico (no 500).

### Autorización
- [ ] Dado un usuario NO owner (solo acceso compartido), cuando intenta PATCH directo, entonces responde 403.
- [ ] Dado un PATCH sobre vehículo inexistente, entonces responde 404.
- [ ] Dado un usuario sin sesión, cuando abre `/vehicles/:id/edit`, entonces es redirigido a `/login?next=<ruta>`.

### UI
- [ ] Dado un listado de un owner, entonces cada vehículo muestra botón "Editar"; el acceso compartido NO muestra el botón.
- [ ] Dado un error 409, entonces el formulario conserva los valores y muestra el mensaje correcto.
- [ ] Dado un guardado exitoso, entonces redirige a `/vehicles` con los datos actualizados.

### Build / Calidad
- [ ] Backend: `npm test` verde (suites + tests nuevos) + `npm run build` sin errores.
- [ ] Frontend: `npm test` verde (tests nuevos) + `npm run build` sin errores.
- [ ] Sin secretos, sin tokens en localStorage, sin cambios de schema (salvo decisión del Tech Lead).

## 11. Dependencias

- D-001 (cookies HttpOnly), D-020/D-021 (Active Context PERSONAL).
- Backend existente: `PATCH /api/vehicles/:id`, `GET /api/vehicles/:id`, catálogo.
- F-010: patrón de hidratación `version.model.brand` (create/list/get), `mapUniqueViolation`, mensajes 409 estandarizados.
- Error envelope D-025 (409 → code CONFLICT).

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| PATCH 500 por duplicados | Alta | P2002→409 (D-041) — mismo fix que ya existe en register. |
| PATCH devuelve raw Prisma | Media | include en update() (F-010 §10 replicado). |
| Edición por no-owner permitida hoy | Alta | assertVehicleOwned en PATCH (D-039). |
| Cambiar placa rompe trazabilidad | Baja | El `id` y el historial permanecen; solo cambia la placa (dato de identificación editable). |
| Bug DELETE 500 pre-existente | Media | Ticket separado registrado (Sección 17); NO se toca en F-011. |

---

*Fin de la especificación F-011.*