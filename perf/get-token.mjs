#!/usr/bin/env node
/**
 * get-token.mjs — Mintea un access token LOCAL para pruebas de rendimiento
 * de SOLO LECTURA (Opción A aprobada en el diseño de Fase 2).
 *
 * Por qué existe:
 *  - Ejecutar `POST /api/auth/login` por cada usuario virtual distorsionaría las
 *    mediciones (bcrypt + throttler) y además CREA una fila de sesión (escritura).
 *  - En cambio, firmamos localmente un JWT con el MISMO `JWT_SECRET` del proyecto.
 *    `JwtStrategy` sólo verifica firma + `exp` y hace un `findUnique` de lectura,
 *    por lo que este token NO crea sesiones ni toca el throttler ni bcrypt.
 *
 * Garantías de seguridad:
 *  - Nunca imprime email, password ni secretos. Sólo el token en stdout.
 *  - Sólo hace UNA lectura (findUnique del usuario por email).
 *  - Es una herramienta LOCAL: no usar contra producción.
 *
 * Uso (PowerShell):
 *   $env:ACCESS_TOKEN = (node perf/get-token.mjs)
 *
 * Variables opcionales:
 *   PERF_USER_EMAIL (default: owner01@seeder.com)
 *   PERF_TOKEN_TTL_SECONDS (default: 3600)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `quiet: true` evita que dotenv 17 escriba su línea de log en stdout:
// stdout debe contener EXCLUSIVAMENTE el token (se captura en $env:ACCESS_TOKEN).
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const email = process.env.PERF_USER_EMAIL || 'owner01@seeder.com';
const secret = process.env.JWT_SECRET;
const ttlSeconds = Number(process.env.PERF_TOKEN_TTL_SECONDS || 3600);

if (!secret) {
  console.error('get-token: JWT_SECRET no está definido (.env). Abortado.');
  process.exit(1);
}
if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
  console.error('get-token: PERF_TOKEN_TTL_SECONDS inválido. Abortado.');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  // Lectura: sólo el id y el status. Nada se modifica.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  if (!user) {
    console.error(
      `get-token: no existe un usuario con email PERF_USER_EMAIL=${email}`,
    );
    process.exit(2);
  }
  if (user.status !== 'active') {
    console.error(
      `get-token: el usuario no está activo (status=${user.status}). Abortado.`,
    );
    process.exit(3);
  }

  const token = jwt.sign({ sub: user.id }, secret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });

  // stdout = token ÚNICAMENTE (sin newline extra que rompa capturas).
  process.stdout.write(token);
} finally {
  await prisma.$disconnect();
}
