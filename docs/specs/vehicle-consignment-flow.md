# Especificación: Cadena de consignación concesionaria (MVP) — Dealership

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-18
> **Estado:** CONSOLIDADO — contrato cerrado para implementación (2026-09-18)
> **Decisiones aplicables:** D-101 (dominio intermedio), D-102 (módulo Dealership), D-103 (flexibilidad tamaño), D-104..D-108 (resoluciones PM) — DECISION-REGISTER sección 27; análisis técnico del equipo (D-TL-8..D-TL-18, D-DB-1..D-DB-2, resoluciones PM) — sección 28
> **Prioridad:** MVP (D-108) — en implementación.

---

## 1. Problema

El flujo actual transfiere vehículos persona↔persona por email o QR presencial (Fases 1 y 3). No cubre el caso real de **venta mediante concesionaria**: el vendedor entrega su auto a un tercero concesionario (agencia) que lo exhibe, lo vende y transfiere la titularidad al comprador final. Hoy una concesionaria es solo "metadata de origen" de un QR (D-085/D-086), no puede ser titular ni participar de la cadena.

## 2. Objetivo

Implementar la **cadena de consignación** de extremo a extremo:

1. **Dealership** como organización con identidad propia (patrón Workshop), flexible de "de barrio" a grande (D-102/D-103).
2. **QR de TOMA**: el vendedor genera un QR; un miembro de la concesionaria lo escanea y la concesionaria pasa a ser **propietaria intermedia** (D-101, D-104).
3. **Exhibición**: ownership intermedio = estado; sin QR vigente.
4. **QR de VENTA**: la concesionaria (titular) genera un QR presencial; el comprador lo escanea y recibe la titularidad.
5. **Devolución** (opcional): QR inverso de devolución si no se vende (D-105).
6. El historial del vehículo registra la cadena completa `Propietario → Concesionaria → Comprador` (D-107).

## 3. Actores

| Actor | Acceso |
|---|---|
| Vendedor (owner persona) | Genera QR de toma; ve su vehículo "en consignación en [Concesionaria X]" (D-107); acepta devolución. |
| Miembro de concesionaria (dueño/empleado) | Escanea QR de toma **en representación de la concesionaria**; opera el panel de la concesionaria; genera QR de venta. |
| Comprador (persona) | Escanea QR de venta, confirma identidad, acepta (flujo D-082/D-083 conservado). |
| Dealership (entidad organizacional) | Identidad organizacional (D-102): titular intermedio, miembros, roles, invitaciones, opcional sucursales. |
| super_admin | Sin cambios en esta fase. |

## 4. Principios de diseño (mandatorios)

1. **Reutilizar** el machinery existente: `VehicleOwnership`, `VehicleTransfer`, `VehicleTransferQr`, `VehicleAccess`, timeline (D-050), eventos, listeners.
2. **No romper** el flujo persona→persona existente (email y QR presencial).
3. **No introducir** patrones técnicos nuevos sin decisión TL (AGENTS.md §6).
4. **Onboarding liviano**: crear concesionaria + dueño único en 1 pantalla (D-103); estructura completa opcional.
5. **Sin campo `size`**: la complejidad emerge de los datos (1 miembro vs N miembros/sucursales).
6. **Trazabilidad total**: ownership histórico inmutable; la concesionaria es titular intermedio visible.
7. **Seguridad**: backend es la frontera de enforcement; anti-enumeración; sin PII innecesaria.

## 5. Modelo conceptual (para validación técnica)

### 5.1 Dealership (espejo de Workshop, D-102)

campos núcleo: name, legalName, taxId, email, phone, website, logoUrl, description, isActive, timestamps.
relaciones: members (DealershipMember), roles (DealershipRole), invitations (DealershipInvitation), branches opcionales (DealershipBranch), specialties opcionales.

NO reutilizar tablas `workshops`; son actores distintos.

### 5.2 Titular organizacional (extensión del modelo existente)

Hoy `VehicleOwnership.userId` es obligatorio; `VehicleTransfer.from/toUserId`; `VehicleTransferQr.createdBy/consumedByUserId`.

Se propone (acordado con Tech Lead y Database — sección 28):

- `VehicleOwnership` admite titular **persona OR concesionaria** (userId nullable + dealershipId nullable, XOR con CHECK a nivel DB; `OwnershipType.company` ya existe).
- `VehicleTransfer` admite from/to **persona OR concesionaria** (fromUserId/fromDealershipId, toUserId/toDealershipId, XOR).
- `VehicleTransferQr` registra quién consumió: `consumedByUserId` (persona) o `consumedByDealershipId` + `consumedByMemberId` (miembro que actuó en representación, patrón `recordedByMemberId` existente). **`createdByUserId` se mantiene NOT NULL** + `createdByDealershipId` nullable (siempre actúa una persona física).
- **Nuevo enum `QrPurpose { take | sale | return }`** (columna `purpose`, nullable = flujo clásico persona→persona). `QrSource` (canal) se conserva como metadata; son ejes ortogonales.
- **TTLs por purpose**: toma presencial 60min / retiro diferido 2880min (schedule `immediate | pickup`); venta 60min; devolución 60min.
- Active Context: contexto Dealership similar a Workshop (`DEALERSHIP`).
- **Preview/response del QR extiende** con `purpose` + `fromDealership` (sin PII); `GET /auth/me` expone `dealershipMemberships`.

