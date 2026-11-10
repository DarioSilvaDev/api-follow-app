# Plan 04 — Plan de implementación consolidado (MVP Autentia: taller primero)

> **Fecha:** 2026-11-01
> **Consolida:** `00-frontend-copy-context.md` (insumo de copy), `01-scope-acceptance.md` (alcance y aceptación), `02-backend-implementation.md` (ejecución backend), `03-repo-gap-inventory.md` (huecos verificados).
> **Documentos fuente de producto/diseño:** `docs/specs/workshop-checkin-flow.md`, `docs/designs/vehicle-claim-technical-design.md`, `DECISION-REGISTER.md` §42.
> **Este documento es el punto de entrada.** No repite contratos: dice **qué se construye, en qué orden, con qué gate y qué falta decidir**.

---

## 1. Resumen ejecutivo

El MVP tiene **dos mitades que se tocan en un solo punto**: el taller hace check-in del vehículo y cierra la atención; el cierre emite un evento; el módulo de reclamos genera un link de un solo uso; el dueño lo abre, verifica que el auto es suyo, se registra y reclama el historial.

En términos de construcción son **5 piezas**:

1. **Migración A** — modelo del check-in (tipos de atención, odómetro de egreso, contacto del dueño, texto libre de marca/modelo). *No existe nada de esto hoy.*
2. **Check-in y cierre** — dos comandos nuevos y una pata más en el UNION de autorización. *Hoy el taller no puede crear vehículos ni cerrar atenciones.*
3. **Migración B** — modelo de reclamo (invite con token hasheado, intentos, disputa). *No existe.*
4. **Módulo `vehicle-claims`** — API pública + API taller + notificaciones + listener del cierre. *No existe.*
5. **Frontend** — página `/reclamo/[token]`, panel del taller y copy. *No existe.*

**No queda ningún bloqueante de producto.** P-2 (copy) quedó aprobado el 2026-11-01 y el Tech Lead emitió veredicto favorable para arrancar B-1 (`02-tech-lead-review.md`).

---

## 2. Estado de la documentación

| Documento | Estado | Qué resuelve |
|---|---|---|
| `docs/specs/workshop-checkin-flow.md` | ✅ completo (71 KB) | Check-in, cierre, 14 tipos, celular, visibilidad, fases A–G, 36 AC |
| `docs/designs/vehicle-claim-technical-design.md` | ✅ completo (93 KB) | Modelo, estados T1–T20, contratos, seguridad, PR-1..PR-8, AC-1..AC-28 |
| `DECISION-REGISTER.md` §42 | ✅ D-158..D-192 | Decisiones cerradas + tabla de abiertas con recomendación |
| `docs/plans/01-scope-acceptance.md` | ✅ completo (36 KB) | AC→PR, DoD, cierre de decisiones, métricas, riesgos |
| `docs/plans/02-backend-implementation.md` | ✅ completo | Schema, migraciones, handlers, endpoints, tests, orden |
| `docs/plans/03-repo-gap-inventory.md` | ✅ completo | 23 huecos verificados con `archivo:línea` |
| `docs/plans/02-tech-lead-review.md` | ✅ **veredicto 2026-11-01** | Decisiones D-TL-B1..B5 y D-TL-C1, 8 validaciones, 12 correcciones aplicadas |
| `docs/plans/00-frontend-copy-context.md` | ✅ completo | Precedentes, copy literal, tono, rutas propuestas |
| `docs/specs/vehicle-claim-copy.md` | ✅ **aprobado (P-2, 2026-11-01)** | Copy de P-2 (página pública + panel + 4 mails) |

---

## 3. Entregables, dependencias y tamaño

