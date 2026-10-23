#!/usr/bin/env node
/**
 * report.mjs — Veredicto automático sobre el JSON de Artillery.
 *
 * Analiza el reporte `--output` de Artillery y devuelve:
 *   0  = la corrida cumple los criterios
 *   1  = la corrida NO cumple los criterios (falla de veredicto)
 *   2  = reporte inválido / métricas ausentes (no se puede emitir veredicto)
 *
 * Punto central: **`vusers.failed = 0` NO implica que todas las respuestas
 * fueron exitosas.** Artillery registra los códigos en `http.codes.*` y NO
 * falla la petición por un 4xx/5xx salvo que se declare `expect`. Por eso el
 * veredicto se calcula a partir de los contadores de códigos, de `errors.*`,
 * de la relación requests/responses y de `vusers.failed`, de forma conjunta.
 *
 * Campos verificados contra el JSON real de Artillery 2.0.34 (`aggregate.counters`,
 * `aggregate.summaries['http.response_time']`), no asumidos.
 *
 * Uso:
 *   node perf/report.mjs --in perf/results/<archivo>.json --scenario load-vehicles
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCENARIOS,
  DEFAULT_THRESHOLDS,
  DEFAULT_POLICY,
  DEFAULT_KIND,
  PROVISIONAL,
  ALLOWED_METHODS,
  GENERATOR_LOCAL_ERROR_CODES,
  GENERATOR_SATURATION_MIN_RATE,
} from './scenarios.mjs';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Evalúa un reporte de Artillery. Pura: no imprime ni sale del proceso.
 *
 * @param {any} report  Contenido parseado del JSON de Artillery.
 * @param {{scenario?: string, thresholds?: object, policy?: object}} [opts]
 * @returns {object} Veredicto con `exitCode`, `checks`, categorías y contadores.
 */
