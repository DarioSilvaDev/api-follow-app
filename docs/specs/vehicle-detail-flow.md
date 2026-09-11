# Especificación: F-013 — Vista de Detalle del Vehículo (end-to-end)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-11
> **Estado:** Borrador para validación técnica (Tech Lead)
> **Basado en:** features.md Fase 1 (F-013), D-035..D-045, F-010/F-011/F-012 (spec + QA)

---

## 1. Problema

El propietario puede listar, registrar, buscar y editar sus vehículos (F-010/011/012), pero **no puede ver el detalle completo de un vehículo**:

- No existe página de detalle (`/vehicles/[id]`) — desde el listado solo hay "Editar" (owner) y las cards no son cliqueables.
- El backend **ya expone** toda la información (GET /:id con photos, documents, últimos 5 mileages, ownerships; CRUD completo de fotos/documentos; record-mileage; history), pero **el frontend no la consume**.
- El frontend no tiene funciones API de fotos/documentos/mileage, ni tipos (`photos` está tipado como `unknown[]`).

## 2. Objetivo

Completar el journey de **visualización y gestión de la información del vehículo**:

1. El usuario abre el detalle de un vehículo desde "Mis vehículos" (click en la card).
2. Ve datos del vehículo (datos ficha + catálogo desnormalizado), fotos (galería), documentos y últimos kilometrajes.
3. Según decisión de permisos (D-048): sube/elimina/establece foto principal, sube/borra documentos, registra kilometraje.
4. Errores y estados consistentes con F-010/011/012.
5. El timeline/historia completa es F-014 (en la vista solo últimos kilometrajes y datos de contexto).

## 3. Actores

| Actor | Descripción |
|---|---|
| **Propietario autenticado** | Usuario con sesión activa, owner del vehículo (puede leer y escribir). |
| **Usuario con acceso compartido** | Usuario con `VehicleAccess` vigente (grant-access). Lee detalle y fotos/documentos; escritura según D-048. |
| **Backend HCDV** | Ya expone los endpoints; ajustes de autorización según D-048 (si aplica). |

> **Fuera de alcance (MVP):** timeline/historia completa (F-014); edición de fotos con caption/mimeType/metadata (el schema tiene `caption` pero el upload no lo setea — post-MVP); draft de documentos; transferencia de propiedad desde la vista (existe endpoint, pero UI de transfers es F-015+); acceso desde talleres (contexto workshop no implementado).

## 4. Decisiones de producto (propuestas — pendientes de confirmación)

| ID | Decisión propuesta | Detalle |
|---|---|---|
| **D-046** | La vista de detalle es accesible para owner + acceso compartido (lectura) | `GET /api/vehicles/:id` ya usa `assertVehicleAccess` (owner OR shared OR super_admin). Desde el listado, TODA la card es cliqueable (no solo el botón Editar). El botón Editar sigue solo para owners (D-039). |
| **D-047** | La vista de detalle MVP muestra: ficha del vehículo + galería de fotos + documentos + últimos kilometrajes | Los últimos 5 mileages vienen en GET /:id (sin llamada extra). El timeline completo (transfers/history) es F-014. |
| **D-048** | Escritura de fotos/documentos/mileage desde la vista: **solo el owner** (alineado con D-039) | HOY el backend permite escribir con `assertVehicleAccess` (shared también escribe). La propuesta: los writes (`POST`/`PATCH`/`DELETE` de fotos, documents y `POST mileage`) pasan a `assertVehicleOwned`; los reads se mantienen con `assertVehicleAccess`. Alternativa descartada: mantener comportamiento actual (inconsistente con D-039: "el acceso compartido es solo lectura en MVP"). **Matiz confirmado por el usuario:** las fotos del vehículo las carga el dueño en el MVP; el flujo "mecánico sube fotos de antes/después del servicio" es **post-MVP** (ver §8 — requiere contexto workshop + vínculo foto↔service record). D-048 NO lo bloquea. |

