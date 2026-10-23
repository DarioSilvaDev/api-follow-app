# Especificación: Concesionaria con Service Center propio (alta conjunta) — Dealership + Workshop

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-10-07
> **Estado:** LISTO PARA DISEÑO TÉCNICO — Decisiones de producto cerradas con founder (2026-10-07). Pendiente análisis del Tech Lead y revisión Security del AC-10.
> **Decisiones aplicables:** D-102 (Dealership y Workshop son actores distintos), D-103 (flexibilidad de tamaño), D-106 (wizard de onboarding admin→claim), D-109/D-113 (entrega de email).
> **Prioridad:** MVP.
> **Relación con pendiente conocido:** `prisma/seed.ts` — *"NO hay FK Workshop→Dealership — DECISIÓN DE ARQUITECTURA PENDIENTE"*. Esta especificación resuelve la decisión de **producto**; el mecanismo de persistencia queda a criterio del Tech Lead (sección 15).

---

## 1. Problema

Una concesionaria real (ej: Giorgi, representante oficial Ford) tiene su propio taller de postventa, con razón social y CUIT propios, donde se realizan los services que sostienen la garantía del vehículo. Hoy el sistema:

- trata a `Dealership` y `Workshop` como actores aislados sin relación (`seed.ts:1864`);
- obliga al dueño a pasar por **dos** wizards de onboarding distintos y recibir **dos** invitaciones para registrar su concesionaria y su taller.

Eso es fricción en el onboarding y un vacío de modelo para un caso de mercado muy común.

## 2. Objetivo

Que el superadmin pueda dar de alta una concesionaria **con su service center propio** en **un solo acto**, y que el dueño complete el alta de ambos en **un solo wizard / un solo claim**, quedando el taller registrado, vinculado y operativo para registrar `CareEpisode`s.

Alcance mínimo e intencional: el producto solo necesita que un vehículo pueda registrar sus servicios en un taller registrado y verificado. No se modela la realidad comercial de las redes de concesionarias (competencia entre sucursales, contratos de garantía, enganche de clientes).

## 3. Actores

| Actor | Acceso |
|---|---|
| Superadmin | Permiso existente `admin.dealerships.create`. Marca "tiene taller de servicio propio" en el alta inicial. |
| Dueño (persona invitada) | Completa el wizard público con el token; queda con **dos membresías** owner (`DealershipMember` + `WorkshopMember`). |
| Personal del taller | Roles estándar de workshop (`owner` / `mechanic` / `employee` → label "Recepcionista"). |
| Concesionaria (entidad) | Sin permisos de servicio nuevos. Solo vínculo declarativo con su taller. |

## 4. Decisiones de producto cerradas (2026-10-07)

| # | Decisión | Detalle |
|---|---|---|
| D1 | **Cardinalidad 1:1** | Una concesionaria tiene a lo sumo **un** service center propio. Un taller vinculado se vincula a lo sumo a una concesionaria. Un taller independiente tiene link `null`. |
| D2 | **Vínculo declarativo, sin jerarquía** | Variante A. No hay herencia de permisos, membresías, plan ni baja. Borrar una entidad no afecta a la otra; solo desaparece el link. Los `CareEpisode`s del taller quedan intactos. |
| D3 | **Sin administración cruzada** | El dealership **no** administra al personal del taller. Taller con taller, concesionaria con concesionaria. El taller es el actor importante. |
| D4 | **La concesionaria no paga** | Los talleres pagan (cuando exista el track de suscripciones). La concesionaria queda fuera del dominio de planes. Ver decisión de pricing pendiente (sección 16). |
| D5 | **Sin `brandId`** | "Oficial Ford" sigue en `legalName`. La marca no se modela como dato. |
| D6 | **Mismo dueño para ambas** | El owner de la concesionaria y del taller es la misma persona/email. Un claim, dos membresías. Dueños distintos = post-MVP. |
| D7 | **"Tiene taller propio" se deriva** | `hasOwnWorkshop` = `EXISTS(workshop.dealershipId)`. **Nunca** se persiste un booleano desnormalizado. El checkbox del formulario es una instrucción de creación, no un dato. |
| D8 | **Rol `employee` → "Recepcionista"** | Se reutiliza el rol existente; se ajusta la matriz de permisos (`appointment.update`, `appointment.cancel`) — requiere revisión Security (AC-10). |

