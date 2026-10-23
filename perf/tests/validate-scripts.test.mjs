#!/usr/bin/env node
/**
 * validate-scripts.test.mjs — Verificación local del validador allowlist con
 * texto sintético + los scripts reales del repo. No ejecuta Artillery.
 *
 * Uso:  node perf/tests/validate-scripts.test.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScriptText, validateScript } from '../validate-scripts.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

console.log('validate-scripts.test.mjs — casos sintéticos');

const FLOW = (step) => `config:\n  target: "http://127.0.0.1:3001"\nscenarios:\n  - name: s\n    flow:\n${step}`;

run('get permitido', () => {
  const r = validateScriptText(FLOW('      - get:\n          url: "/api/health"'));
  assert.deepEqual(r.problems, []);
  assert.equal(r.steps, 1);
});

run('head/options permitidos', () => {
  const r = validateScriptText(
    FLOW('      - head:\n          url: "/api/health"\n      - options:\n          url: "/api/health"'),
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.steps, 2);
});

run('post bloqueado (secuencia)', () => {
  const r = validateScriptText(FLOW('      - post:\n          url: "/api/vehicles"'));
  assert.ok(r.problems.some((p) => /no permitido 'POST'/.test(p)), r.problems.join('; '));
});

run('post bloqueado (flow map en línea)', () => {
  const r = validateScriptText(FLOW('      - { post: { url: "/api/vehicles" } }'));
  assert.ok(r.problems.some((p) => /no permitido 'POST'/.test(p)), r.problems.join('; '));
});

run('escaneo de defensa detecta verbo mutante fuera de step', () => {
  const r = validateScriptText(`config:\n  target: "http://x"\n  post: 1\nscenarios:\n  - name: s\n    flow:\n      - get:\n          url: "/a"`);
  assert.ok(r.problems.some((p) => /verbo mutante/.test(p)), r.problems.join('; '));
});

run('clave inesperada tras - => problema (fail-closed)', () => {
  const r = validateScriptText(`${FLOW('      - get:\n          url: "/a"')}\n      - weird: 1`);
  assert.ok(r.problems.some((p) => /clave inesperada/.test(p)), r.problems.join('; '));
});

run('sin steps => problema', () => {
  const r = validateScriptText('config:\n  target: "http://x"\n');
  assert.ok(r.problems.some((p) => /no se detectaron steps/.test(p)), r.problems.join('; '));
});

run('los items de thresholds (con puntos) no generan falsos positivos', () => {
  const r = validateScriptText(
    `config:\n  ensure:\n    thresholds:\n      - http.response_time.p95: 300\nscenarios:\n  - name: s\n    flow:\n      - get:\n          url: "/a"`,
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.steps, 1);
});

console.log('\nvalidate-scripts.test.mjs — archivos reales del manifiesto');

for (const [key, def] of Object.entries(SCENARIOS)) {
  run(`real: ${def.script} sin problemas`, () => {
    const { problems, steps } = validateScript(def.script, repoRoot);
    assert.deepEqual(problems, []);
    assert.ok(steps >= 1, `se esperaban steps, got ${steps}`);
  });
}

console.log(`\nresultado: ${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