> Se registran en `DECISION-REGISTER.md` al cierre (D-046..D-048). Ver validación técnica (§9).

## 5. Contrato Backend

### Ya existe (reutilizar — sin cambios salvo D-048)

| Endpoint | Descripción | Guard HOY | Guard propuesto (D-048) |
|---|---|---|---|
| `GET /api/vehicles/:id` | Vehicle + desnormalizado + photos + documents + últimos 5 mileages + ownerships | `assertVehicleAccess` | sin cambios |
| `GET :id/photos` | Lista fotos (primary primero) | `assertVehicleAccess` | sin cambios |
| `GET :id/photos/:photoId?signed=true` | Foto individual + signed URL (R2, expira `SIGNED_URL_EXPIRES_SECONDS`) | `assertVehicleAccess` | sin cambios |
| `POST :id/photos` | Upload (MIME image/jpeg/png/webp/avif, 10MB, WebP 1920px) — primera foto auto-primary | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `PATCH :id/photos/:photoId/primary` | Set primary | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `DELETE :id/photos/:photoId` | Delete R2 + DB, auto-promueve primary | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `GET :id/documents` / `GET :id/documents/:docId?signed=true` | Lista/obtiene documentos + signed URL | `assertVehicleAccess` | sin cambios |
| `POST :id/documents` | Upload documento (imagen o PDF, 10MB) + metadata (name, documentType, expiresAt) | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `PATCH :id/documents/:docId` | Actualiza metadata (name, documentType, expiresAt) | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `DELETE :id/documents/:docId` | Delete R2 + DB | `assertVehicleAccess` | **→ `assertVehicleOwned`** |
| `POST :id/mileage` | Registra kilometraje (source, notes; monotónico) + emite `vehicle.mileage.recorded` | `assertVehicleAccess` | **→ `assertVehicleOwned`** |

### Notas del contrato (verificadas en código)
- `PhotoResponseDto` `{ id, vehicleId, key, caption, isPrimary, createdAt }` — la `key` NO es URL pública: R2 no es público.
- `DocumentResponseDto` `{ id, vehicleId, key, name, documentType, expiresAt, createdAt, updatedAt }`.
- `VehicleResponseDto.from()` ya incluye `photos`/`documents`/`ownerships` crudos (sin desnormalizar) — el frontend los tipará.
- GET /:id trae `mileages` (últimos 5, `recordedAt: desc`).
- `documentType` es string libre (sin enum) — para un futuro controlar los valores.

### Estrategia de signed URLs — DECISIÓN TÉCNICA VALIDADA (TL)
- **Batch con query param `?signed=true` en los listados** (backward compatible):
  - `GET :id/photos?signed=true` → `[{ id, key, caption, isPrimary, createdAt, url, expiresAt }]`
  - `GET :id/documents?signed=true` → `[{ id, key, name, documentType, expiresAt, createdAt, updatedAt, url, expiresAt }]`
- **Sin `?signed=true`** se mantiene el contrato actual (sin URLs). **NO se modifica `VehicleResponseDto`** (el listado no necesita URLs firmadas y pagaría costo de firmado innecesario).
- **La vista de detalle hace 3 llamadas:**
  1. `GET /api/vehicles/:id` → data (ficha + ownerships + mileages 5 + photos/documents crudos).
  2. `GET /api/vehicles/:id/photos?signed=true` → URLs de fotos (paralelo con 3).
  3. `GET /api/vehicles/:id/documents?signed=true` → URLs de documentos (paralelo con 2).
- Las URLs firmadas expiran (`SIGNED_URL_EXPIRES_SECONDS`, default 3600s). El `expiresAt` permitirá al frontend refrescar si vence.

### Nota de implementación (validada TL)
- **El cambio de guards de D-048 es EXCLUSIVAMENTE del controller.** Los handlers de photos/documents/mileage NO contienen lógica de autorización interna ni dependen de quién pasó el guard (ninguno accede a `VehicleAccess`; `recordedByUserId` se persiste tal cual). No se modifican handlers.