## 5. User Journey (flujo principal)

```text
Superadmin
  ↓ Contexto PLATFORM
  ↓ Abre "Nueva concesionaria" y marca "Esta concesionaria tiene su propio taller de servicio"
  ↓
Sistema
  ↓ Crea Dealership + Workshop en pending_claim
  ↓ Crea UNA invitación (token compartido, expira en 7 días)
  ↓ Emite dealership.member.invited → envía UN correo que menciona concesionaria y taller
  ↓
Dueño
  ↓ Abre el wizard desde el mail (link público, ?kind=dealership)
  ↓ Paso 1: datos del usuario (según estado de cuenta) + datos de la concesionaria
  ↓ Paso 2: datos del taller (nombre, CUIT opcional, contacto)   ← nuevo
  ↓ Claim único y atómico
  ↓
Sistema
  ↓ Activa ambas entidades (active + claimedAt)
  ↓ Crea ambas membresías owner
  ↓ Emite dealership.claimed + workshop.claimed (+ auth.user.registered si corresponde)
  ↓ Envía UNA confirmación combinada
  ↓
Resultado: el usuario aparece con dos contextos activos (DEALERSHIP y WORKSHOP)
```

## 6. Flujo principal (contratos reales)

1. `POST /admin/dealerships` — `CreateDealershipDto` **+ campo nuevo** `hasOwnWorkshop?: boolean` (default `false`).
2. `CreateDealershipHandler` (transacción):
   - crea la `Dealership` en `pending_claim` con roles `owner/admin/seller` (sin cambios);
   - **si `hasOwnWorkshop=true`**: crea el `Workshop` en `pending_claim` con roles estándar de taller (`owner/mechanic/employee`), nombre inicial `"{name} Service"`, **sin CUIT aún**;
   - crea la invitación del dueño con rol `owner` (expira en 7 días). El taller usa el **mismo token** (una sola invitación lógica);
   - emite `dealership.member.invited` con la variante de template que menciona **ambas** entidades.
3. El dueño recibe **un** mail: "Completá el alta de {Concesionaria} y su taller".
4. `GET /dealerships/wizard/validation?token` → además de la concesionaria, devuelve el taller vinculado (para que el wizard renderice **2 pasos**).
5. `POST /dealerships/wizard/claim` — `WizardClaimDto` **+ campo nuevo** `workshop?: WizardWorkshopDataDto` (`name`, `taxId?`, `email?`, `phone?`, `website?`, `description?`). En la misma transacción existente:
   - valida token/invitación (misma matriz de errores D-106);
   - resuelve el estado de la cuenta (inexistente / pending / active — lógica actual intacta);
   - acepta ambas invitaciones (`updateMany` con `status: pending`; rollback si `count === 0`);
   - aplica datos del taller (dedupe de nombre/CUIT → `409` si choca);
   - activa ambas entidades (`active` + `claimedAt`);
   - crea **ambas** membresías owner (`DealershipMember` + `WorkshopMember`);
   - post-commit: `permissionCache.invalidateUser`, emite `dealership.member.joined`, `dealership.claimed`, `workshop.member.joined`, `workshop.claimed` (+ `auth.user.registered` si es cuenta nueva).

## 7. Flujos alternativos / errores

| Caso | Comportamiento |
|---|---|
| Concesionaria **sin** taller propio | Comportamiento actual, intacto |
| `hasOwnWorkshop=true` y el dueño no completa el paso 2 | Ambas siguen `pending_claim`; **nunca** queda un "taller fantasma activo" |
| Cuenta inexistente / pending / active | Matriz D-106 actual, extendida al claim conjunto |
| Email de cuenta soft-deleted | `409` "contactá a soporte" (D-S3, intacto) |
| Nombre o CUIT del taller que colisiona en el claim | `409 CONFLICT` (dedupe en el claim, no al alta admin) |
| Doble claim (token reutilizado) | `409` + **rollback total** de ambas entidades |
| Fallo parcial en la transacción | Rollback: o se activan ambas, o ninguna |

## 8. Reglas de negocio

