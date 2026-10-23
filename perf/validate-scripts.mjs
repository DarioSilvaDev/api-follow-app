/**
 * validate-scripts.mjs — Validación estructural (allowlist) de scripts Artillery.
 *
 * Reemplaza la denylist de verbos por una ALLOWLIST: todo método detectado debe
 * pertenecer a `ALLOWED_METHODS` (get/head/options). Es fail-closed: cualquier
 * método no permitido o clave inesperada tras un `-` produce un problema.
 *
 * NO es un parser YAML completo (ver limitaciones en perf/README.md). Trabaja
 * sobre la estructura de steps de Artillery y añade un escaneo de verbos
 * mutantes como defensa en profundidad.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ALLOWED_METHODS } from './scenarios.mjs';

/** Métodos que Artillery reconoce como step HTTP. */
export const HTTP_METHODS = new Set([
  'get',
  'head',
  'options',
  'post',
  'put',
  'patch',
  'delete',
  'trace',
  'connect',
]);

/** Claves de sequence-item que NO representan un request HTTP. */
export const NON_STEP_KEYS = new Set(['name']);

const MUTATING_RE = /(?:^|[\s{,\[])(post|put|patch|delete|trace|connect)\s*:/im;

/**
 * Valida el TEXTO de un script Artillery. Pura y testeable.
 * @param {string} text
 * @param {string} [rel]  Etiqueta del origen (para mensajes).
 * @returns {{problems: string[], steps: number}}
 */
export function validateScriptText(text, rel = '<memoria>') {
  const lines = String(text).split(/\r?\n/);
  const problems = [];
  let steps = 0;

  lines.forEach((line, idx) => {
    const code = line.replace(/#.*$/, '');
    // Sequence-item: "- get:", "- get :", "- { get:", "- {get: {...}"
    const m = /^\s*-\s*\{?\s*([A-Za-z][A-Za-z0-9_-]*)\s*:/.exec(code);
    if (!m) return;
    const token = m[1].toLowerCase();
    if (HTTP_METHODS.has(token)) {
      steps++;
      if (!ALLOWED_METHODS.includes(token)) {
        problems.push(`${rel}:${idx + 1}: método HTTP no permitido '${token.toUpperCase()}'`);
      }
    } else if (!NON_STEP_KEYS.has(token)) {
      problems.push(
        `${rel}:${idx + 1}: clave inesperada tras '-' ('${token}') — revisar manualmente`,
      );
    }
  });

  const stripped = lines.map((l) => l.replace(/#.*$/, '')).join('\n');
  const mut = MUTATING_RE.exec(stripped);
  if (mut) {
    problems.push(
      `${rel}: verbo mutante detectado en el archivo ('${mut[1].toLowerCase()}')`,
    );
  }

  if (steps === 0) problems.push(`${rel}: no se detectaron steps HTTP`);
  return { problems, steps };
}

/**
 * Valida un script Artillery desde el filesystem.
 * @param {string} rel  Ruta relativa a `repoRoot`.
 * @param {string} repoRoot
 * @returns {{problems: string[], steps: number}}
 */
export function validateScript(rel, repoRoot) {
  const abs = path.join(repoRoot, rel);
  if (!existsSync(abs)) return { problems: [`${rel}: no existe`], steps: 0 };
  return validateScriptText(readFileSync(abs, 'utf8'), rel);
}