## 6. User Journey

```
Actor: Propietario autenticado (o usuario con acceso compartido)
  ↓
Contexto: En "Mis vehículos" (/vehicles) hace click en la card de un vehículo
  ↓
Sistema: Navega a /vehicles/:id (ruta protegida por proxy y por el GET 403/404)
  ↓
3 llamadas (validado TL):
  1. GET /api/vehicles/:id → ficha + ownerships + últimos 5 km + photos/documents crudos
  2. GET /api/vehicles/:id/photos?signed=true → fotos con URLs (paralelo con 3)
  3. GET /api/vehicles/:id/documents?signed=true → documentos con URLs (paralelo con 2)
  ↓
Vista (D-047):
  [Ficha] placa, catálogo desnormalizado, años, color, notas, ownership
  [Fotos] galería (signed URLs) + upload (solo owner, D-048) + set primary + delete
  [Documentos] lista (signed URLs) + upload (solo owner) + delete + editar metadata
  [Kilometraje] últimos 5 registros + formulario "registrar km" (solo owner)
  ↓
Acción (owner): sube una foto → se agrega a la galería (upload → success)
  ↓
Resultado: El propietario construye la historia visual/documental de su vehículo
```

### Flujo alternativo: acceso compartido
```
Actor: Usuario con acceso compartido
  ↓
Sistema: Ve el detalle completo + fotos/documentos (read) — NO ve botones de
  escritura (upload, delete, primary, registrar km, editar documento)
  ↓
Resultado: Solo lectura (D-048), botón "Editar vehículo" tampoco visible (D-039)
```

## 7. Reglas de Negocio / Requisitos Funcionales

### RF-1: Navegación al detalle (D-046)
- Desde `/vehicles`, toda la card es un link a `/vehicles/:id` (no solo las acciones).
- El detalle es accesible para owner y usuarios con acceso compartido (mismo criterio GET :id).

### RF-2: Ficha del vehículo
- Muestra: placa, brand/model/version (o "—" D-038), años (manufacture/model), color, notas, VIN/engineNumber si existen, ownership actual.
- Sin expositión de PII innecesaria: ownerships se muestran con nombre/apellido (el backend ya controla email).

### RF-3: Galería de fotos
- Lista todas las fotos con signed URLs (`GET :id/photos/:photoId?signed=true` por foto, o listados: ver decisión técnica §9 — el listado no trae URL firmada, cada foto requiere su signed URL).
- La foto primary se muestra destacada (el listado ya ordena primary primero).
- Upload: input file (acepta los MIME del backend), loading, manejo de errores (400 MIME/tamaño, 401, 403).
- Set primary: click/acción sobre la foto → PATCH primary → refetch fotos.
- Delete: confirmación → DELETE → refetch.
- **Solo owner** (D-048): los botones de upload/primary/delete se muestran solo para owner.

### RF-4: Documentos
- Lista de documentos con signed URL para visualizar/descargar (imagen renderizada; PDF → link/ícono).
- Upload con metadata (name, documentType, expiresAt opcional).
- Editar metadata (solo owner) — sin reemplazo de archivo.
- Delete con confirmación (solo owner).
- **Solo owner** (D-048): escritura oculta para shared.

### RF-5: Kilometraje
- Lista los últimos 5 registros (source, km, fecha, notas).
- Formulario "Registrar km" (solo owner, D-048): input numérico + source (owner) + notas opcionales.
- Manejo 409/400 por monotonicidad (km menor al último → error claro).

### RF-6: Estados y errores (patrón F-011)
- Loading (spinner), error de carga con Reintentar, 404 → "Vehículo no encontrado", 403 → mensaje de acceso denegado, 401 → redirect login.
- Post-upload/delete/update → refetch de la sección correspondiente (sin página completa).
- MIME/tamaño inválido → mensaje claro junto al upload.