- **RG-1 — Cardinalidad 1:1.** Una `Dealership` tiene a lo sumo un taller vinculado; un taller vinculado pertenece a lo sumo a una concesionaria. (Un taller independiente tiene link `null`.)
- **RG-2 — El link es declarativo, no jerárquico.** No hay herencia de permisos, membresías, plan ni baja. Borrar una entidad no afecta a la otra; solo desaparece el link. Los `CareEpisode`s del taller quedan intactos.
- **RG-3 — Mismo dueño.** El owner de la concesionaria y el del taller es la **misma persona/email** (un claim, dos membresías). Dueños distintos = post-MVP.
- **RG-4 — El dealership no gana permisos de servicio.** `care-episode.create` sigue siendo exclusivo del contexto `WORKSHOP`. La "verificación" del taller viene del alta admin + claim, sin procesos documentales nuevos.
- **RG-5 — Atomicidad.** El claim conjunto es todo-o-nada.
- **RG-6 — "Tiene taller propio" se deriva, no se persiste.** `hasOwnWorkshop` es `EXISTS(workshop.dealershipId)`. **Nunca** guardar un booleano desnormalizado.
- **RG-7 — El booleano del formulario es una instrucción de creación**, no un dato de la concesionaria.
- **RG-8 — Roles del taller.** El service center usa los roles estándar: `owner` (cubre al dueño-solo), `mechanic`, `employee` (label "Recepcionista" + ajuste de permisos `appointment.update/cancel` — revisión Security).

## 9. Permisos / autorización

- El superadmin usa el permiso existente `admin.dealerships.create`; el checkbox forma parte del payload del alta (no se crea un permiso nuevo).
- El rol `owner` del taller ya incluye los permisos de servicio (`care-episode.create`, `workorder.*`, `appointment.*`, `history.view/share`) → el service center opera sin cambios de matriz.
- El contexto `DEALERSHIP` **no** gana permisos de servicio (RG-4).
- **Security:** revisión del ajuste del rol `employee` → "Recepcionista" (`appointment.update`, `appointment.cancel`). Bloqueante del AC-10, no del resto de la feature.

## 10. Criterios de aceptación

- **AC-1:** Dado un superadmin en "Nueva concesionaria", cuando marca "Esta concesionaria tiene su propio taller de servicio", Entonces el sistema crea `Dealership` y `Workshop` en `pending_claim` y **una** invitación con token compartido.
- **AC-2:** Dado el mismo flujo sin marcar el checkbox, Entonces el comportamiento es idéntico al actual (sin taller).
- **AC-3:** Dado un token de invitación conjunta, cuando el dueño abre el wizard de validación, Entonces la respuesta incluye la concesionaria **y** el taller, y el wizard muestra dos pasos.
- **AC-4:** Dado un claim conjunto exitoso (cuenta nueva), Entonces se crean la cuenta, ambas membresías `owner`, ambas entidades `active` con `claimedAt`, y se emiten `dealership.claimed` y `workshop.claimed` post-commit.
- **AC-5:** Dado un intento de doble claim, Entonces `409` y **ningún** cambio parcial en la base.
- **AC-6:** Dado un taller cuyo nombre o CUIT del paso 2 colisiona con uno existente, Entonces `409 CONFLICT` y no se activa nada.
- **AC-7:** Dado un `Workshop` vinculado, cuando se consulta el detalle de la concesionaria (`GET /admin/dealerships/:id`), Entonces la respuesta expone `hasOwnWorkshop` **derivado** y el taller asociado.
- **AC-8:** Dado un miembro con contexto `DEALERSHIP`, cuando intenta crear un `CareEpisode`, Entonces el permiso le es denegado (sin cambios respecto de hoy).
- **AC-9:** Dado el seed, Entonces los 3 service centers (`giorgi-svc`, `fortecar-svc`, `castro-svc`) quedan vinculados a sus concesionarias y los 20 talleres independientes siguen sin link.
- **AC-10:** Dado el rol `employee`, cuando se revisa su matriz, Entonces tiene `appointment.update`/`appointment.cancel` y su label de UI es "Recepcionista" (con revisión Security).

## 11. Contratos impactados