## 6. User Journey (flujo principal)

```text
VENDEDOR (persona, owner)
  ↓ Elige "Entregar a concesionaria" → genera QR de TOMA (TTL presencial; D-104)
MIEMBRO DE CONCESIONARIA (autenticado, contexto Dealership)
  ↓ Escanea el QR de TOMA → preview → confirmación "recibo en nombre de [Dealership X]"
SISTEMA
  ↓ Cierra ownership del vendedor → crea ownership de la concesionaria (titular intermedio, tipo company)
  ↓ QR de toma consumido (one-shot) → vehículo EN EXHIBICIÓN (sin QR vigente)
CONCESIONARIA (titular)
  ↓ Vende: genera QR de VENTA (presencial 1h)
COMPRADOR (persona)
  ↓ Escanea → confirma identidad → acepta (D-082/D-083)
SISTEMA
  ↓ Cierra ownership de la concesionaria → crea ownership del comprador
  ↓ Historial: Propietario → Concesionaria → Comprador (D-107)
```

Flujos alternativos:

- **Devolución (D-105)**: la concesionaria genera QR inverso de devolución (desde su panel) → el vendedor original escanea/acepta → ownership vuelve al vendedor. (La "solicitud de devolución" por parte del vendedor se difiere a post-MVP.)
- **Exhibición larga**: sin QR vigente, el vehículo permanece en la concesionaria el tiempo necesario.
- **Cancelación/sin aceptación**: el QR de toma expira (TTL), auto-cancelación trazable (patrón D-088); la concesionaria puede volver a intentar.
- **QR de venta expirado**: regeneración (patrón Fase 3).

## 7. Reglas de negocio (preliminares, a validar)

RB-01 El vendedor genera el QR de toma solo si es owner activo y no existe QR pendiente vigente (D-079).
RB-02 Solo un miembro activo de la concesionaria puede aceptar el QR de toma, y lo hace en representación de la concesionaria.
RB-03 La concesionaria no puede transferirse el vehículo a sí misma (auto-transfer bloqueado).
RB-04 Mientras es titular intermedia, la concesionaria puede: ver historial, generar QR de venta, revocar QR, registrar CareEpisodes (D-106).
RB-05 La concesionaria no puede borrar ni modificar historial (información histórica inmutable).
RB-06 El comprador acepta el QR de venta con confirmación de identidad (D-082) y la aceptación completa la transferencia en transacción atómica (D-081/D-083).
RB-07 La devolución requiere que el vendedor original escanee/acepte el QR inverso; queda registrada (D-105).
RB-08 El timeline muestra la cadena completa con la concesionaria como titular intermedio (D-107), sin PII de empleados.
RB-09 Durante la exhibición el vendedor **solo lectura** (ve banner "en consignación en [X]" e historial); la edición de fotos/docs/km queda deshabilitada (integridad).
RB-10 Roles de Dealership (D-103, sección 28): `owner` = todo (update, members.*, vehicle.take/sell/return, care-episode.create, history.view); `seller` = vehicle.sell/return + care-episode.create + history.view; `admin` = update + members.invite + vehicle.take + care-episode.create + history.view.
RB-11 TTLs: toma presencial 60min (retiro diferido 2880min), venta 60min, devolución 60min.

## 8. Endpoints (contrato final — acordado en sección 28)

### Dealerships

- `POST /dealerships` — crear concesionaria (alta rápida: crea member dueño del user autenticado).
- `GET /dealerships/mine` — mis concesionarias.
- `GET /dealerships/:id` — detalle (admin/miembro).
- `PATCH /dealerships/:id` — editar perfil (admin).
- `POST /dealerships/:id/members` / invitaciones y roles — espejo del patrón workshops.
- `GET /dealerships/:id/vehicles` — vehículos en exhibición (panel de la concesionaria).

### Consignación (flujo QR)

- `POST /vehicles/:id/consignment/take-qr` — vendedor genera QR de toma (`purpose: take`; TTL por RB-11; schedule `immediate | pickup`).
- `POST /vehicles/transfer/qr/:token/accept` — aceptación con contexto Dealership (miembro en representación) para la toma; reutilización del accept existente para venta/devolución (owner de origen dinámico persona|dealership).
- `POST /vehicles/:id/qr` — la concesionaria (titular) genera QR de venta (`purpose: sale`).
- `POST /vehicles/:id/consignment/return-qr` — QR inverso de devolución (`purpose: return`).
- Preview/accept del QR reutilizan los endpoints Fase 3 existentes; **response del preview extiende** con `purpose` + `fromDealership` (sin PII).

### Auth / contexto

- `GET /auth/me` — expone `dealershipMemberships: { dealershipId, dealershipName, logoUrl?, role }[]` (bootstrap del contexto activo DEALERSHIP).