| # | Entregable | Depende de | Gaps que cierra | AC | Tamaño |
|---|---|---|---|---|---|
| **B-1** | Migración A + seed del catálogo + `DEFAULT_PHONE_COUNTRY_CODE` | — | G-01*, G-02, G-03, G-10, G-21 | AC 23, 34 (check-in) | M |
| **B-2** | Check-in unificado + UNION `care_episodes` | B-1 | G-05, G-06, G-09 | AC 1–7, 15–23, 27–29 | L |
| **B-3** | Cierre + evento `care-episode.closed` | B-1 (∥ B-2) | G-04, G-08† | AC 8, 9, 21, 24 | M |
| **C-1** | Migración B + permisos + `qrcode` | B-1 | G-01, G-11, G-14 | AC-21 (parte) | M |
| **C-2** | API pública (`bootstrap`/`challenge`/`verify`/`commit`) | C-1 | G-12, G-14 | AC-3, 4, 5, 8, 9, 11–14, 18, 25, 26 | XL |
| **C-3** | API taller + QR en R2 | C-1, C-2 | G-13 | AC-1, 2, 6, 10, 15, 17, 20, 24 | L |
| **C-4** | Notificaciones (mails + listeners) | C-3 + **P-2** | G-16 (mails) | AC-7, 11, 16, 27 | M |
| **C-5** | Hook `care-episode.closed` → invite | B-3, C-3 | G-15 | AC-22, 23, 24 | S |
| **C-6** | Admin revoke + `meta.counts` | C-3 | — | AC-8 (listado), AC-21 | S |
| **C-7** | Disputa del dueño real | C-3 | — | AC-28 | — **fuera del piloto** |
| **F-1** | Página `/reclamo/[token]` + wizard | C-2 + **P-2** | G-17, G-18, G-19, G-20 | AC-6, 24, 26, 27 | L |
| **F-2** | Panel del taller (generar/QR/wa.me/revocar/revisión) | C-3 + **P-2** | — | AC-6, 24, 27 | M |
| **D-1** | Copy de P-2 aprobado | — | G-16 | — | S |

`*` G-01 se cierra en dos partes: catálogo de tipos en B-1, modelos de reclamo en C-1.
`†` G-08 no se "arregla": se documenta como restricción operativa (fotos `after` antes de cerrar).

**Nota sobre F-1/F-2:** el diseño de reclamos los agrupa como **PR-6**. Acá se separan porque el panel (F-2) puede shippear antes que la página pública y desbloquea la operación del taller.

---

## 4. Secuencia recomendada (hitos)

### M0 — Cierre de decisiones y copy (1–2 días, sin código)

- Aprobar `docs/specs/vehicle-claim-copy.md` (**P-2**).
- Confirmar `D-TL-B1..B5` y `D-TL-C1` (§6).
- Confirmar F-7, F-8, F-9, F-11 y OA-06/07/08 (todas tienen recomendación; sólo F-11 afecta alcance).

**Gate:** P-2 aprobado por escrito. Sin esto, B-1 puede arrancar igual (no depende del copy), pero C-4 y F-1 no.

### M1 — Modelo (B-1 + C-1)

- Migración A + seed del catálogo.
- Migración B + permisos + `qrcode`.
- Helpers `resolveVehicleDisplayName` y `buildE164`.

**Gate:** `db:migrate`, `db:seed`, `build` y `test` verdes en una BD limpia. Índices parciales verificados en `pg_indexes`, no sólo en el `.sql`.

### M2 — Ciclo de la atención (B-2 + B-3)

- Check-in atómico.
- UNION con `care_episodes`.
- Cierre + evento.
- `GET /care-episodes/service-types`.

**Gate:** un taller puede dar de alta un vehículo nuevo por placa, cerrar la atención y el evento `care-episode.closed` se emite **después** del commit. AC 1–9, 15–24, 27–29 del spec en verde.

### M3 — Reclamo backend (C-2 + C-3)

- API pública con ticket, lock y single-use.
- API taller con QR en R2.
- Tests de los 3 críticos.

**Gate:** DoD de PR-2 y PR-3 (`01-scope-acceptance.md:118-119`). El contrato pre-verificación falla si se agrega un campo.

### M4 — Conexión y notificaciones (C-5 + C-4 + C-6)

- Listener del cierre.
- Mails.
- Admin/metricas si F-8 se aprueba.

**Gate:** dos cierres sobre el mismo vehículo → un invite. Un invite `expired` se reactiva con token nuevo. El fallo del listener no altera la atención. Ningún mail transporta el link.

### M5 — Frontend (F-1 + F-2)

- Panel del taller primero (desbloquea operación).
- Página pública.
- Extensiones en `web-follow-app`: `?next=`, exclusiones de `api.ts`, componente de selección para el multiple choice.

**Gate:** un dueño real completa el journey completo en un entorno de staging con un vehículo de prueba, desde el link de WhatsApp hasta ver el historial.

### M6 — Piloto

- 3–5 talleres, métricas de `01-scope-acceptance.md:181-216`.
- Runbook: qué hacer si un dueño disputa (hoy: revocación manual por admin), si el link se filtró (revocar), si el taller no tiene especialidades (catálogo completo).

---

## 5. Línea de corte del piloto

### Adentro