| Contrato | Cambio |
|---|---|
| `POST /admin/dealerships` | `CreateDealershipDto` + `hasOwnWorkshop?: boolean` (default `false`). Respuesta incluye `workshop?: { id, name }` cuando `true`. |
| `GET /admin/dealerships/:id` | Expone `hasOwnWorkshop` (derivado) + `workshop?: { id, name }`. |
| `GET /dealerships/wizard/validation` | Respuesta incluye `workshop?: { id, name }` cuando el token es conjunto. |
| `POST /dealerships/wizard/claim` | `WizardClaimDto` + `workshop?: WizardWorkshopDataDto`. |
| `workshops` (schema) | Relación `dealershipId?` nullable con unicidad (mecanismo a definir por Tech Lead, sección 15). |
| Mail de invitación | Variante combinada (copia anexa). Link conserva `?kind=dealership`. |
| Mail de confirmación | Variante combinada (copia anexa). |
| Eventos | Se **reutilizan** los existentes: `dealership.member.invited`, `dealership.member.joined`, `dealership.claimed`, `workshop.member.joined`, `workshop.claimed`, `auth.user.registered`. No se crean eventos nuevos. |
| Seed | Vincular `giorgi-svc`, `fortecar-svc`, `castro-svc` a sus concesionarias (AC-9). |

## 12. Fuera de alcance (explícito)

- Modelar marca como dato (`brandId`) — rechazado por founder (D5).
- Dueños distintos para concesionaria y taller (post-MVP).
- Que el dealership administre al personal del taller.
- Verificación documental de talleres.
- Suscripciones/planes (track separado, al final).
- Multi-service-center por concesionaria.
- Alternar el vínculo sobre una concesionaria existente (link/unlink post-alta) — post-MVP; requiere `admin.dealerships.update` + operación nueva.

## 13. Copy UX (anexo cerrado 2026-10-07)

Convenciones: voseo argentino, producto "Autentia", sin jerga técnica (`CareEpisode`, `Workshop`, `Dealership`, "contexto" no aparecen en UI), "taller de servicio" como término único.

### A. Formulario del superadmin — "Nueva concesionaria"

| Elemento | Copy |
|---|---|
| Sección (nueva) | **Taller de servicio** |
| Checkbox | ☐ **Esta concesionaria tiene su propio taller de servicio** |
| Ayuda (helper) | "Si la marcás, el dueño va a completar también los datos del taller en el mismo alta. El taller queda vinculado pero se administra por separado." |
| CTA principal | **Crear concesionaria** |
| Feedback éxito (con taller) | "Concesionaria creada. Enviamos una invitación al dueño para completar el alta de la concesionaria y su taller." |
| Feedback éxito (sin taller) | Comportamiento actual, sin cambios |

### B. Email de invitación (variante combinada)

| Elemento | Copy |
|---|---|
| Asunto | `Completá el alta de ${dealershipName} y su taller - Autentia` |
| Título (h2) | `Completá el alta de ${dealershipName}` |
| Párrafo 1 | `Te invitamos a completar el alta de la concesionaria <strong>${dealershipName}</strong> y de su taller de servicio <strong>${workshopName}</strong> en Autentia.` |
| Párrafo 2 (opcional) | `Al completarla, vas a poder administrar tus vehículos desde la concesionaria y registrar los services desde tu taller.` |
| CTA | **Completar el alta** |

### C. Wizard del dueño (2 pasos)

**Paso 1 — Concesionaria** (progreso: `Paso 1 de 2 · Concesionaria`)

| Elemento | Copy |
|---|---|
| Título | **Completá los datos de tu concesionaria** |
| Subtítulo | "Contanos cómo llegar a vos. Esta información la van a ver tus clientes." |
| Campos | Email · Teléfono · Sitio web · Descripción *(labels actuales, sin cambios)* |
| CTA | **Continuar** |

**Paso 2 — Taller** (progreso: `Paso 2 de 2 · Taller`)

