# AGENTS.md

## Stack
- NestJS 11 + TypeScript + Express
- Prisma 6 + PostgreSQL
- EventEmitter2 (`@nestjs/event-emitter`)
- JWT auth, class-validator, helmet/cookie-parser, pino
- Node/CommonJS

## Entrypoints & structure
- Entry: `src/main.ts` (global prefix `api`, ValidationPipe whitelist, CORS hardcoded, AllExceptionsFilter)
- Root module: `src/app.module.ts` (PrismaModule global, EventEmitterModule, ThrottlerModule with named buckets, imports all feature modules)
- Modules in `src/modules/<context>/` (auth, users, vehicles, workshops, dealerships, maintenance, care-episodes, administration, vehicle-catalog, dashboard). Verify against `AppModule` before assuming.
- Shared: `src/common/` (database/prisma, authz guards/decorators, storage/mail/cache, filters/interceptors). Avoid duplicating shared infra.
- Config: `src/config/envs.ts` validates env via Joi and loads `.env`. See env section.

## Commands (from package.json)
**Install/dev/build**
- `npm ci`
- `npm run start:dev` (watch)
- `npm run build` (runs `npm run db:generate && nest build`)
- `npm run start:prod` (`node dist/main`)

**Lint/format/tests**
- `npm run lint` (ESLint with `--fix` — may modify files)
- `npm run format` (`prettier --write "src/**/*.ts" "test/**/*.ts"`)
- `npm test` (unit, Jest config in `jest.config.js`: `rootDir: src`, `*.spec.ts`)
- `npm run test:watch`, `npm run test:cov`, `npm run test:e2e` (uses `test/jest-e2e.json`)

**Prisma/DB**
- `npm run db:generate` (Prisma client)
- `npm run db:migrate` (`prisma migrate dev`)
- `npm run db:deploy` (`prisma migrate deploy`)
- `npm run db:reset` (`prisma migrate reset`) — **destructive**
- `npm run db:seed` (`prisma db seed`, uses `ts-node -P tsconfig.prisma.json prisma/seed.ts`)
- `npm run db:studio`

**Perf** (optional): `npm run perf:*` scripts in `perf/`.

## Env & config
- `src/config/envs.ts` loads `.env` via `dotenv.config()` and validates with Joi (`stripUnknown: true`). Required: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, `SMTP_FROM`, `API_URL`, `R2_*` (region/endpoint/key/secret/bucket/public-url), `FRONTEND_URL`. Defaults exist for ports/ttl/limits. B2 vars commented. Never commit secrets.
- CORS origins hardcoded in `main.ts` (includes specific Vercel URL + localhost). Change via code if needed.
- Throttling: global-ish via `ThrottlerModule` but note comment says guards applied selectively on sensitive endpoints; named bucket `dealershipVehicleCreate` uses `req.user?.id ?? req.ip`.

## DB & schema
- PostgreSQL + Prisma. Schema: `prisma/schema.prisma` (large). Many models use `snake_case` map to DB, code uses Prisma conventions.
- Migrations in `prisma/migrations/`. Always review schema/migrations/relations before changes. CareEpisode/Ownership/Vehicle/User/Identity/workshop/dealership are sensitive (historical data).
- Seed touches permissions/system roles/vehicle catalog/users/workshops. Update seed when adding permissions.

## Patterns & gotchas
- **Modular monolith** (no microservices). Commands/Queries separation is light; no `@nestjs/cqrs`. Handlers expose `execute()`. Controllers may instantiate command classes.
- **Events**: `@nestjs/event-emitter` in-process only. Emit after successful state change from handlers (not repositories). Don't assume durable/retry/outbox/Kafka unless explicitly decided.
- **AuthZ**: guards like `JwtAuthGuard`, `WorkshopGuard`, `PermissionsGuard` + `@Permissions(...)`. Backend enforces; never rely on UI.
- **Storage**: R2/B2 via `src/common/storage/`. Use existing abstraction.
- **Prisma**: `PrismaModule` global. Read handlers may use `PrismaService` directly; repos use tokens (`*_REPOSITORY`) when used.
- **Validation**: global `ValidationPipe` with `whitelist: true`, `transform: true`. JSON/urlencoded limits 10mb.
- **Logging**: Nest ConsoleLogger configured as JSON with limited levels in `main.ts` (error/log). Be careful not to log tokens/secrets.
- **Build**: `npm run build` generates Prisma client first. `tsconfig.json` excludes `test/`, `rootDir: ./src`.
- **Tests**: unit specs next to code in `src/**`. E2E under `test/` with separate config. No full test suite committed as comprehensive? Check before assuming coverage.

## Quick rules
- Understand before changing: read module, schema, guards, events, tests. `AppModule` is source of truth for active modules.
- Don't invent endpoints/models/permissions/env/events. If unclear and not verifiable, escalate (product/arch) rather than guessing.
- Avoid speculative infra (CQRS framework, outbox, Kafka, microservices) without explicit decision.
- Small cohesive changes; don't mix refactors/formatting with features.
- Never run destructive git/DB commands without explicit intent.