- Check-in por placa, sin titularidad, con odómetro obligatorio y excepción "no legible".
- Catálogo de 14 tipos filtrado por especialidad.
- Cierre con tipos y odómetro de egreso.
- Invite con token hasheado, QR en R2, link/WhatsApp una sola vez.
- Verificación por VIN (últimos 4) o multiple choice.
- Registro/login y commit con aviso pasivo al taller.
- Revocación por el taller.
- Mails de aviso (sin link).
- Panel del taller y página pública.

### Afuera (explícito)

- **Disputa del dueño real** (C-7 / PR-8). Riesgo aceptado: si el taller no responde, la única salida es soporte + revocación manual por admin.
- **WhatsApp Business API, SMS, OTP.** Sólo `wa.me` manual + QR.
- **Reapertura de atenciones cerradas.** Sin excepción en MVP.
- **Edición del historial.** La historia se agrega, no se reescribe.
- **Login con Google/OAuth.** El copy no debe prometerlo.
- **Notificaciones automáticas al dueño por mail con el link** (F-11 abierta).
- **Dashboard cross-taller de reclamos.** Métricas por taller solamente.

---

## 6. Decisiones pendientes y recomendación

### 6.1 Bloqueante de contenido

| ID | Decisión | Recomendación | Impacta |
|---|---|---|---|
| **P-2** | Copy de la página pública, estados terminales, panel y 4 mails | ✅ **APROBADO 2026-11-01** — `docs/specs/vehicle-claim-copy.md` | C-4, F-1, F-2 |

### 6.2 Técnicas (no requieren fundador, sí Tech Lead)

| ID | Punto | Recomendación |
|---|---|---|
| `D-TL-B1` | Ruta del check-in | `POST /care-episodes/check-in` (endpoint nuevo) |
| `D-TL-B2` | ¿Abrir `RegisterVehicleHandler` a WORKSHOP? | **No**: crear el vehículo dentro del comando de check-in |
| `D-TL-B3` | Catálogo de tipos | `GET /care-episodes/service-types` |
| `D-TL-B4` | Flag `odometerReplaced` | **No** en MVP: `closeNotes` alcanza |
| `D-TL-B5` | `closedByMemberId` | Sí, por auditoría |
| `D-TL-C1` | Throttle de `challenge` | 5/5 min (lo que dice el diseño) hasta corregir el documento |

### 6.3 De producto con recomendación (no bloquean M1–M3)

| ID | Punto | Recomendación del PM | Bloquea |
|---|---|---|---|
| **F-7** | ¿`ownerPhone` del body corrige `VehicleOwnerContact`? | Sólo snapshot | C-3 (no el resto) |
| **F-8** | ¿Endpoint admin de revoke? | Sí, si se quiere workaround de disputa | C-6 |
| **F-9** | ¿Distinguir `expired`/`revoked`/`claimed`? | Sí (mejor UX, riesgo de oráculo despreciable) | F-1 |
| **F-11** | ¿Mail automático con el link si el dueño tiene cuenta? | **No** en el piloto: el link va por WhatsApp/QR | C-4 |
| **OA-06** | ¿Unificar alta personal con texto libre? | No en este ciclo | — |
| **OA-07** | Especialidad obligatoria en el wizard | Sí, con fallback a catálogo completo para talleres existentes | B-1 (seed) / E del spec |
| **OA-08** | ¿Replicar km en `VehicleMileage`? | No en MVP | — |

---

## 7. Riesgos principales

| # | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| **R-9** | El cierre shippea sin el listener → cierres del piloto sin invite, silencioso | Media | **Alto** | C-5 en el mismo release que B-3; test de dos cierres | Backend |
| **R-11** | `DEFAULT_PHONE_COUNTRY_CODE` como requerida rompe todos los entornos | Media | Alto | `.default('+54')` + test de arranque sin la var | Backend |
| **R-1** | El multiple choice de odómetro acierta ~76% por azar | Alta | Medio | Aviso pasivo + revocación 1 click + disputa (fase 2); documentado como control débil | Producto |
| **R-2** | El taller no captura VIN → muchos reclamos caen en revisión manual | Alta | Medio | Recomendación de fotografiar el parabrisas en el check-in; medir % de VIN capturado en el piloto | Producto |
| **R-3** | Índice parcial de invite activo mal escrito (mayúsculas vs minúsculas del enum) | Media | Alto | El enum se declara lowercase y el índice usa `('pending','verification_required','verified','manual_review')`; verificar `pg_indexes` + `pg_enum` + test de concurrencia | Backend |
| **R-4** | Sin `?next=` extendido, el dueño pierde el reclamo al registrarse | Alta | Alto | F-1 incluye `auth-redirect.ts` como parte del PR, no como follow-up | Frontend |
| **R-5** | El commit puede dar `P2002` por `vehicle_ownerships_one_active_primary` | Media | Medio | Se traduce a `claim_blocked` (T9); **no** se cierra ningún ownership. El cierre de ownership pertenece sólo al revoke de un `claimed` (C-3) | Backend |
| **R-6** | Fuga del link (proxy, historial, `Referer`) | Media | Medio | Single-use + 7 días + throttle + hash; nunca loguear token | Seguridad |

