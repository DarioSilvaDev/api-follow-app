ADR-008 — No introducir @nestjs/cqrs

Fecha: 2026-09-04

## Problema

¿Debe el proyecto adoptar `@nestjs/cqrs` para formalizar la separación Commands/Queries, o es el patrón actual suficiente?

## Contexto técnico

- El proyecto utiliza un patrón CQRS liviano: Commands/Queries con handlers que exponen `execute()`, repositorios con tokens de inyección `*_REPOSITORY`.
- Controllers instancian command classes y llaman a handlers directamente.
- No se usa `@nestjs/cqrs` en ningún módulo.
- `AGENTS.md` y `ARCHITECTURE.md` son explícitos: sin `@nestjs/cqrs`.

## Decisión

**No introducir `@nestjs/cqrs`.** Mantener el patrón actual de Commands/Queries con handlers `execute()` y repositories con tokens `*_REPOSITORY`.

## Razón

- El patrón cumplido satisface todas las necesidades actuales y las del futuro refactor a CareEpisode.
- No existe un problema real que `@nestjs/cqrs` resuelva hoy (bus de comandos desacoplado, sagas, pipelining global).
- Agregarlo sería una dependencia estructural + abstracción sin consumidor real, violando el principio de no sobrearquitectura del MVP.
- El patrón es consistente y establecido en todos los módulos; introducir cqrs forzaría refactor masivo sin beneficio.
- Si en el futuro se necesita el bus de comandos, sería aditivo y no rompería lo existente.

## Alternativas evaluadas

- **A) Adoptar @nestjs/cqrs** → Rechazado: sin necesidad real, refactor extenso, sobrearquitectura.
- **B) Mantener patrón actual (elegida)** → Simple, consistente, suficiente.
- **C) Quitar la separación Command/Query** → Rechazado: la separación aporta claridad y es valiosa.

## Impacto

Ningún módulo, endpoint, migración ni test afectado. Decisión de documentación que ratifica el patrón existente.

## Aplicación

Los nuevos handlers (incluidos los de CareEpisode) seguirán el mismo patrón `execute()` con repos con tokens `*_REPOSITORY`.

---

## Actualización 2026-09-04 — Eliminación del campo refreshToken en UserSession

Como parte de la Fase 1 (estabilización), se decidió simplificar el modelo de sesiones:

- **Eliminado** el campo `refreshToken` (token crudo) del modelo `UserSession`.
- **Mantenido** `refreshTokenHash` como único campo de lookup.
- **Motivo:** el token crudo nunca se lee de la DB; solo se usa el hash para buscar y validar. Almacenar el token crudo es un anti-patrón de seguridad.
- **Estado:** schema y build actualizados. Migración `remove-refresh-token-field-from-user-session` pendiente de ejecución cuando la DB esté disponible.
- **Impacto:** `prisma-auth.repository.ts` destructuring de `refreshToken` para no propagarlo al create; interfaz `AuthRepository` sin cambios (parámetro `refreshToken` sigue como input del caller).
