#!/usr/bin/env node
/**
 * preflight.mjs — Guardas de seguridad + orquestación de Artillery + veredicto.
 *
 * Fase correctiva (A/C):
 *  1. NO usa `shell: true` ni interpola valores de entorno en un comando.
 *     Invoca `node <artillery>/bin/run ...` con argumentos en array (sin shell).
 *  2. Valida ESQUEMA (http/https), credenciales ausentes y hostname LOCAL de
 *     `TARGET_URL`, y usa `url.origin` saneado (sin path/query, sin `&`).
 *  3. Allowlist de métodos (`get|head|options`) vía `validate-scripts.mjs`.
 *  4. Validación estructural de TODOS los escenarios del manifiesto.
 *  5. Registro de PROCEDENCIA (sin secretos) junto al reporte.
 *  6. Ejecuta `report.mjs` y propaga su código de salida (veredicto real).
 *
 * Uso:
 *   node perf/preflight.mjs smoke
 *   node perf/preflight.mjs load-auth-me
 *   node perf/preflight.mjs <escenario> --validate-only   (no ejecuta Artillery)
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, ALLOWED_METHODS, PROVISIONAL } from './scenarios.mjs';
import { validateScript } from './validate-scripts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const reportEntry = path.join(__dirname, 'report.mjs');

const fail = (msg) => {
  console.error(`preflight [x] ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`preflight [ok] ${msg}`);

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------
const key = process.argv[2];
const flags = process.argv.slice(3);
const validateOnly = flags.includes('--validate-only');

if (!key || !SCENARIOS[key]) {
  fail(
    `uso: node perf/preflight.mjs <${Object.keys(SCENARIOS).join(' | ')}> [--validate-only]`,
  );
}

// 1) TARGET_URL: esquema, credenciales y hostname local. Se usa `url.origin`.
const rawTarget = process.env.TARGET_URL || 'http://127.0.0.1:3001';
let url;
try {
  url = new URL(rawTarget);
} catch {
  fail(`TARGET_URL no es una URL válida: ${rawTarget}`);
}
if (!ALLOWED_SCHEMES.has(url.protocol)) {
  fail(`TARGET_URL usa un esquema no permitido: ${url.protocol}`);
}
if (url.username || url.password) {
  fail('TARGET_URL no debe incluir credenciales.');
}
if (!LOCAL_HOSTS.has(url.hostname)) {
  fail(
    `TARGET_URL host "${url.hostname}" no es local. Abortado para no golpear un entorno remoto.`,
  );
}
// `origin` descarta path/query/fragment y cualquier metacaracter inyectado.
const target = url.origin;
ok(`TARGET_URL host=${url.hostname} (local) -> target saneado ${target}`);

// 2) Token presente (nunca se imprime).
const token = process.env.ACCESS_TOKEN;
if (!token || token.trim() === '') {
  fail(
    'ACCESS_TOKEN no está definido. Generá uno con:  $env:ACCESS_TOKEN = (node perf/get-token.mjs)',
  );
}
ok('ACCESS_TOKEN presente (valor no impreso)');

// 3) Validación estructural de TODOS los escenarios del manifiesto (allowlist).
{
  const allProblems = [];
  const entries = Object.entries(SCENARIOS);
  for (const [, def] of entries) {
    const { problems } = validateScript(def.script, repoRoot);
    allProblems.push(...problems);
  }
  if (allProblems.length > 0) {
    console.error('preflight [x] validación estructural falló:');
    for (const p of allProblems) console.error(`           - ${p}`);
    process.exit(1);
  }
  ok(
    `${entries.length} escenarios validados: sólo ${ALLOWED_METHODS.join('/')} ` +
      `(allowlist, sin verbos mutantes)`,
  );
}

if (validateOnly) {
  console.log('preflight [ok] --validate-only: guardas y estructura verificadas; no se ejecuta Artillery.');
  process.exit(0);
}

// 4) Entrypoint local de Artillery (invocado con node, sin shell).
const artilleryEntry = path.join(repoRoot, 'node_modules', 'artillery', 'bin', 'run');
if (!existsSync(artilleryEntry)) {
  fail('Artillery no está instalado. Ejecutá:  npm install --save-dev artillery');
}

// 5) Rutas de salida (no se sobrescriben resultados previos: sello con timestamp).
const resultsDir = path.join(repoRoot, 'perf', 'results');
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outAbs = path.join(resultsDir, `${key}-${stamp}.json`);
const metaAbs = path.join(resultsDir, `${key}-${stamp}.meta.json`);

// 6) Procedencia (SIN secretos: nada de tokens, credenciales ni valores de .env).
const scriptRel = SCENARIOS[key].script;
const scriptAbs = path.join(repoRoot, scriptRel);
const scriptText = readFileSync(scriptAbs, 'utf8');

function gitInfo() {
  const run = (args) => {
    const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', shell: false });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const head = run(['rev-parse', 'HEAD']);
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = run(['status', '--porcelain']);
  if (head === null || porcelain === null) return { available: false };
  const lines = porcelain ? porcelain.split('\n').filter(Boolean) : [];
  const counts = { staged: 0, modified: 0, untracked: 0 };
  for (const l of lines) {
    const x = l[0];
    const y = l[1];
    if (x === '?' && y === '?') counts.untracked++;
    else {
      if (x !== ' ') counts.staged++;
      if (y !== ' ') counts.modified++;
    }
  }
  return {
    available: true,
    head,
    branch,
    dirty: lines.length > 0,
    changeCount: lines.length,
    counts,
    statusHash: sha256(porcelain).slice(0, 16),
  };
}

function artilleryVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, 'node_modules', 'artillery', 'package.json'), 'utf8'),
    );
    return pkg.version;
  } catch {
    return null;
  }
}

function extractBlock(text, blockKey) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => new RegExp(`^(\\s*)${blockKey}\\s*:`).test(l));
  if (i < 0) return null;
  const indent = (lines[i].match(/^(\s*)/) || ['', ''])[1].length;
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l.trim() === '') {
      out.push(l);
      continue;
    }
    const ind = (l.match(/^(\s*)/) || ['', ''])[1].length;
    if (ind <= indent) break;
    out.push(l);
  }
  return out.join('\n');
}

const provenance = {
  scenarioKey: key,
  script: scriptRel,
  scriptSha256: sha256(scriptText).slice(0, 32),
  targetHost: url.hostname,
  loadConfig: extractBlock(scriptText, 'phases'),
  thresholds: SCENARIOS[key].thresholds,
  provisionalThresholds: PROVISIONAL,
  git: gitInfo(),
  node: process.version,
  artillery: artilleryVersion(),
  startedAt: new Date().toISOString(),
  note: 'Sin secretos: no incluye tokens, credenciales ni valores de variables de entorno.',
};
writeFileSync(metaAbs, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
console.log(`preflight -> procedencia: ${path.relative(repoRoot, metaAbs)}`);

// 7) Ejecución (sin shell; argumentos en array).
console.log(
  `preflight -> artillery run ${scriptRel} --target ${target} --output ${path.relative(repoRoot, outAbs)}\n`,
);
const res = spawnSync(
  process.execPath,
  [artilleryEntry, 'run', scriptAbs, '--target', target, '--output', outAbs],
  { stdio: 'inherit', env: process.env, shell: false },
);

if (!existsSync(outAbs)) {
  fail(`Artillery no produjo el reporte (exit ${res.status}). No se emite veredicto.`);
}

// 8) Veredicto automático (propaga el exit code de report.mjs).
console.log(`\nReporte JSON: ${path.relative(repoRoot, outAbs)}`);
console.log(`Reporte HTML: npx artillery report "${outAbs}"`);
const rep = spawnSync(
  process.execPath,
  [reportEntry, '--in', outAbs, '--scenario', key],
  { stdio: 'inherit', env: process.env, shell: false },
);
process.exit(rep.status ?? 0);
