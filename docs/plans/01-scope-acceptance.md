# Plan 01 — Alcance y aceptación del piloto (check-in de taller + reclamo de vehículo)

> **Autor:** PM — HCDV · **Fecha:** 2026-11-01
> **Basado en:** `docs/designs/vehicle-claim-technical-design.md` (AC-1..AC-28, §10, §11 PR-1..PR-8), `docs/specs/workshop-checkin-flow.md` (AC 1..36, §11.2 fases A-G, §12), `DECISION-REGISTER.md` §42 (D-158..D-192) y `AGENTS.md`.
> **Naturaleza:** documento de alcance y aceptación. **No** redefine contratos ni modelos: si algo no está en el diseño o el spec, acá se marca como hallazgo, no se inventa.
> **Regla de lectura:** los IDs de AC son los de cada documento fuente y **no** se renumeran. `PR-x` = PR del diseño de reclamos; `Fase X` = fase del spec de check-in.

---

## A. Mapa de aceptación AC → PR / fase

### A.1 Módulo de reclamos (AC-1..AC-28)

| ID | Qué verifica | PR | ¿Bloquea el piloto? | Cómo se verifica |
|---|---|---|---|---|
| AC-1 | Alta de invite: `link`+`whatsappUrl` one-time, `qrImageUrl`, `expiresAt=+7d`, solo `tokenHash` en BD | PR-3 (+PR-1) | sí | Test de handler/integración + query a BD |
| AC-2 | Alta repetida con invite activo → mismo invite, 200, **sin** `link` | PR-3 | no | Test de idempotencia |
| AC-3 | GET pre-verificación devuelve **solo** `status`+`canVerify` | PR-2 | sí | **Test de contrato** (D-178 #3) |
| AC-4 | Precedencia de factores: VIN excluye odómetro; challenge 4-6 rangos; `no_lo_se`→manual | PR-2 | sí | Test parametrizado (matriz de factores) |
| AC-5 | `commit` crea ownership con `acquiredByClaimInviteId`; `verify` no setea `usedAt` | PR-2 (+PR-1) | sí | Test de integración (transacción) |
| AC-6 | QR re-mostrable tras refresh; el detalle **no** contiene token ni link | PR-3 (backend) + PR-6 (UI) | sí | Test de respuesta + manual en panel |
| AC-7 | `vehicle-claim.claimed` post-commit → mail taller + mail reclamante | PR-4 | no | Test de listener (mail/skip) |
| AC-8 | Link vencido: GET `expired` sin datos, `verify/commit` no disponible, escritura lazy | PR-2 (+PR-3 listado) | sí | Test de expiración lazy |
| AC-9 | Invite `claimed`: GET/verify/commit "no disponible", `usedAt` intacto | PR-2 | sí | Test single-use (409/410) |
| AC-10 | Revoke: `status: revoked` + `revokedByUserId/revokedAt` + evento | PR-3 | sí | Test de comando |
| AC-11 | Sesión ≠ titular → `claim_blocked`, intento logueado, 2 mails, **cero** escritura en ownerships | PR-2 (+PR-4) | sí | Test de commit bloqueado |
| AC-12 | Sesión == titular → `already_owner`, sin segunda fila (D-155 intacto) | PR-2 | sí | Test de commit |
| AC-13 | 4 fallos distintos → **bytes idénticos** de 400; cada uno suma intento | PR-2 | sí | Test anti-enumeración |
| AC-14 | Escalera 5 fallos→lock 30 min→3 lockouts→auto-revoke + throttles por token | PR-2 | no (endurecimiento) | Test de escalera + test de 429 |
| AC-15 | Sin dato verificable → `manual_review`; approve/reject; approve sin cuenta → 409 | PR-2 + PR-3 | sí | Test de máquina `manual_review` |
| AC-16 | Hard-delete→404; soft-delete→`revoked(vehicle_deleted)` + aviso | PR-2 (+PR-4) | no | Test soft/hard delete |
| AC-17 | Revoke de `claimed` → `endsAt` seteado, vehículo "sin titular", mail | PR-3 | sí | Test de revoke con ownership |
| AC-18 | `" abc123 "` y `abc123` matchean `ABC123` | PR-2 (+PR-3 create) | sí | Test de normalización |
| AC-19 | `phone` nunca es credencial; no hay rutas OTP | — (**sin PR asignado**) | no | Revisión de contrato / grep de rutas |
| AC-20 | Scoping: taller B → 404; contexto PERSONAL → 403 WorkshopOnly | PR-3 | sí | Test de guard order (reflection) + scoping |
| AC-21 | Build+test verdes, migración aplicada, seed idempotente con 4 permisos | PR-1..PR-3 | sí | CI + `db:migrate` + doble `db:seed` |
| AC-22 | Solo el primer cierre genera; reactiva si expiró; nada si revocado/reclamado/titular | PR-7 (requiere Fase C) | sí | Test de listener (2 eventos → 1 invite) |
| AC-23 | Sin canal: invite igual con `ownerPhone:null`, sin `whatsappUrl`, sin mail con link | PR-7 (+PR-3, PR-6) | sí | Test de listener + manual panel |
| AC-24 | Titular activo → no genera + `skipReason` + 409 `active_owner` con copy | PR-7 + PR-3 + PR-6 | sí | Test de skip + test de 409 |
| AC-25 | Con dato verificable, solo la patente **nunca** llega a `verified` | PR-2 | sí | Test (solo patente → 400/manual) |
| AC-26 | `verify`→ticket sin `usedAt`; commit sin sesión→401; ticket vencido→`verification_required` sin sumar intentos; ticket de otro invite→401 | PR-2 (+PR-6) | sí | Test de ticket (4 casos) |
| AC-27 | Aviso pasivo: mail + ítem de panel, **sin** paso de confirmación | PR-4 + PR-6 | no | Test de listener + manual |
| AC-28 | Disputa del dueño real (202, solo sobre `claimed`, resolución HCDV) | **PR-8 — fuera del piloto** | no | Test post-piloto |

### A.2 Check-in del taller (AC 1..36)

| ID | Qué verifica | Fase | ¿Bloquea el piloto? | Cómo se verifica |
|---|---|---|---|---|
| 1 | Placa inexistente → `Vehicle`+`CareEpisode(open)` en **una** transacción, sin celular | B | sí | **Test de atomicidad** (D-178 #2) |
| 2 | Placa existente → episodio nuevo, sin 409, sin tocar la ficha | B | sí | Test de integración |
| 3 | `checkedInAt`, `workshopId/branchId/createdByMemberId`, `source=workshop` | B | sí | Test |
| 4 | `mileageIn` persistido, `mileageInUnreadable=false` | B | sí | Test |
| 5 | "Otra marca" → `brandName` + fallback `version → brandName` en lookup | B | sí | Test + manual UI |
| 6 | Celular área+número → contacto `available` con `phoneE164` canónico + display | B (+A) | sí | Test (E.164 con país de config) |
| 7 | Cierre: `delivered`, `closedAt`, `mileageOut`, tipos | C | sí | Test de cierre |
| 8 | `care-episode.closed` post-commit; consumidor genera o registra fallo; episodio no depende | C (emisión) + F/PR-7 (consumo) | sí | Test de evento post-commit |
| 9 | Badge "Entregado" en `/atenciones` y timeline, sin regresión de orden ni PII | C | sí | Manual + e2e de listado/timeline |
| 10 | Taller con relación ve todos los episodios del vehículo (lectura) | D | no (arranca en paralelo) | Manual + e2e |
| 11 | Contexto PERSONAL → 403 antes del bypass de super_admin | B + C | sí | Test de guard order |
| 12 | Rol `employee` → 403 PERMISSION_DENIED | B + C | sí | Test de permisos |
| 13 | Taller A cerrando episodio de B → 403/404, sin escritura | C | sí | Test de scoping |
| 14 | Sin `care-episode.close` → 403 | C (+A seed) | sí | Test de permisos |
| 15 | VIN de otro vehículo → 409 específico, formulario conservado | B | sí | Test |
| 16 | VIN distinto al registrado → 409 | B | sí | Test |
| 17 | Sin celular (con o sin excepción) → `unavailable`, flujo no se bloquea | B | sí | Test |
| 18 | Sin odómetro ni excepción → 400, no crea nada | B | sí | Test |
| 19 | Odómetro ilegible sin motivo/foto → 400; con ambos → flag activo | B (+C egreso) | sí | Test |
| 20 | Odómetro regresivo → aviso + confirmación o "tablero reemplazado" (nunca bloquea) | B (**y C, no asignado en §11.2**) | sí | Test de aviso + persistencia |
| 21 | Cierre sin tipos → 400 | C | sí | Test |
| 22 | 4º tipo → 400 | B/C | sí | Test |
| 23 | "Otro" sin texto → 400; con texto → `customLabel` sin `serviceTypeId` (XOR) | B/C | sí | Test + CHECK en BD |
| 24 | Cierre sobre `delivered` → 409 sin tocar `closedAt` | C | sí | Test |
| 25 | Taller B: resumen + adjuntos + `customerComplaint`/`customerNotes`; sin `internalNotes` ni PII | D | no (cond.) | Test de `select` explícito |
| 26 | Taller B ve historial ajeno y no puede editarlo ni cerrarlo | D | no (cond.) | Test de scoping |
| 27 | Dos check-ins concurrentes → uno crea, otro reutiliza, sin 500 | B | sí | Test de carrera (P2002) |
| 28 | Taller sin especialidades → catálogo completo + aviso | E (+fallback en B) | no | Manual |
| 29 | Lookup con 5xx → Reintentar, **nunca** ofrecer "crear" | B (UI) | sí | Manual / test de componente |
| 30 | Wizard con ≥1 especialidad → `workshop_specialties` en la misma transacción | E | no | Test de wizard |
| 31 | Wizard sin especialidades → 400 | E | no | Test |
| 32 | Build backend verde + `db:generate` consistente con la migración | A..E | sí | CI |
| 33 | Suites en verde + 3 tests críticos (guards, atomicidad, contrato pre-verificación) | A+B+C+D **+ PR-2 de reclamos** | sí | CI (ver hallazgo H-3) |
| 34 | Seed: `care-episode.close` + 14 `service_types` + 2 filas multi-especialidad | A | sí | Doble `db:seed` |
| 35 | Ninguna respuesta expone `internalNotes` ajenas ni PII; sí `customerComplaint`/`customerNotes` | D | no (cond.) | Test de contrato de proyección |
| 36 | Segundo cierre no genera invite nuevo | F/PR-7 | sí | Test de listener |

### A.3 Hallazgos de cobertura (no maquillados)

| # | Hallazgo | Evidencia |
|---|---|---|
| H-1 | **AC-28 (disputa) no tiene cobertura en el piloto**: solo lo implementa PR-8, declarado "fase posterior, no bloquea el piloto". El modelo entra en PR-1 como tabla muerta. | `vehicle-claim-technical-design.md:620,693,695` |
| H-2 | **AC-19 (celular no es auth) no está asignado a ningún PR.** Se sostiene por ausencia de código, no por un test. Es un control de seguridad sin verificación automatizada ni manual definida. | `vehicle-claim-technical-design.md:611` vs §11 (686-693) |
| H-3 | **AC 33(c) (test de contrato del GET pre-verificación) pertenece a PR-2 de reclamos, no a ninguna fase del check-in.** Las fases A-F no pueden cerrar AC 33 solas: hay dependencia cruzada entre los dos workstreams. | `workshop-checkin-flow.md:494` |
| H-4 | **El mapeo de fases del propio spec omite AC 11-14, 32 y 33.** §11.2 asigna AC 1-7, 15-23, 27-29 (B); 8, 9, 21, 24 (C); 10, 25, 26, 35 (D); 28, 30, 31 (E); 8, 36, 16 (F). Las AC de permisos y las de calidad quedan sin fase explícita (las asigné por inferencia en A.2). | `workshop-checkin-flow.md:518-526` |
| H-5 | **La Fase F cita "AC 16" pero el ítem 16 es VIN incompatible.** Lo que se quiso citar es **CV-16** (consumidor caído). Error de referencia del documento. | `workshop-checkin-flow.md:525` vs `:471` |
| H-6 | **AC 20 (odómetro regresivo) está asignada solo a la Fase B**, aunque RF-7/RF-8 aplican también al egreso. Riesgo de cerrar la Fase C sin la validación de no-regresión de `mileageOut`. | `workshop-checkin-flow.md:521` vs `:415-416` |
| H-7 | **AC-6 y AC-23 se cruzan con PR-6 y con la decisión de contenido P-2**, que el registro declara único bloqueante. AC-6 (UI del QR) y AC-26 (copy de redirección) no se cierran sin P-2 aprobado. | `DECISION-REGISTER.md:5312,5317` |

---

## B. Definición de "terminado"

### B.1 Gate común (aplica a todo PR y toda fase, sin excepción)

1. `npm run build` verde (genera Prisma client primero — `AGENTS.md`).
2. Suites existentes verdes: `npm test` (y `npm run test:e2e` si se tocó un contrato existente). Sin regresiones.
3. `npm run db:migrate` aplicada en dev + `npm run db:generate` consistente.
4. `npm run db:seed` **idempotente**: ejecutarlo dos veces seguidas no duplica filas ni falla.
5. Ningún endpoint existente cambia de contrato sin estar previsto en el diseño/spec.
6. Logs sin token, sin hash y sin PII (S-1/S-2); errores por `inviteId`/`careEpisodeId`, nunca por token (`vehicle-claim-technical-design.md:101,584`).
7. Frontend: build/lint de `web-follow-app` verde cuando el PR/fase toca UI.
8. Criterio funcional propio (tabla siguiente) demostrado con la evidencia indicada en §A.

### B.2 PRs del módulo de reclamos

| PR | Verdadero cuando… | AC que cierra |
|---|---|---|
| **PR-1** Schema+seed+deps | La migración es aditiva y aplicada; los **2 índices únicos parciales** existen en `pg_indexes` (no solo en el archivo SQL); `token_hash` es `unique` y **no** existe columna de token crudo; `vehicle_ownerships.acquired_by_claim_invite_id` existe con FK; `qrcode` instalado y build verde; seed re-ejecutable con los 4 permisos y la matriz `owner`(create/list/review/revoke) / `mechanic`(create/list) / `employee`(ninguno); smoke de selects existentes de vehicles/ownerships sin cambios | AC-21 (parte) |
| **PR-2** API pública | El test de contrato de AC-3 falla si se agrega **cualquier** campo al body pre-verificación; los 4 fallos de verificación devuelven respuestas byte-idénticas; `verify` no setea `usedAt`; el segundo `commit` recibe 409; la escalera de lock produce exactamente `lockout_started`/`lockout_released`/`auto_revoked`; el throttle por token devuelve 429 sin datos; la expiración es lazy (sin cron) | AC-3, 4, 5, 8, 9, 11, 12, 13, 14, 18, 25, 26 |
| **PR-3** API taller | `POST` devuelve `link`+`whatsappUrl` **solo** en la creación y el detalle **no** los contiene; el QR existe en R2 y se re-muestra por URL firmada; revoke de un `claimed` deja `endsAt` seteado y `ownershipUndone:true`; taller B recibe 404 (no 403) y contexto PERSONAL 403; el orden de guards está verificado por reflection | AC-1, 2, 6, 10, 15, 17, 20, 24 (409) |
| **PR-4** Notificaciones | Cada evento del §7 del diseño tiene su listener; sin `Workshop.email` → skip con warn (no excepción); ningún mail transporta el link salvo la entrega manual; ningún log contiene token/hash | AC-7, 11 (mails), 16, 27 |
| **PR-5** Admin + métricas | Con F-8 = endpoint nuevo: existe `POST /api/admin/vehicle-claims/:id/revoke` con permiso propio y reusa el handler; el listado devuelve `meta.counts` por estado y el `status` **efectivo** (incluye `expired` calculado) | AC-21 (parte), AC-8 (listado) |
| **PR-6** Frontend | Página pública fuera de `(dashboard)`; pre-verificación sin datos; multiple choice con "No lo sé"; salto a `/register`/`/login` con `?next=` y ticket; panel con QR, `wa.me` en la creación, revoke, cola de revisión y aviso "ya tiene titular"; **P-2 aprobado** | AC-6, 24, 26, 27 (UI) |
| **PR-7** Hook `care-episode.closed` | Dos eventos sobre el mismo vehículo producen **un** invite; un invite `expired` se reactiva con token+hash **nuevos** y contadores en 0; `revoked`/`claim_blocked` no se tocan; el fallo del listener **no** altera el `CareEpisode` (verificado con el episodio ya `delivered`) | AC-22, 23, 24 |
| **PR-8** Disputa | **Fuera del piloto.** Verdadero cuando el flujo completo (202 → cola → resolución → revoke+reasignación auditada) está probado. No se planifica en este ciclo | AC-28 |

### B.3 Fases del check-in

| Fase | Verdadero cuando… | AC que cierra |
|---|---|---|
| **A** Modelo y catálogos | Migración §7.3 aplicada (contacto + enum, 5 columnas de odómetro, `ServiceType`, `ServiceTypeSpecialty`, `CareEpisodeServiceType`, `brandName`/`modelName`); índice único del contacto activo **parcial** (no `@@unique([vehicleId,isActive])`, ver R-8); seed con 14 tipos y las 2 filas multi-especialidad; `care-episode.close` en owner+mechanic; `DEFAULT_PHONE_COUNTRY_CODE` con default en `src/config/envs.ts` (Joi) | 32, 34 |
| **B** Check-in unificado | La rama WORKSHOP crea `Vehicle`+`CareEpisode`+contacto en una transacción (test de atomicidad que falla si se separan); placa repetida reutiliza (nunca 409); P2002 de carrera reintenta como reutilización; odómetro obligatorio con excepción completa; VIN 409 en los dos casos; UI con rama crear/reutilizar y `not-found` deja de ser callejón | 1-7, 15-23, 27-29 |
| **C** Cierre | `open→delivered` con guard `updateMany` (test de D-178 #1); 409 en segundo cierre; exige egreso + ≥1 tipo; fotos `after` antes de cerrar; evento emitido **después** del commit y el fallo del consumidor no revierte; badge "Entregado" sin regresión en listado/timeline; **validación de no-regresión del egreso** (H-6) | 8, 9, 21, 24, 20 (egreso) |
| **D** Lectura multi-taller | `assertWorkshopVehicleAccess` incluye `care_episodes`; el historial acepta contexto WORKSHOP; la proyección ajena usa `select` explícito con `customerComplaint`/`customerNotes` y **sin** `internalNotes` ni PII; sin relación previa → 404/403 controlado; escritura sobre episodio ajeno imposible | 10, 25, 26, 35 |
| **E** Onboarding | Wizard exige ≥1 especialidad y la persiste en la misma transacción; 400 sin especialidades; taller sin especialidades ve catálogo completo + banner (no bloquea) | 28, 30, 31 |
| **F** Conexión con reclamo | Es el **mismo trabajo que PR-7**: no se cuenta dos veces. Verdadero cuando el contrato `{careEpisodeId, vehicleId, workshopId}` se consume post-commit, con lectura de `phoneE164` del contacto activo y fallback QR | 8 (consumo), 36 |
| **G** Enmiendas documentales | `vehicle-register-flow.md` (D-035/D-038) y `care-episode-create-flow.md` (F-020 §5) dicen lo decidido; ninguna spec vigente contradice el check-in | — |

---

## C. Cierre de las decisiones abiertas (recomendación)

> Formato: pregunta → recomendación → por qué → costo → qué pasa si se decide lo contrario.

### F-7 — ¿El override `ownerPhone` del body solo snapshotea o corrige `VehicleOwnerContact`?

- **Recomendación: solo snapshot.** El override muere con el invite; **no** escribe la tabla.
- **Por qué:** una sola tabla, un solo dueño (check-in). El módulo de reclamos no tiene contexto de quién registró el contacto (`recordedByMemberId`), y D-173 ya fijó `phoneE164` como fuente única (`DECISION-REGISTER.md:5119-5127`). Corregir el contacto tiene su propia superficie explícita: el check-in sobre placa existente actualiza el contacto (`workshop-checkin-flow.md:268`).
- **Costo:** 0. Es lo que el diseño ya hace (`vehicle-claim-technical-design.md:415`).
- **Si se decide lo contrario:** dos escritores sobre la misma tabla, last-write-wins, y un bug del módulo de reclamos puede cambiar en silencio el número que el taller usará en el próximo WhatsApp. Se pierde además la trazabilidad de quién cargó qué.
- **Acción de producto:** el panel debe decir "número tomado del contacto del vehículo; para corregirlo, actualizalo en el check-in" (copy, PR-6).

### F-8 — Revocación por `super_admin`: ¿endpoint nuevo o solo impersonación?

- **Recomendación: endpoint nuevo** `POST /api/admin/vehicle-claims/:id/revoke` con permiso `admin.vehicle-claims.manage`, reusando el handler de revoke (`vehicle-claim-technical-design.md:496`).
- **Por qué:** (a) D-VC-1 dice "revocable por el taller **o un admin**" (`:48`); (b) con impersonación el `revokedByUserId` queda apuntando al usuario impersonado, no al admin → la auditoría miente; (c) si el taller está inactivo o sin miembros operativos, no hay ninguna vía de revocación. Sin PR-8, este endpoint es **la única recuperación** de un reclamo indebido.
- **Costo:** bajo (1 método de controller + 1 permiso en seed + reuso del handler). No agrega modelo ni migración.
- **Si se decide lo contrario:** el único mecanismo de deshacer un squatting queda dentro del taller afectado. Un vehículo reclamado por un tercero en un taller que ya no opera queda bloqueado hasta que exista PR-8. **Es el riesgo operativo más caro de las decisiones "no bloqueantes".**

### F-9 — ¿Distinguir estados terminales del link o un único "no disponible"?

- **Recomendación: distinguir** (`expired` / `revoked` / `claimed`) con copy accionable.
- **Por qué:** el usuario primario del link es el dueño real, no el atacante. "No disponible" lo deja sin próximo paso y traslada el costo al taller. El riesgo de oráculo es despreciable: token de 256 bits + rate-limit (`vehicle-claim-technical-design.md:554`). El diseño ya lo propone.
- **Costo:** 3 variantes de copy + 3 ramas en la página pública (PR-6). Bajo, y se paga una vez.
- **Si se decide lo contrario:** menos ramas de UI, pero el dueño que abre a los 8 días cree que el link está roto y llama al taller igual. El costo no desaparece, se mueve al mostrador.

### F-11 — ¿Mail automático de invitación cuando el propietario ya tiene cuenta?

- **Recomendación: NO. Cerrar la decisión como "no se implementa" y sacarla del backlog**, no dejarla como toggle.
- **Por qué (3 razones, la tercera es decisiva):** (1) el invite **no tiene campo de email** — solo `ownerPhone` (`:329`); (2) el caso "el propietario ya tiene cuenta **y es titular activo**" es exactamente el caso en que F-1/D-179 **omite el invite** (`:198`, `DECISION-REGISTER.md:5175-5181`), así que el caso que F-11 describe casi no existe; (3) enviar el link a un email **no verificado** saltea el control "el taller confirma el celular antes de enviar" (D-VC-10) y **contradice AC-23 y §7:582** ("ningún mail con link sale del backend"). Un mail mal tipeado por el taller entrega el token a un tercero.
- **Costo de "no":** 0. **Costo de "sí":** campo nuevo `ownerEmail` en el invite + regla de match + decisión de privacidad + romper AC-23.
- **Si se decide lo contrario:** hay que reabrir AC-23 y §7, agregar el campo al schema y aceptar un segundo canal de entrega sin verificación. No es una decisión de configuración: es un cambio de modelo de seguridad.

### S-4 — ¿Asignar `vehicle-claim.*` a roles custom de taller?

- **Recomendación: aceptar y documentar** (los roles custom no reciben los permisos en el piloto).
- **Por qué:** los talleres del piloto operan con roles de sistema (`owner`/`mechanic`, seed). Los roles custom son superficie post-MVP; asignarles permisos sensibles (`revoke`) sin que el `owner` lo sepa debilita el único control anti-squatting del piloto.
- **Costo:** 0 (es la matriz F-5 ya decidida, `DECISION-REGISTER.md:5199-5205`).
- **Si se decide lo contrario:** hace falta una UI/procedimiento de mapeo por taller + migración de roles existentes, y un custom role podría revocar sin conocimiento del dueño del taller.
- **Workaround manual:** mensaje 403 explícito en el panel ("tu rol no permite revocar; pedile al dueño del taller").

### P-1 — Métricas del piloto (operativo, lo que el fundador mira a los 30 días)

- **Recomendación: `meta.counts` alcanza para el panel del taller; el piloto se decide con una consulta SQL fija sobre la BD, no con un bloque de dashboard.** `meta.counts` no tiene `openedAt`/`verifiedAt` ni ratios, así que **no** sirve para decidir el piloto; sirve para que el taller vea su cola.
- **Costo:** 0 (sin endpoint nuevo; `meta.counts` ya está en PR-5, `vehicle-claim-technical-design.md:484,501`). La consulta es una vista manual semanal.

**Embudo (una fila por invite, ventana de 30 días):**

| # | Paso | Cómo se calcula (campos reales) |
|---|---|---|
| 1 | Generados | `vehicle_claim_invites.created_at` en la ventana; segmentar `care_episode_id IS NOT NULL` (automático) vs `care_episode_id IS NULL` (manual) |
| 2 | Con canal | `owner_phone IS NOT NULL` (WhatsApp posible) vs `NULL` (solo QR) |
| 3 | Abiertos | `opened_at IS NOT NULL` |
| 4 | Verificados | `verified_at IS NOT NULL` (o `vehicle_claim_attempts.outcome='verification_passed'`) |
| 5 | Reclamados | `used_at IS NOT NULL`; separar `claim_outcome` = `ownership_created` / `already_owner` |
| 6 | Revisión manual | `status='manual_review'` (o attempt `manual_review`) |
| 7 | Bloqueados | `status='claim_blocked'` (o attempt `claim_blocked`) |
| 8 | Caídos | `expires_at < now AND opened_at IS NULL` (nunca abierto) vs `opened_at IS NOT NULL AND used_at IS NULL` (abrió y no terminó) |
| 9 | Fricción | mediana de `vehicle_claim_attempts.outcome='verification_failed'` por invite |
| 10 | Abuso | `lockout_started`, `auto_revoked`, `revoke_reason='max_attempts'` |

**Ratios y umbral (30 días, N≥50 invites con canal; con menos es anécdota):**

| Métrica | Fórmula | Funciona | Zona gris (iterar) | No funciona |
|---|---|---|---|---|
| **Reclamo efectivo** (primaria) | reclamados / con canal | ≥ 30% | 15-30% | < 15% |
| Apertura | abiertos / con canal | ≥ 50% | 30-50% | < 30% |
| Reclamo entre abiertos | reclamados / abiertos | ≥ 50% | 30-50% | < 30% |
| Tiempo invite→claim | mediana `used_at - created_at` | ≤ 72 h | 72 h-7 d | > 7 d (casi todo expira) |
| Sin canal | `owner_phone IS NULL` / generados | ≤ 20% | 20-40% | > 40% (el QR es el canal real; el journey no se está midiendo) |
| Revisión manual | manual_review / verificados | ≤ 25% | 25-40% | > 40% (falla la captura de VIN: palanca RF-4) |
| Bloqueos | claim_blocked / commits | ≤ 5% | 5-10% | > 10% (titularidad previa no reflejada) |

**Lectura obligatoria:** si **apertura < 30%** el problema **no es el producto** — es que el taller no está enviando el link. Se corrige con operación (capacitación, QR en mostrador), no con código. Si **apertura alta y reclamo bajo**, el problema es el flujo (verificación o registro). Son dos acciones distintas y por eso el embudo se mide por separado.

- **Si se decide lo contrario (bloque en dashboard):** costo de un agregado nuevo + scoping cross-taller, que el diseño declara fuera de alcance (`:501`), y se posterga la lectura del piloto. **No lo recomiendo para los primeros 30 días.**

### OA-06 — ¿Unificar el alta PERSONAL con texto libre de marca/modelo?

- **Recomendación: no en esta iteración** (F-010 queda como está).
- **Por qué:** F-010 es un journey aprobado; el valor del piloto está del lado del taller. Abrirlo agrega un segundo camino de escritura de `brandName`/`modelName` y obliga a decidir quién cura el texto libre en el flujo del propietario.
- **Costo de "no":** 0. **Costo de "sí":** bajo en código, alto en consecuencia: la calidad de datos del catálogo se degrada justo cuando el piloto la está midiendo.
- **Si se decide lo contrario:** cola larga de marcas escritas a mano que el catálogo nunca reconcilia; el indicador "vehículos con datos de catálogo" deja de ser comparable entre alta personal y alta de taller.

### OA-07 — Especialidad obligatoria en el wizard + talleres existentes sin especialidad

- **Recomendación: exigir en el wizard nuevo (mín. 1); para los existentes, fallback de catálogo completo + banner "Completá tu perfil".**
- **Por qué:** sin exigirla, el filtro por especialidad nunca se ejerce y no aprendemos nada de D-174 en el piloto. Exigírsela a los talleres ya activos contradice el principio "nunca bloquear el mostrador" (D-162) y rompería el check-in de talleres seed.
- **Costo:** bajo (DTO + transacción del wizard + banner).
- **Si se decide lo contrario (exigir a todos):** un taller activo sin especialidades no puede hacer check-in hasta completar el perfil → frena el mostrador el día 1. Si se decide no exigir a nadie: el catálogo filtrado es decorativo y el mantenimiento "Otro > 10%" pierde su señal.

### OA-08 — ¿Replicar el km de ingreso en `VehicleMileage`?

- **Recomendación: no duplicar.** El episodio es la fuente de esa lectura.
- **Por qué:** dos fuentes de verdad para el mismo dato divergen en la primera corrección; ADR-005 dice que la historia se agrega, no se reescribe. Duplicar obliga a reconciliar en cada cierre.
- **Costo de "no":** 0 ahora. **Costo de "sí":** una escritura extra por cierre + regla de reconciliación para siempre.
- **Si se decide lo contrario:** el gráfico de km del propietario puede mostrar lecturas que no coinciden con el historial de servicios — exactamente el activo (confianza en el historial) que el producto vende.
- **Nota:** si el gráfico queda vacío para vehículos con solo lecturas de episodio, eso es un problema de **lectura** (query), no de datos; lo resuelve el Tech Lead en la capa de query, no requiere duplicar.

---

## D. Línea de corte del MVP

### D.1 Adentro del piloto

| Qué | Por qué entra |
|---|---|
| Check-in fases **A, B, C** | Sin alta + cierre no hay valor: no hay historial ni link |
| Check-in fases **D y E** | D hace verdadero "el historial es del vehículo" (la promesa del producto); E hace funcionar el filtro de catálogo. Ambas son paralelizables: si D se atrasa, el piloto arranca igual |
| Check-in fase **F** = reclamos **PR-7** | Es el punto de unión; sin él el link no se genera solo |
| Check-in fase **G** | Barata; evita que el equipo lea specs viejas |
| Reclamos **PR-1..PR-5** | Núcleo: invite, verificación, claim, aviso, revocación admin |
| Reclamos **PR-6** con **P-2 aprobado** | Sin frontend el dueño no puede reclamar |

### D.2 Afuera del piloto

| Qué queda afuera | Riesgo que asume el negocio | Workaround manual mientras tanto |
|---|---|---|
| **PR-8 — disputa del dueño real (AC-28)** | Un dueño real **sin relación con ningún taller** no tiene recurso: el único camino es que el taller revoque. Si el taller no opera o no responde, el vehículo queda a nombre de un tercero. Riesgo legal/reputacional sobre la promesa "historial confiable" | F-8 (endpoint admin) + pedido por mail a soporte con evidencia (cédula/título) + revocación manual por admin. **Requiere F-8 aprobado: sin F-8 no hay workaround** |
| **Reapertura de atención (D-176)** | Un cierre con error (km, tipo) queda inmutable: el historial "confiable" contiene un dato erróneo sin corrección posible | Atención nueva que documenta la corrección; la anterior queda visible como errónea |
| **Cancelación/edición de episodios (D-075)** | Un check-in cargado por error no se puede anular. Peor: **si ese episodio es el primer cierre, dispara el invite** y el link ya no se puede "des-generar" | Revocar el invite desde el panel y generar uno nuevo por `POST /api/vehicle-claims` |
| **OTP / SMS / WhatsApp API (diseño §1.2)** | Verificación débil por odómetro: ~76% de acierto por azar con 4 opciones y 5 intentos (`:277`) | Capturar el VIN en el mostrador (RF-4, "buena práctica"): cada vehículo con VIN sale del régimen débil |
| **Dashboard de métricas (P-1)** | El fundador no tiene panel; depende de una consulta SQL | Consulta semanal fija (C/P-1) |
| **Unificación del alta PERSONAL (OA-06)** | Dos calidades de datos de marca/modelo | Ninguno necesario en el piloto |
| **Replicar km en `VehicleMileage` (OA-08)** | Gráfico de km incompleto para vehículos con solo lecturas de episodio | Ninguno (se resuelve en lectura) |
| **`vehicle-claim.*` en roles custom (S-4)** | Taller que opera solo con roles custom no puede generar ni revocar | Asignar rol `owner` a un usuario del taller |
| **Auto-revocación → invite nuevo automático** | Tras `max_attempts` o `revoked`, el vehículo queda sin link hasta acción humana | `POST /api/vehicle-claims` manual (F-6) |
| **Retención automática de intentos (90 días, S-2)** | PII (IP truncada + UA) se acumula; no hay cron | Runbook manual trimestral (`:533`) |

---

## E. Riesgos de producto

### E.1 Contradicciones entre documentos (reportadas, no resueltas en silencio)

| # | Contradicción | Evidencia | Impacto |
|---|---|---|---|
| **R-1** | **AC-23 dice que el panel muestra "QR/link (re-display)", pero S-1/AC-6/§5.2 dicen que el detalle nunca devuelve el link.** | `vehicle-claim-technical-design.md:615` vs `:596,546,485` | El AC-23 no es verificable como está escrito: el link en texto no se puede re-mostrar. Debe reformularse a "QR re-display" antes de PR-3 |
| **R-2** | **Orden de las opciones del challenge: "por request" (registro) vs "por invite, semilla = `inviteId`" (diseño).** | `DECISION-REGISTER.md:5243` vs `vehicle-claim-technical-design.md:271` | Cambia el comportamiento: si rota por request, el dueño ve opciones en distinto orden en cada reintento y el atacante puede muestrear; si es por invite, es estable. **Debe decidirlo el fundador antes de PR-2** (afecta AC-4) |
| **R-3** | **D-181 habla de "estado `locked`", pero el diseño rechaza explícitamente un estado `LOCKED`** (usa `verificationLockedAt` + `lockoutCount`). | `DECISION-REGISTER.md:5195` vs `vehicle-claim-technical-design.md:143` | Si alguien implementa un valor de enum `LOCKED`, el índice único parcial y la máquina de estados se rompen. El enum de PR-1 debe seguir al diseño |
| **R-4** | **Casing del enum:** D-TL-VC-5 justifica "minúscula por convención del repo" pero el bloque Prisma, el índice parcial y los AC usaban MAYÚSCULA. | `vehicle-claim-technical-design.md:123-137,179,358` | ✅ **Resuelto 2026-11-01:** enum, `@default`, índice parcial y modelo bajados a lowercase en el diseño y en `02-backend-implementation.md`. Verificación en `pg_enum`/`pg_indexes` agregada a C-1 |
| **R-5** | **"Reintento" del consumidor de reclamo:** el spec afirma que el fallo "se reintenta desde el módulo de reclamo". | `workshop-checkin-flow.md:223,250,457` | **No existe mecanismo de reintento** (sin cron/outbox, `vehicle-claim-technical-design.md:40`). El único camino real es el `POST` manual. Un invite no generado se descubre tarde o nunca |
| **R-6** | **Huecos del mapeo de fases** (AC 11-14, 32, 33 sin fase; Fase F cita "AC 16" cuando quiere decir CV-16). | `workshop-checkin-flow.md:518-526` | Riesgo de cerrar una fase sin dueño del AC. Ver H-4/H-5 |
| **R-7** | **AC 20 asignada solo a Fase B**, aunque RF-7/RF-8 aplican al egreso. | `workshop-checkin-flow.md:521` vs `:415-416` | La Fase C podría shippear sin validación de no-regresión del `mileageOut` |
| **R-8** | **`VehicleOwnerContact` con `@@unique([vehicleId, isActive])` contradice su propia justificación** ("preserva historial de correcciones"): ese unique permite **una sola** fila inactiva por vehículo. | `workshop-checkin-flow.md:319` vs `:325` | La segunda corrección de teléfono rompe con P2002. Debe ser índice único **parcial** `WHERE is_active` (la propia spec lo menciona como alternativa) |

### E.2 Supuestos sin validar con talleres reales

| # | Supuesto | Dónde | Qué pasa si es falso |
|---|---|---|---|
| S-1 | El taller va a enviar el WhatsApp a mano y confirmar el número antes de enviar | D-VC-10, `:57` | Apertura < 30%: el link no llega. Es la métrica que primero hay que mirar (C/P-1) |
| S-2 | ~90% de los talleres ya tiene el contacto del propietario | `DECISION-REGISTER.md:5123` | Si es falso, el celular opcional deja la mayoría de los vehículos sin canal y todo el piloto depende del QR en mostrador |
| S-3 | El dueño recuerda el odómetro o tiene el VIN a mano | F-2/F-3, `:153,268` | Caída en `manual_review` o en fallos de verificación; el flujo se vuelve una cola de revisión del taller |
| S-4 | El taller va a capturar el VIN fotografiando el parabrisas "porque es buena práctica" | `workshop-checkin-flow.md:412` | Sin incentivo explícito, no lo hace → la mayoría de los vehículos cae al régimen débil del odómetro (~76%) |
| S-5 | El taller acepta el aviso pasivo sin confirmación obligatoria | D-190, `DECISION-REGISTER.md:5265-5273` | Si el taller se siente responsable igual, va a llamar al reclamante: fricción operativa no prevista |

### E.3 AC que dependen de una decisión todavía abierta

| AC | Depende de | Efecto |
|---|---|---|
| AC-6, AC-26 (parte UI), AC-23 (copy) | **P-2** (contenido, ⛔ PR-6) | PR-6 no cierra sin copy aprobado |
| AC-10 / revocación admin de AC-17 | **F-8** | Sin F-8 no hay revocación fuera del taller (y no hay workaround para PR-8) |
| AC-4 (estabilidad del challenge) | **R-2** (contradicción D-187 vs diseño) | El test de AC-4 cambia según cuál se implemente |
| AC-14 (semántica de lock) | **R-3** | Afecta el enum de PR-1 |
| AC-1/AC-2 (contrato de creación) | **F-7** | Si el override escribe el contacto, el contrato cambia |
| AC-28 | **PR-8** | Fuera del piloto por definición |

### E.4 Riesgo de secuenciación (no está en ningún documento)

| # | Riesgo | Mitigación |
|---|---|---|
| R-9 | **Si la Fase C (cierre) shippea antes que PR-7**, los cierres ocurren sin listener: no se genera invite y, si el vehículo no vuelve al taller, nunca habrá link salvo el `POST` manual. "Primer cierre = nunca tuvo invite" (`:203`) hace que el **siguiente** cierre sí genere, pero eso depende de que el vehículo regrese | Activar la Fase C en producción solo con PR-7 desplegado, o correr un alta manual masiva de invites para los vehículos cerrados en la ventana |
| R-10 | **`VehicleClaimDispute` entra en PR-1 como tabla sin uso.** No es un riesgo funcional, pero es deuda de schema en el piloto | Aceptable; documentar en la migración que se activa en PR-8 |
| R-11 | **`DEFAULT_PHONE_COUNTRY_CODE` es una variable de config nueva.** Si se agrega como requerida en `src/config/envs.ts` (Joi), el deploy rompe | Agregarla **con default `+54`** (como dice D-173), no como requerida |