### RF-7: Tipos y API frontend
- Tipar `VehiclePhoto`, `VehicleDocument`, `VehicleMileage`, `VehicleMileageSource` en `frontend/src/types/vehicle.ts` (reemplazar `photos?: unknown[]`).
- Agregar a `vehicleApi`: `listPhotos`, `getPhotoSignedUrl`, `uploadPhoto`, `setPrimaryPhoto`, `deletePhoto`, `listDocuments`, `getDocumentSignedUrl`, `uploadDocument`, `updateDocument`, `deleteDocument`, `recordMileage`.

## 8. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- Backend (SOLO si se confirma D-048 — cambio de guards en writes):
  - Writes de fotos (POST/PATCH/DELETE), documents (POST/PATCH/DELETE) y POST mileage → `assertVehicleOwned`.
  - Reads sin cambios (assertVehicleAccess).
  - Tests de autorización actualizados (403 para shared en writes, 200 para owner).
- Frontend:
  - Página `/vehicles/[id]` (ficha + fotos + documentos + kilometraje).
  - Funciones API de fotos/documentos/mileage + tipos.
  - Link desde el listado (card cliqueable).
  - Navegación post-edición (F-011): redirigir a `/vehicles/[id]` en vez de `/vehicles`? (decisión menor — recomendado sí).
  - Tests (página de detalle + api + tipos).

### Fuera (próximas iteraciones / NO romper)
- Timeline completo (F-014): `GET :id/history` (transfers + mileages completos + ownerships).
- Edición de caption/metadata de fotos; upload con metadatos de imagen; control de documentType (string libre hoy).
- UI de transfers (F-015+), gestión de grants de acceso (existe endpoint).
- Escritura desde taller (contexto workshop — `recordedByMemberId` preparado pero sin ruta con contexto de taller).
- **Fotos de taller (mecánico) antes/después del servicio — POST-MVP (decisión del usuario 2026-09-11):** el dueño carga fotos en el MVP (D-048); el flujo "el mecánico sube fotos del antes/después de un servicio para el registro visual de la atención" se habilitará cuando exista el contexto workshop. Requerirá: (a) contexto de taller activo, (b) vínculo foto ↔ service record/work order, (c) autorización por membresía + trabajo vinculado al vehículo, (d) posible campo de origen/actor en `VehiclePhoto` (hoy solo tiene `key`/`caption`/`isPrimary`). **No se modifica el schema ni se agrega el flujo en F-013.**

## 9. Cambios Técnicos Sugeridos (para análisis del Tech Lead)

> El PM define QUÉ y POR QUÉ. El Tech Lead define CÓMO.

| Área | Sugerencia | Nota |
|---|---|---|
| Guards writes (D-048) | Cambiar `assertVehicleAccess` → `assertVehicleOwned` en el controller para POST/PATCH/DELETE de photos, documents y POST mileage | Más consistente con D-039; requiere revisión de tests existentes de esos handlers. |
| Signed URLs | Definir la estrategia: ¿1 llamada por foto (`GET :id/photos/:photoId?signed=true`) en paralelo, o cambiar el contrato de listado para incluir signed URLs? | El listado actual NO devuelve URL; R2 no es público. Decisión del TL (¿batch endpoint? ¿agregar campo url al listado? ¿paralelizar en el frontend?). |
| Navegación listado→detalle | Card completa como botón/link contenedor + acción "Editar" por encima | **PROHIBIDO `<Link>` anidado** (Next.js no lo soporta). Card como `<div onClick>` + `router.push('/vehicles/:id')` con `stopPropagation` en Editar, o `<Link>` contenedor + `<button onClick>` (no `<Link>`) para Editar. |
| Post-edición | F-011 redirige a `/vehicles`; propuesta: redirigir a `/vehicles/:id` post-guardado | Cambio menor en edit/page.tsx + ajuste de test. |
| Tipos frontend | Tipar photos/documents/mileages; `photos?: unknown[]` → `VehiclePhoto[]` | Sin cambios de contrato. |
| Tabs/secciones | Sin componente Tabs en `components/ui`; usar secciones verticales con Cards (patrón existente) | No agregar dependencias. |

