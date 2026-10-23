# Pruebas de rendimiento (Artillery) — HCDV backend

Baseline de rendimiento **local y de SOLO LECTURA** para la API HCDV.
Herramienta: [Artillery](https://www.artillery.io/) `2.0.34` (devDependency).

> Estos resultados describen un baseline **local**, no la capacidad de producción.
> El generador de carga (Artillery), la API, PostgreSQL (contenedor) y el frontend
> comparten la **misma máquina**: eso distorsiona las métricas. Interpretar como
> referencia relativa, no como estimación directa de capacidad.

---

## 1. Alcance actual

- **Solo GET.** El harness aplica una **allowlist** (`get`/`head`/`options`) sobre
  *todos* los escenarios: cualquier otro método HTTP —o cualquier verbo mutante—
  es rechazado antes de ejecutar (`perf/validate-scripts.mjs`, fail-closed).
- **Sin escrituras, sin emails, sin storage.** Se excluyen uploads, URLs firmadas
  (`?signed=true`) y cualquier endpoint que dependa de R2/B2/Resend.
- **Sin login en el flujo.** El token se mintea fuera de la prueba (ver §3).
- Los límites de throttling **no se desactivan**. Estos endpoints de lectura no
  tienen throttle, así que un `429` sería una señal a investigar, no lo esperado.

Endpoints cubiertos:

| Escenario | Endpoint |
| --- | --- |
| `health` | `GET /api/health` (público, control) |
| `auth-me` | `GET /api/auth/me` |
| `vehicle-brands` | `GET /api/vehicle-brands` |
| `vehicle-models` | `GET /api/vehicle-models` |
| `vehicle-versions` | `GET /api/vehicle-versions` |
| `vehicles-list` | `GET /api/vehicles?page=1&limit=20` |
| `vehicles-list-search` | `GET /api/vehicles?page=1&limit=20&q=AB` |

---

## 2. Requisitos previos

1. **API en localhost.** Confirmar que responde:
   ```powershell
   Invoke-WebRequest "http://127.0.0.1:3001/api/health" -UseBasicParsing
   ```
   El puerto configurado en `.env` es `PORT=3001` (el 3000 suele estar ocupado por el frontend).
   Para arrancar la API: `npm run start:dev`.
2. **Base de datos local autorizada.** Debe ser la instancia local (contenedor
   `postgres-followapp`, `localhost:5433`), nunca una base compartida o de producción.
3. **Artillery instalado:** `npm install --save-dev artillery` (ya está en devDependencies).

---

## 3. Obtener el JWT (sin login, sin escrituras)

El token se mintea localmente con `JWT_SECRET` (Opción A del diseño). No crea
sesiones ni toca bcrypt/throttler. Nunca se escribe en archivos versionados.

```powershell
# Variable de entorno opcional para elegir el usuario (default: owner01@seeder.com)
# $env:PERF_USER_EMAIL = "owner01@seeder.com"

$env:ACCESS_TOKEN = (node perf/get-token.mjs)   # o: npm run perf:token
```

El token vive en la sesión de shell. Es **efímero** (TTL por defecto 3600 s) y no
se imprime en ningún log ni reporte.

> El script sólo imprime el token en stdout. No imprime email, password ni secretos.

---

## 4. Configurar la URL objetivo

```powershell
# Opcional. Si se omite, el default seguro es http://127.0.0.1:3001
$env:TARGET_URL = "http://127.0.0.1:3001"
```

`perf/preflight.mjs` **aborta** si `TARGET_URL` no apunta a `localhost`/`127.0.0.1`
(o si falta `ACCESS_TOKEN`, o si algún YAML viola la allowlist). Usa `url.origin`
saneado (descarta path/query) y no construye ningún comando por texto (`shell: false`).

---

## 5. Ejecutar

```powershell
npm run perf:smoke           # smoke: baja intensidad, un GET por endpoint
npm run perf:load:auth       # carga: GET /api/auth/me
npm run perf:load:catalog    # carga: brands / models / versions
npm run perf:load:vehicles   # carga: listado de vehículos (+ búsqueda)
npm run perf:stress:vehicles     # stress: rampa 10->80 RPS (sonda de punto de quiebre)
npm run perf:stress:vehicles:150 # stress: rampa 10->150 RPS (escalón superior)
npm run perf:stress:vehicles:200 # stress: rampa 10->200 RPS (escalón superior)
```

Cada corrida escribe **dos** archivos en `perf/results/`:

- `<escenario>-<timestamp>.json` — reporte de Artillery.
- `<escenario>-<timestamp>.meta.json` — **procedencia** (commit, estado de git,
  versión de Node/Artillery, hash del script, config de carga). Sin secretos.

Al terminar, `preflight.mjs` ejecuta el veredicto automático (§8) y **propaga su
exit code**: `0` = OK, `1` = falla, `2` = reporte inválido.

Para verificar las guardas y la estructura **sin ejecutar Artillery**:

```powershell
npm run perf:load:vehicles -- --validate-only
```

> **No sobrescribe resultados previos:** cada corrida usa un sello de tiempo propio.

---

## 6. Perfiles de carga

- **Smoke:** `arrivalRate 1` durante 30 s (verificación funcional + latencia base).
- **Load (por archivo):**
  - warmup: `2 RPS` × 60 s
  - ramp: `2 → 10 RPS` × 60 s
  - sustained: `10 RPS` × 120 s

Aprox. **4 min / ~1.680 requests** por archivo de carga.

Perfil **conservador** para baseline local. La intensidad y los umbrales se ajustan
tras leer el primer baseline, no antes.

**Stress (sonda de quiebre) — `vehicles-stress.yml`:** warmup `10 RPS` × 20 s →
rampa `10 → 80 RPS` × 150 s → pico `80 RPS` × 45 s. Aprox. ~10,5k requests / ~3,6 min.
No mide capacidad: busca la **rodilla** de degradación (el RPS donde la latencia deja
de ser plana). Ver §8 para la semántica especial del veredicto.

**Escalera de stress** (mismos endpoints y misma config de agente; sólo cambia el techo):

| Escalón | Perfil | Resultado medido (limpio, referencia local) |
| --- | --- | --- |
| 10→80 | warmup 20 s · rampa 150 s · pico 45 s | p95 ≈ 14 ms · 0 errores |
| 10→150 | warmup 20 s · rampa 150 s · pico 45 s | p95 ≈ 22 ms · ~0 errores (**estable**) |
| 10→200 | warmup 20 s · rampa 180 s · pico 60 s | **el GENERADOR satura** (ver §10) |

Conexiones: Artillery usa `agentkeepalive` con `keepAlive: true` por defecto (verificado
en `node_modules/artillery/dist/lib/core/engine_http.js`), por lo que no hay *churn*
de puertos efímeros del lado cliente salvo cuando el generador satura (§10).

---

## 7. Leer resultados

- **Consola:** tabla resumen con `http.response_time` (p50/p95/p99), RPS,
  `http.codes.*` y `errors.*`.
- **JSON:** `perf/results/<archivo>.json` (métricas agregadas + snapshots).
- **HTML (opcional):**
  ```powershell
  npx artillery report "perf/results/<archivo>.json"
  ```

Métricas a mirar: latencias **p50/p95/p99**, throughput (RPS), códigos HTTP,
timeouts (`errors.ETIMEDOUT`) y `429`.

### Veredicto automático (`perf/report.mjs`)

El reporte JSON **no es un veredicto**: `perf/report.mjs` lo analiza y devuelve un
exit code. Se ejecuta solo al final de cada corrida, o manualmente:

```powershell
npm run perf:report -- --in perf/results/<archivo>.json --scenario load-vehicles
```

Evalúa, entre otras cosas:

- clasificación de respuestas **2xx / 3xx / 4xx / 429 / 5xx**;
- **errores de conexión / timeout** (`errors.*`, p. ej. `ETIMEDOUT`, `ECONNRESET`);
- `http.requests` vs `http.responses` y coherencia de VUs (`completed + failed = created`);
- `vusers.failed`;
- cumplimiento de **p95/p99** frente a umbrales por escenario.

`vusers.failed = 0` **no** se usa como prueba única: una corrida con 5xx, 429 o
errores de conexión falla aunque no haya VUs fallidos.

Exit codes: `0` OK · `1` no cumple · `2` reporte inválido o sin métricas mínimas.

---

## 8. Umbrales provisionales

Los umbrales (`http.response_time.p95 < 300 ms`, `p99 < 800 ms`) son **gauges
provisionales, no SLO**, y se marcan como tales (`PROVISIONAL = true`). Son
**configurables por escenario** (`perf/scenarios.mjs`).

`ensure.thresholds` dentro del YAML es sólo un gauge informativo: `ensure` evalúa
al final, cuando la corrida ya completó y el reporte ya se escribió. El veredicto
autoritativo es el **exit code de `perf/report.mjs`** (§7).

**Cumplir los umbrales NO demuestra capacidad productiva**: el generador, la API,
PostgreSQL y el frontend comparten la misma máquina.

### Semántica del veredicto según el tipo de escenario

| Tipo | p95/p99 fuera de umbral | 5xx / 429 / timeouts / conexión |
| --- | --- | --- |
| `smoke`, `load` | **FALLA dura** (exit 1) | FALLA dura |
| `stress` | **WARNING** (no falla) | FALLA dura (salvo saturación del **generador**, ver abajo) |

**Excepción de stress — saturación del GENERADOR (Opción A).** Si a alta tasa el
*generador* agota sus sockets locales (`EADDRINUSE` del cliente) **y** todo lo demás
indica que la API está sana, los checks de conexión / `requests≠responses` /
`vusers.failed` pasan a **WARNING** (exit 0) y se emite un banner. La excepción sólo
aplica cuando se cumplen **todas** estas condiciones:

1. el escenario tiene `tolerateGeneratorSaturation` (los 3 `stress-*` lo activan);
2. hay errores y **todos** son `EADDRINUSE` (locales del cliente);
3. el servidor no devolvió ni un 3xx/4xx/5xx/429 (sólo 2xx) y sirvió algo (`2xx > 0`);
4. **todos** los fallos quedan explicados: `requests − responses == errores == vusers.failed`.

Cualquier ambigüedad (`ECONNREFUSED`, un 5xx, un fallo sin causa) **cierra** la
excepción ⇒ **FALLA dura**; por eso `ECONNREFUSED` (la API cayó) nunca se enmascara.
La *proporción* de errores sólo afecta al **texto** (≥1% ⇒ "SATURACIÓN"; si no, "marginal").

En `stress` la corrida **busca** degradar, así que romper p95/p99 es el resultado
esperado y se reporta como `[WARN]`. Un `exit 1` en stress normalmente significa
que se encontró el punto de quiebre: leer la **tabla por período** del reporte
(dónde p95/p99 y los códigos cambian), no sólo el exit code.

### Distinguir fallos funcionales de problemas de rendimiento

| Señal | Interpretación |
| --- | --- |
| `401/403/404` en un endpoint que debe dar 200 | Fallo funcional (token, guards, contrato) |
| `429` | Throttling (inesperado en estos GET sin throttle) |
| `5xx` | Fallo de aplicación (bug/integración) |
| `errors.ETIMEDOUT` / `ECONNRESET` | Timeout / saturación |
| `errors.EADDRINUSE` (cliente) | Saturación del **GENERADOR** (sockets locales), no de la API — ver §10 |
| 200 con p95/p99 altos | Degradación de rendimiento (sin error funcional) |

Éxito del smoke = los endpoints responden **200**, `errors == 0`, `timeouts == 0`.

---

## 9. Comprobaciones de aislamiento (antes de ejecutar)

1. `docker ps` muestra `postgres-followapp` y **ningún** otro Postgres relevante.
2. `DATABASE_URL` apunta a `localhost`/`127.0.0.1` (nunca remoto).
3. `TARGET_URL` es local (lo valida `preflight.mjs`).
4. Los YAML de `perf/artillery/**` respetan la allowlist **solo GET** — se validan
   **todos** los escenarios (no sólo el elegido) vía `perf/validate-scripts.mjs`.
5. Confirmar que `followapp @ localhost:5433` es la instancia local autorizada.

---

## 9.b Verificación local del harness (sin cargas)

```powershell
npm run perf:verify
```

Corre, con JSON/texto sintético y sin tocar Artillery ni la base de datos:

- `perf/tests/report.test.mjs` — parser del veredicto (OK, 5xx, 429, timeouts,
  `vusers.failed`, p95/p99, métricas ausentes, reportes inválidos).
- `perf/tests/validate-scripts.test.mjs` — allowlist contra texto sintético y
  contra los YAML reales del manifiesto.

---

## 10. Limitaciones conocidas

- **Node:** no hay `engines`/`.nvmrc`/Dockerfile/CI en el repo; la versión de Node
  de **producción no está fijada**. Local: `v24.14.1`.
- **Reproducibilidad:** el repo puede tener cambios sin commitear. Registrar el
  commit (`git rev-parse HEAD`) y el estado (`git status`) al medir el baseline.
  `preflight.mjs` ahora lo hace automáticamente en el `.meta.json`.
- **Recursos compartidos:** no usar los números como capacidad de producción.

### Limitaciones del validador de scripts

`perf/validate-scripts.mjs` **no es un parser YAML completo**: analiza la estructura
de steps de Artillery con expresiones regulares y una allowlist. Cubre las formas
usuales (`- get:`, `- { get: ... }`) y añade un escaneo de verbos mutantes sobre el
texto sin comentarios. Un YAML deliberadamente ofuscado (p. ej. anchors/aliases o
bloques multilínea exóticos) podría escapar del escaneo; el modo de fallo es
**fail-closed** (clave inesperada ⇒ problema), pero la revisión humana sigue siendo
la garantía final. No se añadieron dependencias nuevas por esto.

### Aislamiento de base de datos (no verificado automáticamente)

`preflight.mjs` valida `TARGET_URL` local, pero **no** demuestra que la API apunte
a una base de datos aislada: la API puede estar conectada a la instancia local
compartida. Verificarlo manualmente antes de medir (§9).

### Regla anti-contaminación (crítica)

**NO medir mientras haya trabajo pesado en la misma máquina.** El host es compartido y
dos causas invalidan una corrida:

1. **Editar `src/**` durante la corrida** → `nest start --watch` recompila y **reinicia
   la API** → ráfagas de `ECONNREFUSED` que parecen un quiebre falso.
2. **Correr `jest` / `tsc` / `prisma generate` / builds en paralelo** → roban CPU y
   producen **picos de latencia falsos** en la API co-localizada.

Antes de correr: confirmar que nadie edita `src/` ni ejecuta pruebas/builds. El log de la
API (`nest start --watch`) registra `File change detected` / `Nest application successfully
started` con hora; usarlo para **descartar reinicios** dentro de la ventana medida.

### Saturación del generador a alta tasa

Por encima de ~150–180 RPS un **único proceso de Artillery** empieza a fallar con
`errors.EADDRINUSE` del lado **cliente**. Señales de que el límite es el *generador* y no
la API:

- `5xx = 0`, `4xx = 0`, `429 = 0` (el servidor nunca erró);
- `p50` del servidor se mantiene bajo (p. ej. ≈ 20 ms) mientras crecen los fallos;
- el error es `EADDRINUSE` (bind del cliente), **no** `ECONNREFUSED` (refusal del servidor).

Para medir el techo real de la API más allá de ese punto hacen falta **generadores
distribuidos**, fuera del alcance del MVP.

> **Resuelto (Opción A):** `report.mjs` ya distingue la saturación del generador
> (`EADDRINUSE` del cliente, único error, sin errores del servidor) de una falla real
> de la API: la primera es **WARNING** (exit 0) con banner; `ECONNREFUSED`, un 5xx o
> cualquier fallo sin explicar siguen siendo **FALLA dura**. Condiciones en §8.