export function evaluate(report, opts = {}) {
  const scenarioKey = opts.scenario ?? null;
  const scn = scenarioKey && SCENARIOS[scenarioKey] ? SCENARIOS[scenarioKey] : null;
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(scn?.thresholds ?? {}),
    ...(opts.thresholds ?? {}),
  };
  const policy = {
    ...DEFAULT_POLICY,
    ...(scn?.policy ?? {}),
    ...(opts.policy ?? {}),
  };
  const kind = opts.kind ?? scn?.kind ?? DEFAULT_KIND;
  // En modo stress (o si se fuerza por opción) romper p95/p99 es lo esperado:
  // esos checks pasan a WARNING y no cambian el exit code.
  const expectThresholdBreach =
    opts.expectThresholdBreach ?? scn?.expectThresholdBreach ?? false;

  // --- Validación de esquema -------------------------------------------------
  const schemaProblems = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    schemaProblems.push('el contenido no es un objeto JSON');
  }
  const agg = report?.aggregate;
  if (!agg || typeof agg !== 'object') schemaProblems.push('falta "aggregate"');
  const counters = agg?.counters;
  if (!counters || typeof counters !== 'object' || Array.isArray(counters)) {
    schemaProblems.push('faltan "aggregate.counters"');
  }
  if (schemaProblems.length > 0) {
    return {
      ok: false,
      exitCode: 2,
      invalid: true,
      scenario: scenarioKey,
      kind,
      expectThresholdBreach,
      thresholds,
      policy,
      provisional: PROVISIONAL,
      problems: schemaProblems,
      checks: [],
    };
  }

  const summaries =
    agg.summaries && typeof agg.summaries === 'object' ? agg.summaries : {};

  // --- Categorías de respuesta ----------------------------------------------
  const codes = {};
  let errorTotal = 0;
  const errorDetail = {};
  for (const [k, v] of Object.entries(counters)) {
    const m = /^http\.codes\.(\d{3})$/.exec(k);
    if (m) {
      codes[m[1]] = (codes[m[1]] ?? 0) + num(v);
      continue;
    }
    if (/^errors\./.test(k) && num(v) > 0) {
      errorDetail[k] = num(v);
      errorTotal += num(v);
    }
  }
  const generatorLocalCodes = new Set(GENERATOR_LOCAL_ERROR_CODES);
  const errorCodes = Object.keys(errorDetail).map((k) => k.replace(/^errors\./, ''));
  const onlyGeneratorLocalErrors =
    errorTotal > 0 && errorCodes.every((c) => generatorLocalCodes.has(c));
  const byClass = (d) =>
    Object.entries(codes)
      .filter(([c]) => c[0] === d)
      .reduce((s, [, v]) => s + v, 0);
  const b2xx = byClass('2');
  const b3xx = byClass('3');
  const b4xx = byClass('4');
  const b5xx = byClass('5');
  const c429 = codes['429'] ?? 0;

  const requests = num(counters['http.requests']);
  const responses = num(counters['http.responses']);
  const failed = num(counters['vusers.failed']);
  const created = num(counters['vusers.created']);
  const completed = num(counters['vusers.completed']);

  // --- Saturación del GENERADOR (no de la API) -------------------------------
  // Sólo se degrada a WARNING si TODO apunta al generador y NADA a la API:
  //   - hay errores y todos son locales del cliente (EADDRINUSE);
  //   - el servidor no devolvió ni un 3xx/4xx/5xx/429 (sólo 2xx);
  //   - la API sí sirvió tráfico (b2xx > 0);
  //   - TODOS los fallos quedan explicados (requests-responses == errores ==
  //     vusers.failed): ningún fallo sin causa conocida se enmascara.
  // Cualquier ambigüedad (p. ej. ECONNREFUSED, un 5xx, un fallo sin explicar)
  // cierra la puerta => el fallo sigue siendo DURO.
  const unexplainedFailures =
    failed !== errorTotal || requests - responses !== errorTotal;
  const generatorSaturated =
    policy.tolerateGeneratorSaturation === true &&
    onlyGeneratorLocalErrors &&
    b3xx === 0 &&
    b4xx === 0 &&
    b5xx === 0 &&
    c429 === 0 &&
    b2xx > 0 &&
    !unexplainedFailures;
  // Sólo cambia el TEXTO del reporte (magnitud), no el veredicto.
  const generatorSaturationRate = requests > 0 ? errorTotal / requests : 0;
  const generatorSaturatedSevere =
    generatorSaturated && generatorSaturationRate >= GENERATOR_SATURATION_MIN_RATE;

  const rtEntry =
    summaries['http.response_time'] ?? summaries['http.response_time.2xx'] ?? null;
  const rtCount = rtEntry ? num(rtEntry.count) : 0;
  const p95 = rtEntry && typeof rtEntry.p95 === 'number' ? rtEntry.p95 : null;
  const p99 = rtEntry && typeof rtEntry.p99 === 'number' ? rtEntry.p99 : null;

  // --- Checks (todos deben pasar, salvo los marcados `warnOnly`) -------------
  const checks = [];
  const add = (name, ok, detail, o = {}) =>
    checks.push({ name, ok: !!ok, detail, warnOnly: !!o.warnOnly });

  add('reporte con métricas mínimas', true, `requests=${requests}, responses=${responses}`);
  add(
    'latencia presente (http.response_time)',
    p95 !== null && p99 !== null && rtCount > 0,
    rtEntry ? `count=${rtCount}, p95=${p95}, p99=${p99}` : 'métrica ausente',
  );
  add('se registraron requests', requests > 0, `http.requests=${requests}`);
  add(
    'todas las requests obtuvieron respuesta',
    requests > 0 && responses === requests,
    `requests=${requests}, responses=${responses}`,
    { warnOnly: generatorSaturated },
  );
  add('sin respuestas 5xx', b5xx === 0, `5xx=${b5xx}`);
  add('sin respuestas 4xx', policy.allow4xx || b4xx === 0, `4xx=${b4xx}`);
  add('sin respuestas 429', c429 === 0, `429=${c429}`);
  if (!policy.allow3xx) {
    add('sin respuestas 3xx', b3xx === 0, `3xx=${b3xx}`);
  }
  add(
    'sin timeouts ni errores de conexión',
    errorTotal === 0,
    errorTotal === 0 ? 'ninguno' : JSON.stringify(errorDetail),
    { warnOnly: generatorSaturated },
  );
  add('sin vusers.failed', failed === 0, `vusers.failed=${failed}`, {
    warnOnly: generatorSaturated,
  });
  if (errorTotal > 0 && policy.tolerateGeneratorSaturation === true) {
    add(
      'errores de conexión atribuibles sólo al GENERADOR',
      generatorSaturated,
      generatorSaturated
        ? `errores=${errorTotal} (todos EADDRINUSE); 0 errores del servidor`
        : `códigos=${JSON.stringify(errorCodes)}: no concluyente`,
      { warnOnly: true },
    );
  }
  add(
    'cockpit de VUs coherente (completed + failed = created)',
    completed + failed === created,
    `created=${created}, completed=${completed}, failed=${failed}`,
  );
  add(
    `p95 <= ${thresholds.p95} ms (PROVISIONAL)`,
    p95 !== null && p95 <= thresholds.p95,
    `p95=${p95}`,
    { warnOnly: expectThresholdBreach },
  );
  add(
    `p99 <= ${thresholds.p99} ms (PROVISIONAL)`,
    p99 !== null && p99 <= thresholds.p99,
    `p99=${p99}`,
    { warnOnly: expectThresholdBreach },
  );

  const hardFailed = checks.filter((c) => !c.ok && !c.warnOnly);
  const warned = checks.filter((c) => !c.ok && c.warnOnly);
  const ok = hardFailed.length === 0;
  return {
    ok,
    exitCode: ok ? 0 : 1,
    invalid: false,
    scenario: scenarioKey,
    kind,
    expectThresholdBreach,
    generatorSaturated,
    generatorSaturatedSevere,
    generatorSaturationRate,
    thresholds,
    policy,
    provisional: PROVISIONAL,
    allowedMethods: ALLOWED_METHODS,
    categories: {
      '2xx': b2xx,
      '3xx': b3xx,
      '4xx': b4xx,
      '5xx': b5xx,
      '429': c429,
      connectionErrors: errorTotal,
      errorDetail,
      errorCodes,
    },
    counters: { requests, responses, failed, created, completed, p95, p99, rtCount },
    hardFailed: hardFailed.map((c) => c.name),
    warned: warned.map((c) => c.name),
    checks,
  };
}