## 10. Criterios de Aceptación

- [ ] Dado un owner con vehículo, cuando hace click en la card del listado, entonces navega a `/vehicles/:id` y ve la ficha con foto(s), documentos y kilometraje.
- [ ] Dado el detalle, cuando el owner sube una imagen válida, entonces la foto aparece en la galería (upload + refetch).
- [ ] Dado el detalle, cuando el owner sube un archivo no permitido (MIME/tamaño), entonces ve error claro y no se agrega.
- [ ] Dado el detalle, cuando el owner marca otra foto como principal, entonces la galería reordena (primary primero).
- [ ] Dado el detalle, cuando el owner elimina una foto, entonces desaparece y (si era primary) otra pasa a primary.
- [ ] Dado el detalle, cuando el owner registra un km menor al último registrado, entonces ve error de monotonicidad (400/409) con mensaje claro.
- [ ] Dado un usuario con acceso compartido, cuando abre el detalle, entonces ve ficha/fotos/documentos/km pero NO ve botones de escritura (D-048) ni "Editar" (D-039).
- [ ] Dado un usuario con acceso compartido, cuando intenta POST/PATCH/DELETE directo de fotos/documents/mileage, entonces responde 403 (D-048).
- [ ] Dado un 404 (id inexistente), entonces la UI muestra "Vehículo no encontrado".
- [ ] Regresión: listado, edición, búsqueda y alta siguen pasando sus tests.

### Build / Calidad
- [ ] Backend: `npm test` verde + `npm run build` sin errores.
- [ ] Frontend: `npm test` verde + `npm run build` sin errores (ruta `/vehicles/[id]` dinámica).
- [ ] Sin dependencias nuevas (salvo decisión explícita del TL).

## 11. Dependencias

- D-001 (cookies HttpOnly), D-020/D-021 (PERSONAL default), D-039 (solo owner edita), D-044/045 (búsqueda — sin cambio).
- Backend ya implementado: CRUD photos/documents/mileage/history, storage R2 con signed URLs, `assertVehicleAccess`/`assertVehicleOwned`.
- F-011: patrón de página dinámica + manejo de errores; `vehicleApi.getVehicle` ya existe.
- Permisos seed: `vehicle.photos.*`, `vehicle.documents.*`, `vehicle.history.*` existen pero NO se verifican en rutas hoy (ownership-scoped); NO agregar PermissionsGuard en esta iteración (decisión TL: si aplica, tamaño).

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Cambio de guards (D-048) sin cobertura de tests | **ALTA — blocker de cierre** | NO existen tests de autorización para fotos/documents/mileage (solo `record-mileage.handler.spec.ts` testea monotonicidad). Crear tests de controller para cada ruta de escritura: 403 para shared y 200 para owner. Sin esto, D-048 no tiene cobertura de regresión. |
| Signed URLs: N llamadas por foto degrada UX/performance | Media | Resuelto: batch `?signed=true` en listados (decisión TL). Riesgo residual: expiración de URLs (3600s) — el frontend maneja `expiresAt`/refetch. |
| R2 no configurado en entorno dev → fotos fallan | Media | Documentar; usar datos mock en tests; verificar que StorageModule esté activo en AppModule. |
| Documento PDF no renderiza inline (depende del visor) | Baja | Link de descarga + ícono; no requerir preview. |
| Botón/acción doble navegación (card link + botón Editar) | Baja | Estructura de link + botón con stopPropagation; test. |
| Soft-deleted en GET :id (bug preexistente) | Media (preexistente) | Se mantiene en el ticket follow-up sistémico; NO se toca en F-013. |

---

*Fin de la especificación F-013 (borrador).*