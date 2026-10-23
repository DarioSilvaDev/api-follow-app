#!/usr/bin/env node
/**
 * report.test.mjs — Verificación local del parser de `report.mjs` con JSON
 * SINTÉTICO. No ejecuta Artillery ni toca la base de datos.
 *
 * Uso:  node perf/tests/report.test.mjs
 *
 * Los documentos sintéticos replican el esquema real verificado de Artillery
 * 2.0.34 (`aggregate.counters`, `aggregate.summaries['http.response_time']`).
 */

import assert from 'node:assert/strict';
import { evaluate } from '../report.mjs';

/** Construye un reporte sintético con override de counters/summaries. */
function makeReport({ counters = {}, summaries, aggregate } = {}) {
  const base = {
    aggregate: {
      counters: {
        'http.requests': 100,
        'http.responses': 100,
        'http.codes.200': 100,
        'vusers.created': 100,
        'vusers.completed': 100,
        'vusers.failed': 0,
        ...counters,
      },
      summaries:
        summaries === undefined
          ? { 'http.response_time': { count: 100, p95: 50, p99: 80 } }
          : summaries,
      ...(aggregate ?? {}),
    },
  };
  return base;
}

let passed = 0;
let failed = 0;
const run = (name, fn) => {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message.split('\n')[0]}`);
    failed++;
  }
};

console.log('report.test.mjs — casos sintéticos');

// --- éxitos ----------------------------------------------------------------
run('corrida sana -> exit 0', () => {
  assert.equal(evaluate(makeReport(), { scenario: 'load-vehicles' }).exitCode, 0);
});

run('4xx presente con allow4xx=true -> exit 0', () => {
  const r = makeReport({
    counters: { 'http.codes.200': 90, 'http.codes.404': 10 },
  });
  assert.equal(
    evaluate(r, { scenario: 'smoke', policy: { allow4xx: true } }).exitCode,
    0,
  );
});

// --- fallas de veredicto ---------------------------------------------------
run('5xx presente -> exit 1', () => {
  const r = makeReport({ counters: { 'http.codes.200': 95, 'http.codes.500': 5 } });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('vusers.failed=0 PERO 5xx presente -> exit 1 (no se asume éxito)', () => {
  const r = makeReport({
    counters: { 'http.codes.200': 95, 'http.codes.500': 5, 'vusers.failed': 0 },
  });
  const res = evaluate(r, { scenario: 'smoke' });
  assert.equal(res.exitCode, 1);
  assert.equal(res.counters.failed, 0);
  assert.equal(res.categories['5xx'], 5);
});

run('429 presente -> exit 1', () => {
  const r = makeReport({ counters: { 'http.codes.200': 90, 'http.codes.429': 10 } });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('error de conexión (errors.ETIMEDOUT) -> exit 1', () => {
  const r = makeReport({ counters: { 'errors.ETIMEDOUT': 7 } });
  const res = evaluate(r, { scenario: 'load-auth-me' });
  assert.equal(res.exitCode, 1);
  assert.equal(res.categories.connectionErrors, 7);
});

run('vusers.failed>0 -> exit 1', () => {
  const r = makeReport({
    counters: { 'vusers.failed': 3, 'vusers.completed': 97 },
  });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('p95 por encima del umbral -> exit 1', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 350, p99: 400 } },
  });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('p99 por encima del umbral -> exit 1', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 100, p99: 900 } },
  });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('requests > responses -> exit 1', () => {
  const r = makeReport({
    counters: { 'http.requests': 100, 'http.responses': 99, 'http.codes.200': 99 },
  });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('métricas de latencia ausentes -> exit 1', () => {
  const r = makeReport({ summaries: {} });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('3xx presente (política por defecto) -> exit 1', () => {
  const r = makeReport({ counters: { 'http.codes.200': 99, 'http.codes.302': 1 } });
  assert.equal(evaluate(r, { scenario: 'smoke' }).exitCode, 1);
});

run('umbrales configurables: p95=200 con p95=150 -> exit 0', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 150, p99: 180 } },
  });
  assert.equal(
    evaluate(r, { scenario: 'smoke', thresholds: { p95: 200, p99: 200 } }).exitCode,
    0,
  );
});

// --- modo stress (umbrales = WARNING) --------------------------------------
run('stress: p95/p99 excedidos -> exit 0 (warning, no falla)', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 420, p99: 1500 } },
  });
  const res = evaluate(r, { scenario: 'stress-vehicles' });
  assert.equal(res.exitCode, 0);
  assert.equal(res.expectThresholdBreach, true);
  assert.equal(res.warned.length, 2, `warned=${JSON.stringify(res.warned)}`);
  assert.deepEqual(res.hardFailed, []);
});

run('stress: un 5xx sigue siendo FALLA dura -> exit 1', () => {
  const r = makeReport({ counters: { 'http.codes.200': 95, 'http.codes.500': 5 } });
  const res = evaluate(r, { scenario: 'stress-vehicles' });
  assert.equal(res.exitCode, 1);
  assert.ok(res.hardFailed.some((n) => /5xx/.test(n)), JSON.stringify(res.hardFailed));
});

run('stress: timeout sigue siendo FALLA dura -> exit 1', () => {
  const r = makeReport({ counters: { 'errors.ETIMEDOUT': 3 } });
  assert.equal(evaluate(r, { scenario: 'stress-vehicles' }).exitCode, 1);
});

run('load (no stress): p95 excedido sigue siendo FALLA dura -> exit 1', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 420, p99: 900 } },
  });
  const res = evaluate(r, { scenario: 'load-vehicles' });
  assert.equal(res.exitCode, 1);
  assert.equal(res.expectThresholdBreach, false);
  assert.ok(res.hardFailed.length >= 2, JSON.stringify(res.hardFailed));
});

run('stress por opción explícita (sin escenario) -> exit 0', () => {
  const r = makeReport({
    summaries: { 'http.response_time': { count: 100, p95: 900, p99: 2000 } },
  });
  assert.equal(
    evaluate(r, { scenario: 'smoke', expectThresholdBreach: true }).exitCode,
    0,
  );
});

// --- Opción A: saturación del GENERADOR (EADDRINUSE del cliente) ------------
/** Reporte con fallos de conexión SOLO del generador, todo explicado. */
const genReport = (counters) =>
  makeReport({
    counters: {
      'http.requests': 1000,
      'http.responses': 800,
      'http.codes.200': 800,
      'vusers.created': 1000,
      'vusers.completed': 800,
      'vusers.failed': 200,
      'errors.EADDRINUSE': 200,
      ...counters,
    },
    summaries: { 'http.response_time': { count: 800, p95: 420, p99: 1500 } },
  });

run('stress: SOLO EADDRINUSE + 0 errores del servidor -> exit 0 (generador)', () => {
  const res = evaluate(genReport(), { scenario: 'stress-vehicles-200' });
  assert.equal(res.exitCode, 0);
  assert.equal(res.generatorSaturated, true);
  assert.equal(res.generatorSaturatedSevere, true); // 200/1000 = 20% > 1%
  assert.deepEqual(res.hardFailed, []);
  assert.ok(res.warned.length >= 3, `warned=${JSON.stringify(res.warned)}`);
});

run('stress: EADDRINUSE marginal (0.4%) -> exit 0 y NO "saturado"', () => {
  const r = makeReport({
    counters: {
      'http.requests': 1000, 'http.responses': 996, 'http.codes.200': 996,
      'vusers.created': 1000, 'vusers.completed': 996, 'vusers.failed': 4,
      'errors.EADDRINUSE': 4,
    },
  });
  const res = evaluate(r, { scenario: 'stress-vehicles-150' });
  assert.equal(res.exitCode, 0);
  assert.equal(res.generatorSaturated, true);
  assert.equal(res.generatorSaturatedSevere, false);
});

run('stress: EADDRINUSE + un 5xx -> exit 1 (la API falló, no se tolera)', () => {
  const res = evaluate(genReport({ 'http.codes.200': 795, 'http.codes.500': 5 }), {
    scenario: 'stress-vehicles-200',
  });
  assert.equal(res.exitCode, 1);
  assert.equal(res.generatorSaturated, false);
});

run('stress: ECONNREFUSED (no EADDRINUSE) -> exit 1 (no es el generador)', () => {
  const r = makeReport({
    counters: {
      'http.requests': 100, 'http.responses': 90, 'http.codes.200': 90,
      'vusers.created': 100, 'vusers.completed': 90, 'vusers.failed': 10,
      'errors.ECONNREFUSED': 10,
    },
  });
  const res = evaluate(r, { scenario: 'stress-vehicles-200' });
  assert.equal(res.exitCode, 1);
  assert.equal(res.generatorSaturated, false);
});

run('stress: EADDRINUSE + ECONNRESET mezclados -> exit 1 (ambiguo)', () => {
  const r = makeReport({
    counters: {
      'http.requests': 100, 'http.responses': 90, 'http.codes.200': 90,
      'vusers.created': 100, 'vusers.completed': 90, 'vusers.failed': 10,
      'errors.EADDRINUSE': 8, 'errors.ECONNRESET': 2,
    },
  });
  assert.equal(evaluate(r, { scenario: 'stress-vehicles-200' }).exitCode, 1);
});

run('load (sin opt-in): EADDRINUSE sigue siendo FALLA dura -> exit 1', () => {
  const res = evaluate(genReport(), { scenario: 'load-vehicles' });
  assert.equal(res.exitCode, 1);
  assert.equal(res.generatorSaturated, false);
});

run('stress: EADDRINUSE pero fallos NO explicados -> exit 1 (no se enmascara)', () => {
  const r = makeReport({
    counters: {
      'http.requests': 100, 'http.responses': 90, 'http.codes.200': 90,
      'vusers.created': 100, 'vusers.completed': 90, 'vusers.failed': 10,
      'errors.EADDRINUSE': 7, // 7 != 10: hay fallos sin causa conocida
    },
  });
  assert.equal(evaluate(r, { scenario: 'stress-vehicles-200' }).exitCode, 1);
});

run('stress: EADDRINUSE pero la API no sirvió nada -> exit 1', () => {
  const r = makeReport({
    counters: {
      'http.requests': 10, 'http.responses': 0, 'http.codes.200': 0,
      'vusers.created': 10, 'vusers.completed': 0, 'vusers.failed': 10,
      'errors.EADDRINUSE': 10,
    },
  });
  assert.equal(evaluate(r, { scenario: 'stress-vehicles-200' }).exitCode, 1);
});

// --- reportes inválidos ----------------------------------------------------
run('objeto sin aggregate -> exit 2', () => {
  const res = evaluate({}, { scenario: 'smoke' });
  assert.equal(res.exitCode, 2);
  assert.equal(res.invalid, true);
});

run('sin aggregate.counters -> exit 2', () => {
  const res = evaluate({ aggregate: {} }, { scenario: 'smoke' });
  assert.equal(res.exitCode, 2);
  assert.equal(res.invalid, true);
});

run('null -> exit 2', () => {
  assert.equal(evaluate(null, { scenario: 'smoke' }).exitCode, 2);
});

console.log(`\nresultado: ${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