// --- CLI ---------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i];
    else if (a === '--scenario') out.scenario = argv[++i];
    else if (a === '--p95') out.p95 = Number(argv[++i]);
    else if (a === '--p99') out.p99 = Number(argv[++i]);
    else if (a === '--json') out.json = true;
  }
  return out;
}

function printHuman(result, inputPath) {
  const c = result.categories;
  console.log('');
  console.log('================ VEREDICTO DEL BASELINE ================');
  console.log(`reporte : ${inputPath}`);
  console.log(`escenario: ${result.scenario ?? '(no especificado)'}`);
  if (result.invalid) {
    console.log('estado  : INVALIDO — no se puede emitir veredicto');
    console.log('problemas de esquema:');
    for (const p of result.problems) console.log(`  - ${p}`);
    console.log('=======================================================');
    return;
  }
  console.log('--- respuestas por clase ---');
  console.log(`  2xx: ${c['2xx']}`);
  console.log(`  3xx: ${c['3xx']}`);
  console.log(`  4xx: ${c['4xx']}   (429 incluidos: ${c['429']})`);
  console.log(`  5xx: ${c['5xx']}`);
  console.log(
    `  errores de conexión/timeout: ${c.connectionErrors}` +
      (c.connectionErrors ? ` ${JSON.stringify(c.errorDetail)}` : ''),
  );
  console.log(
    `  requests=${result.counters.requests} responses=${result.counters.responses} ` +
      `vusers.failed=${result.counters.failed} (created=${result.counters.created})`,
  );
  if (result.generatorSaturated) {
    const rate = (result.generatorSaturationRate * 100).toFixed(2);
    console.log(
      result.generatorSaturatedSevere
        ? '--- SATURACION DEL GENERADOR (no de la API) ---'
        : '--- ERRORES LOCALES DEL GENERADOR (marginales) ---',
    );
    console.log(
      `  Errores del lado CLIENTE (EADDRINUSE): ${c.connectionErrors} de ` +
        `${result.counters.requests} requests (${rate}%).`,
    );
    console.log(
      '  La API no fallo: 0 errores del servidor (sin 3xx/4xx/5xx/429) y sirvio respuestas 2xx.',
    );
    if (result.generatorSaturatedSevere) {
      console.log(
        '  La corrida NO alcanzo el techo de la API, sino el del generador; los checks',
      );
      console.log('  de conexion / requests-responses / vusers se reportan como WARNING.');
    } else {
      console.log(
        '  Proporcion despreciable: no compromete el veredicto (WARNING, no FALLA).',
      );
    }
  }
  console.log('--- checks ---');
  for (const ch of result.checks) {
    const tag = ch.ok ? 'PASS' : ch.warnOnly ? 'WARN' : 'FAIL';
    console.log(`  [${tag}] ${ch.name}${ch.detail ? ` -> ${ch.detail}` : ''}`);
  }
  console.log('--- avisos ---');
  if (result.expectThresholdBreach) {
    console.log(
      `  * Modo STRESS (${result.kind}): superar p95/p99 es ESPERADO (se busca la`,
    );
    console.log(
      '    rodilla de degradación). Los umbrales se reportan como WARNING y no fallan',
    );
    console.log(
      '    la corrida; 5xx/429/timeouts/conexión SÍ siguen siendo fallos duros.',
    );
    console.log(
      '    Un exit 1 suele indicar que se alcanzó el punto de quiebre: leer la tabla',
    );
    console.log(
      '    por período del reporte (donde p95/p99 y los códigos cambian).',
    );
  }
  if (result.provisional) {
    console.log(
      '  * Los umbrales p95/p99 son PROVISIONALES (baseline local), no un SLO.',
    );
    console.log(
      '  * Cumplirlos NO demuestra capacidad productiva: el generador, la API,',
    );
    console.log(
      '    PostgreSQL y el front comparten la misma máquina.',
    );
  }
  console.log(
    `  * "vusers.failed = 0" NO se usa como prueba única: el veredicto exige 2xx`,
  );
  console.log(
    `    coherentes, ausencia de 3xx/4xx/5xx/429 y de errores de conexión.`,
  );
  const warnCount = (result.warned ?? []).length;
  const state = result.ok
    ? result.generatorSaturated
      ? result.generatorSaturatedSevere
        ? 'OK (LIMITADO POR EL GENERADOR, no por la API)'
        : 'OK (con errores locales del generador, marginales)'
      : warnCount > 0
        ? 'OK (con warnings)'
        : 'OK'
    : 'FALLA';
  console.log(`estado  : ${state} (exit ${result.exitCode})`);
  console.log('=======================================================');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in) {
    console.error('uso: node perf/report.mjs --in <reporte.json> [--scenario <clave>] [--p95 <ms>] [--p99 <ms>]');
    process.exit(2);
  }
  const inputPath = path.resolve(args.in);
  let raw;
  try {
    raw = readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error(`report: no se pudo leer "${inputPath}": ${e.message}`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const result = {
      ok: false,
      exitCode: 2,
      invalid: true,
      scenario: args.scenario ?? null,
      problems: [`JSON inválido: ${e.message}`],
      checks: [],
      categories: {},
      counters: {},
      provisional: PROVISIONAL,
    };
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result, inputPath);
    process.exit(2);
  }

  const thresholds = {};
  if (Number.isFinite(args.p95)) thresholds.p95 = args.p95;
  if (Number.isFinite(args.p99)) thresholds.p99 = args.p99;

  const result = evaluate(parsed, { scenario: args.scenario, thresholds });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result, inputPath);
  process.exit(result.exitCode);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