### Permisos (seed)

- `dealership.create`, `dealership.update`, `dealership.members.invite`, `dealership.members.role.update`, `dealership.members.remove`, `dealership.vehicle.take`, `dealership.vehicle.sell`, `dealership.vehicle.return`; reutilizar `care-episode.create` y `history.view`. Roles seed: `owner`, `admin`, `seller` (RB-10).

## 9. Frontend (alcance — acordado con Frontend Tech Lead + UX/UI)

- Rutas técnicas `/dealerships`, etiqueta UI "Concesionarias".
- Alta rápida de concesionaria (1 pantalla: datos del negocio + "yo soy el dueño"; CUIT opcional, editable después).
- Panel de la concesionaria: vehículos en exhibición (`GET /dealerships/:id/vehicles`), generar QR de venta/devolución, miembros; selector de contexto espejo de WorkshopSelector.
- Vista del vendedor: banner "en consignación en [Concesionaria X]", historial con la cadena; edición deshabilitada durante exhibición (RB-09).
- Diálogo de transferencia: nueva opción "Entregar a concesionaria".
- Aceptación de QR (toma/venta/devolución) reutilizando pantallas Fase 3, ramificada por `purpose` en el preview.
- Invitación de miembros: reutilizar patrón workshops (email + token); el invitado se registra/loguea al aceptar (D-034).

## 10. Criterios de aceptación (alto nivel; desglosar con QA)

Dado un vendedor owner, cuando genera un QR de toma y un miembro de la concesionaria lo escanea y acepta en representación, entonces:
- la concesionaria queda como titular intermedio del vehículo (ownership activo, type company),
- el QR se consume (one-shot),
- el vehículo aparece "en consignación" en el panel de la concesionaria y en el historial del vendedor (D-107),
- el historial registra la transición.

Dado una concesionaria titular intermedio, cuando genera un QR de venta y un comprador lo escanea y acepta, entonces:
- el comprador queda como owner activo,
- el historial muestra la cadena `Propietario → Concesionaria → Comprador`.

Dado una concesionaria titular intermedio, cuando no vende y genera el QR inverso de devolución y el vendedor original lo acepta, entonces:
- el vendedor original recupera la titularidad,
- la devolución queda registrada en el historial.

Dado un usuario sin membresía en la concesionaria, cuando intenta aceptar un QR de toma, entonces: error 403 (no autorizado) — el backend lo rechaza.

## 11. Restricciones y dependencias

- Base: flujo QR Fase 3 existente (D-079..D-090, D-095, D-096+).
- No microservicios; monolith modular NestJS; Prisma/PostgreSQL; EventEmitter2 (AGENTS.md §6-9).
- Database: decisión de esquema (`userId` nullable + `dealershipId` XOR) requiere validación de integridad y del índice único parcial D-079.
- Permisos y seed: agregar permissions nuevos actualizando seed (AGENTS.md §16, §21).
- Tests: reglas de negocio, autorización, edge cases (AGENTS.md §25).

## 12. Decisiones pendientes (resueltas en sección 28 salvo lo indicado)

1. ~~Contrato exacto de endpoints~~ ✅ resuelto (§8).
2. ~~Esquema XOR~~ ✅ resuelto (D-DB-1: CHECKs a nivel DB vía migración manual; índice D-079 intacto; 3 migraciones aditivas M1/M2/M3).
3. ~~Modelo de permisos y roles~~ ✅ resuelto (RB-10; seed owner/admin/seller).
4. ~~Active Context Dealership~~ ✅ resuelto (D-TL-12).
5. ~~TTL del QR de toma~~ ✅ resuelto (RB-11).
6. **PENDIENTE revisión Security**: autorización CareEpisodes en contexto DEALERSHIP (D-TL-18/D-106) y revisión del set de permisos §8. No bloquea el núcleo de consignación.
7. **PENDIENTE**: decisión de momento de negocio para emitir `CareEpisode` de toma/entrega (ver incertidumbre del diseño) — no bloquea el flujo núcleo.

## 13. Plan de trabajo en equipo (paralelo, sin colisiones)

| Fase | Agente | Entregable | Depende de |
|---|---|---|---|
| 1a | Database | Esquema Prisma (dealerships + titular organizacional + QrPurpose) + migraciones M1/M2 + seed permisos/roles | — |
| 1b | Frontend Tech Lead | Rutas, componentes, tipos API (contrato §8/§9) | Contrato cerrado |
| 2 | Backend Engineer | Módulo `dealerships` + comandos/flujo QR + guards + contexto DEALERSHIP + `/auth/me` | Fase 1a (modelos Prisma nuevos) |
| 3 | Backend Tech Lead | Revisión técnica, integración, coordinación con Database | Fases 1-2 |
| 4 | UX/UI | Verificación de los componentes implementados vs. su diseño | Fase 1b |
| 5 | QA | Casos de aceptación §10, edge cases, regresiones | Fases 2-4 |
| 6 | Security | Revisión D-TL-18/D-106 + set de permisos | Paralelo desde Fase 1 |