| Elemento | Copy |
|---|---|
| Título | **Completá los datos de tu taller** |
| Subtítulo | "Así se va a ver tu taller cuando registres los services en el historial de los vehículos." |
| Campos | **Nombre del taller** (pre-cargado `{Concesionaria} Service`, editable, requerido) · **CUIT** (opcional) · **Email** (opcional) · **Teléfono** (opcional) · **Sitio web** (opcional) · **Descripción** (opcional) |
| Nota informativa | "Tu taller queda vinculado a tu concesionaria, pero se administra por separado: vas a poder sumarle mecánicos y registrar servicios." |
| CTA | **Completar el alta** |

**Pantalla de éxito**

| Elemento | Copy |
|---|---|
| Título | **¡Listo! Tu concesionaria y tu taller quedaron activos** |
| Párrafo | "Ya podés administrar tu concesionaria desde el panel y registrar los services de tus clientes desde tu taller." |
| CTA | **Empezar** |

### D. Email de confirmación (variante combinada)

| Elemento | Copy |
|---|---|
| Asunto | `${dealershipName} y su taller quedaron activos - Autentia` |
| Título (h2) | **¡Tu concesionaria y tu taller quedaron activos!** |
| Párrafo 1 | "Ya podés administrar ${dealershipName} desde el panel de la concesionaria." |
| Párrafo 2 | "Desde tu taller, vos y tus mecánicos pueden registrar los services para que queden en el historial de cada vehículo." |
| CTA (x2) | **Ir a mi concesionaria** · **Ir a mi taller** |

### E. Microcopy / errores

| Caso | Mensaje |
|---|---|
| CUIT del taller ya registrado | "Ya existe un taller con este CUIT." |
| Nombre del taller duplicado | "Ya existe un taller con este nombre." |
| Nombre del taller vacío (paso 2) | "Ingresá el nombre del taller." |
| Doble claim (token reutilizado) | Mensaje existente de invitación usada, sin cambios |
| Label del rol `employee` | **Recepcionista** (cambio de label + ajuste de permisos, AC-10) |

## 14. Dependencias técnicas (para análisis del Tech Lead)

- Dónde vive la creación conjunta (módulo `administration` tocando ambos dominios vs. servicio compartido).
- Mecanismo del token compartido (misma fila de invitación vs. dos filas con mismo token) respetando el `unique` de token por tabla.
- Mecanismo del vínculo `Workshop ↔ Dealership` 1:1 (FK nullable con unique vs. tabla de vínculo). Constraint de producto: unicidad en ambos sentidos (RG-1).
- Template de correo combinado (variante nueva de los templates existentes; conserva `?kind=dealership`).
- Revisión Security del ajuste del rol `employee` (AC-10).
- Actualización de seed (AC-9) manteniendo intactos los 20 talleres independientes.

## 15. Riesgos

- **Principal:** el claim conjunto es la operación más delicada (doble-claim y atomicidad sobre 2 entidades). Mitigado por el patrón `updateMany` + transacción ya existente.
- **Permisos:** invalidación de caché debe cubrir la nueva membresía workshop.
- **Rate limit** del claim (5 req/300s por IP) se mantiene intacto.
- El vínculo declarativo (D2) implica que un taller vinculado puede "quedar huérfano de link" si la concesionaria se borra — comportamiento aceptado y coherente con que el taller es un actor independiente.

## 16. Pendientes de negocio (track separado)

- **Suscripciones / pricing:** definición de quién paga y por qué (track al final, fuera de esta feature). Estado actual verificado: `Plan` y `Subscription` existentes en schema (solo-workshop) **sin** registros seed, **sin** código de aplicación, **sin** pasarela de pago. `maxMembers/maxBranches/maxVehicles` sin enforcement. La concesionaria no paga (D4); los talleres pagan (pendiente de definir cómo).
- **Debe revalidarse** la decisión D4 cuando se abra el track, porque habilita una posible opción comercial "un plan que cubre el grupo" que hoy queda descartada por el modelo.

## 17. Definition of Ready — checklist

- [x] Problema claro
- [x] Objetivo claro
- [x] Actor identificado
- [x] Flujo principal definido
- [x] Casos alternativos relevantes definidos
- [x] Reglas de negocio claras (RG-1..RG-8)
- [x] Criterios de aceptación observables (AC-1..AC-10)
- [x] Decisiones pendientes identificadas (sección 16)
- [x] Alcance delimitado (sección 12)
- [ ] Revisión Security AC-10 (paralela, no bloqueante del resto)