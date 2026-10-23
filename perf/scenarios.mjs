/**
 * scenarios.mjs — Fuente única de verdad para la fase correctiva.
 *
 * Centraliza:
 *  - El manifiesto de escenarios autorizados (script + umbrales + política).
 *  - La allowlist de métodos HTTP permitidos.
 *
 * La comparten `preflight.mjs` (validación estructural) y `report.mjs`
 * (veredicto automático), para que no existan dos definiciones divergentes.
 */

/**
 * Métodos HTTP y variables de flujo que el harness acepta.
 * Fail-closed: cualquier otro método o clave desconocida aborta la corrida.
 */
export const ALLOWED_METHODS = ['get', 'head', 'options'];

/**
 * UMBRALES PROVISIONALES.
 *
 * NO son un SLO ni una garantía de capacidad productiva. Son gauges para
 * detectar regresiones en el baseline local. Cumplirlos NO demuestra que el
 * sistema soporte la carga en producción (generador, API, PostgreSQL y front
 * comparten la misma máquina).
 */
export const PROVISIONAL = true;
export const DEFAULT_THRESHOLDS = { p95: 300, p99: 800 };

/**
 * Política de veredicto por defecto. `false` = cualquier ocurrencia falla.
 *
 * `tolerateGeneratorSaturation`: cuando el **generador de carga** agota sus
 * propios sockets locales (`EADDRINUSE` = fallo de bind del CLIENTE) sin que la
 * API falle, degrada a WARNING los checks de conexión, `requests≠responses` y
 * `vusers.failed`. Sólo se habilita en escenarios de `stress`; cualquier señal
 * ambigua mantiene el fallo duro (ver `report.mjs`).
 */
export const DEFAULT_POLICY = {
  allow3xx: false,
  allow4xx: false,
  tolerateGeneratorSaturation: false,
};

/**
 * Códigos de error que son SIEMPRE del lado del GENERADOR (no de la API):
 * `EADDRINUSE` = el cliente no pudo hacer bind de un socket local; la API puede
 * estar perfectamente sana. Extensible si se observa otra firma local.
 */
export const GENERATOR_LOCAL_ERROR_CODES = ['EADDRINUSE'];

/**
 * Proporción de requests afectadas por errores locales del generador a partir de
 * la cual el reporte lo describe como "SATURACIÓN". NO afecta al veredicto (exit
 * code): sólo al texto. Por debajo, se describe como "marginal".
 */
export const GENERATOR_SATURATION_MIN_RATE = 0.01;

/**
 * Semántica de veredicto según el tipo de escenario:
 *
 *  - `kind: 'load' | 'smoke'` → los umbrales p95/p99 son FALLOS duros.
 *  - `kind: 'stress'` + `expectThresholdBreach: true` → la corrida busca la
 *    rodilla de degradación, así que superar p95/p99 es ESPERADO y se reporta
 *    como WARNING (no falla). Los fallos reales (5xx, 429, timeouts, errores de
 *    conexión, requests≠responses, vusers.failed) SIGUEN siendo duros.
 *
 * En stress, un exit≠0 suele significar "se alcanzó el punto de quiebre":
 * leer la tabla por período del reporte, no sólo el exit code.
 */
export const DEFAULT_KIND = 'load';

/**
 * Escenarios autorizados. El `script` es relativo a la raíz del repo.
 * `preflight.mjs` valida la estructura de TODOS estos archivos en cada corrida.
 */
export const SCENARIOS = {
  smoke: {
    script: 'perf/artillery/smoke.yml',
    kind: 'smoke',
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY },
  },
  'load-auth-me': {
    script: 'perf/artillery/load/load-auth-me.yml',
    kind: 'load',
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY },
  },
  'load-catalog': {
    script: 'perf/artillery/load/load-catalog.yml',
    kind: 'load',
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY },
  },
  'load-vehicles': {
    script: 'perf/artillery/load/load-vehicles.yml',
    kind: 'load',
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY },
  },
  'stress-vehicles': {
    script: 'perf/artillery/stress/vehicles-stress.yml',
    kind: 'stress',
    // La sonda BUSCA degradar: romper p95/p99 es el resultado esperado.
    expectThresholdBreach: true,
    thresholds: { ...DEFAULT_THRESHOLDS },
    // A alta RPS el propio generador puede saturar (EADDRINUSE): se tolera como
    // WARNING cuando es la ÚNICA causa (ver `tolerateGeneratorSaturation`).
    policy: { ...DEFAULT_POLICY, tolerateGeneratorSaturation: true },
  },
  // Escalones superiores de la MISMA escalera de quiebre (10->80 ya cubierto
  // arriba). Mismos endpoints y config de agente, sólo cambia el techo de RPS:
  // sirven para ubicar la rodilla por encima de 80 RPS.
  'stress-vehicles-150': {
    script: 'perf/artillery/stress/vehicles-stress-150.yml',
    kind: 'stress',
    expectThresholdBreach: true,
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY, tolerateGeneratorSaturation: true },
  },
  'stress-vehicles-200': {
    script: 'perf/artillery/stress/vehicles-stress-200.yml',
    kind: 'stress',
    expectThresholdBreach: true,
    thresholds: { ...DEFAULT_THRESHOLDS },
    policy: { ...DEFAULT_POLICY, tolerateGeneratorSaturation: true },
  },
};