---

## 8. Verificación y calidad

### 8.1 Gates por hito

| Hito | Gate mínimo |
|---|---|
| M1 | `db:migrate` + `db:seed` + `build` + `test` en BD limpia; índices parciales en `pg_indexes` |
| M2 | AC 1–9, 15–24, 27–29 del spec; atomicidad del check-in; evento post-commit |
| M3 | DoD PR-2/PR-3; los 3 tests críticos; contrato pre-verificación cerrado |
| M4 | Dos cierres → un invite; listener no revierte; mails sin link |
| M5 | Journey end-to-end en staging con un vehículo real de prueba |
| M6 | Métricas del piloto pobladas; runbook escrito |

### 8.2 Los 3 tests críticos (D-178)

1. Guard `updateMany` en el commit (doble consumo del token).
2. Atomicidad del check-in (vehículo huérfano).
3. Contrato del GET pre-verificación (anti-enumeración).

### 8.3 Métricas del piloto

Definidas en `01-scope-acceptance.md:181-216`. Las que importan para decidir si el GTM funciona:

- **% de atenciones cerradas** (vs. abiertas): mide si el taller completa el flujo.
- **% de vehículos con VIN capturado**: predice la tasa de revisión manual.
- **% de invites reclamados** (`claimed` / total generados): la métrica del producto.
- **% de `manual_review`**: mide la calidad de los datos de verificación.
- **% de `claim_blocked`**: mide conflictos con titulares existentes.
- **Tiempo mediano cierre → reclamo**: mide si el link se entrega en el momento correcto.

---

## 9. Checklist de arranque (primer día)

- [x] Confirmar P-2: `docs/specs/vehicle-claim-copy.md` **aprobado el 2026-11-01**.
- [ ] Confirmar `D-TL-B1..B5` y `D-TL-C1` con el Tech Lead.
- [ ] Confirmar F-11 (si se aprueba, C-4 cambia de alcance).
- [ ] Crear la rama de trabajo y verificar que `npm ci && npm run build && npm test` está verde **antes** de tocar nada.
- [ ] Revisar los cambios sin commitear que ya existen en el repo (`.env.example`, `AGENTS.md`, `prisma/schema.prisma`, `package.json`, `src/main.ts`) para no pisarlos.
- [ ] Borrar el archivo basura `x.permission.code).sort().join(` de la raíz.
- [ ] Arrancar B-1 (no depende de ninguna decisión pendiente).

---

## 10. Qué NO hacer

- No instalar `@nestjs/cqrs`, colas, cron ni outbox.
- No abrir `POST /api/vehicles` a WORKSHOP.
- No agregar estados a `CareEpisodeStatus`.
- No persistir el token del invite.
- No relajar el 409 de adjuntos en `delivered`.
- No prometer login con Google en el copy.
- No reabrir atenciones cerradas.
- No implementar la disputa en este ciclo.
- No mezclar refactors o formateo con features (AGENTS.md).

---

## 11. Índice de documentos

| Para… | Leer |
|---|---|
| Entender el flujo de check-in y cierre | `docs/specs/workshop-checkin-flow.md` |
| Entender el módulo de reclamos | `docs/designs/vehicle-claim-technical-design.md` |
| Ver qué se acepta y cómo se prueba | `docs/plans/01-scope-acceptance.md` |
| Escribir código backend | `docs/plans/02-backend-implementation.md` |
| Saber qué falta en el repo y con qué evidencia | `docs/plans/03-repo-gap-inventory.md` |
| Escribir copy o tocar el frontend | `docs/plans/00-frontend-copy-context.md` + `docs/specs/vehicle-claim-copy.md` |
| Ver por qué se decidió algo | `DECISION-REGISTER.md` §42 (D-158..D-192) |
