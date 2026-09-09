# Especificación: Flujo Completo de Reset Password

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-09
> **Estado:** Aprobado para implementación
> **Alcance:** Backend fixes + Frontend completo + Tests

---

## 1. Problema

El flujo de reset password tiene la lógica core implementada pero presenta múltiples problemas que impiden su uso correcto y comprometen la seguridad:

1. **El link del email apunta al backend** — el usuario hace click pero no hay frontend
2. **Token almacenado en texto plano** — si la BD se filtra, tokens son usables directamente
3. **Sin transacción atómica** — password update + mark token + revoke sessions pueden quedar en estado inconsistente
4. **Sin revocación de tokens anteriores** — cada request crea un token nuevo sin invalidar los viejos
5. **Sin reset de failedAttempts** — usuario puede quedar bloqueado tras reset exitoso
6. **Sin email de confirmación post-reset** — víctima no se entera si atacante resetea contraseña
7. **Sin frontend** — no hay páginas para que el usuario interactúe

## 2. Objetivo

Implementar un flujo completo, seguro y funcional de reset password que permita:

1. Un usuario solicitar un restablecimiento de contraseña via email
2. Recibir un email con un link funcional al frontend
3. Introducir una nueva contraseña en el frontend
4. Recibir confirmación del cambio
5. Tener auditoría y seguridad adecuadas

## 3. Actores

| Actor | Rol |
|---|---|
| **Usuario autenticado** | Quien solicita cambio de contraseña desde su perfil (`change-password`) |
| **Usuario (no autenticado)** | Quien olvidó su contraseña y solicita reset via email (`forgot-password` → `reset-password`) |
| **Sistema** | Envía emails, valida tokens, gestiona sesiones |

## 4. User Journeys

### 4.1 Journey: Forgot Password (solicitar reset)

```
Actor: Usuario (no autenticado)
  ↓
Contexto: Usuario olvidó su contraseña
  ↓
Acción: Ingresa su email en el formulario de "Olvidé mi contraseña"
  ↓
Sistema:
  1. Valida que el email sea válido (formato)
  2. Busca usuario por email en BD
  3. Si no existe → retorna mensaje genérico (sin revelar existencia)
  4. Si existe:
     a. Revoca todos los tokens de reset anteriores del usuario
     b. Genera token aleatorio (32 bytes hex)
     c. Calcula hash SHA-256 del token
     d. Almacena hash + userId + expiresAt (1 hora) en password_resets
     e. Envía email con link al frontend: ${FRONTEND_URL}/reset-password?token=${token}
  5. Retorna mensaje genérico siempre
  ↓
Resultado: Usuario recibe email (o no, si el email no existe — same behavior)
```

**Estado inicial:** Sin token activo para el usuario
**Estado final:** Token hash almacenado, email enviado
**Errores:** Email inválido → 400. Rate limit → 429.
**Excepciones:** SMTP no configurado → token se loggea pero no se envía email
**Permisos:** Público (no requiere autenticación)
**Datos:** email (request), token + hash (BD), link (email)
**Reglas de negocio:**
- No revelar si el email existe o no (previene enumeración)
- Un solo token activo por usuario (nuevos requests invalidan anteriores)
- Token expira en 1 hora
- Rate limit: 3 requests por 10 minutos por IP

### 4.2 Journey: Reset Password (ejecutar reset)

```
Actor: Usuario (no autenticado)
  ↓
Contexto: Usuario hizo click en el link del email
  ↓
Sistema:
  1. Frontend extrae token de la URL (?token=xxx)
  2. Frontend remueve token de la URL (replaceState)
  3. Frontend muestra formulario de nueva contraseña
  ↓
Acción: Usuario ingresa nueva contraseña + confirmación
  ↓
Sistema:
  1. Frontend valida: password >= 8 chars, <= 100 chars, passwords coinciden
  2. Frontend envía POST /auth/reset-password { token, password }
  3. Backend valida token (formato UUID no aplica — es hex de 64 chars)
  4. Backend calcula hash del token recibido
  5. Backend busca password_reset por tokenHash
  6. Si no encontrado → 401 "Enlace inválido o expirado"
  7. Si encontrado pero usedAt != null → 401
  8. Si encontrado pero expiresAt < now → 401
  9. Backend ejecuta en transacción:
     a. Hash de la nueva contraseña (bcrypt, 10 rounds)
     b. Actualiza userCredential: passwordHash, passwordChangedAt, failedAttempts=0, lockedUntil=null
     c. Marca token como usado (usedAt = now)
     d. Revoca todas las sesiones del usuario
  10. Emitir evento auth.password_reset.completed
  11. Listener envía email de confirmación al usuario
  12. Retorna 200 { message: "Contraseña actualizada exitosamente" }
  ↓
Resultado: Contraseña cambiada, sesiones revocadas, email de confirmación enviado
```

**Estado inicial:** Token válido, sin usar, no expirado
**Estado final:** Contraseña actualizada, token marcado como usado, sesiones revocadas
**Errores:** Token inválido/expirado → 401. Password corto → 400. Rate limit → 429.
**Excepciones:** Transacción falla → ningun cambio se aplica
**Permisos:** Público (el token es la autorización)
**Datos:** token + password (request), passwordHash + tokenHash (BD)
**Reglas de negocio:**
- Token de un solo uso
- Transacción atómica: o todo se aplica o nada
- Reset exitoso limpia failedAttempts y lockedUntil
- Todas las sesiones anteriores se revocan
- Se envía email de confirmación

### 4.3 Journey: Change Password (autenticado)

```
Actor: Usuario autenticado
  ↓
Contexto: Usuario quiere cambiar su contraseña desde su perfil
  ↓
Acción: Ingresa contraseña actual + nueva contraseña + confirmación
  ↓
Sistema:
  1. Frontend valida: currentPassword requerido, newPassword >= 8, <= 100, coinciden, diferente a actual
  2. Frontend envía POST /auth/change-password { currentPassword, newPassword }
  3. Backend verifica contraseña actual con bcrypt.compare
  4. Si incorrecta → 401 "Contraseña actual incorrecta"
  5. Backend hashea nueva contraseña
  6. Actualiza userCredential: passwordHash (NO revoca sesiones — el usuario sigue logueado)
  7. Retorna 200 { message: "Contraseña actualizada exitosamente" }
  ↓
Resultado: Contraseña cambiada, sesión actual se mantiene
```

**Nota:** Este journey NO revoca sesiones (a diferencia de reset-password). El usuario sigue autenticado.

---

## 5. Reglas de Negocio

### RB-1: Token Generation
- Token: `randomBytes(32).toString('hex')` → 64 caracteres hexadecimales
- Almacenar en BD: `SHA-256(token)` (hash, no texto plano)
- El token en texto plano solo existe: en memoria del handler y en el email enviado
- Expiración: 1 hora desde creación

### RB-2: Token Lifecycle
- Un solo token activo por usuario
- Al crear nuevo token, revocar (marcar usedAt) todos los anteriores del mismo usuario
- Token de un solo uso (usedAt se marca al usar exitosamente)

### RB-3: Password Validation
- Mínimo 8 caracteres
- Máximo 100 caracteres
- Sin requisito de complejidad (solo longitud)
- bcrypt: 10 salt rounds, truncación a 72 bytes

### RB-4: Session Management
- reset-password: Revoca TODAS las sesiones del usuario
- change-password: NO revoca sesiones (el usuario permanece logueado)

### RB-5: Account Lockout
- reset-password exitoso: Limpia failedAttempts=0 y lockedUntil=null
- change-password: NO limpia failedAttempts (es autenticado, ya pasó la validación)

### RB-6: Anti-Enumeration
- forgot-password siempre retorna el mismo mensaje, independientemente de si el email existe
- forgot-password retorna 200 siempre (no 404 para email inexistente)

### RB-7: Rate Limiting
- forgot-password: 3 requests / 10 minutos por IP
- reset-password: 5 requests / 5 minutos por IP
- change-password: ThrottlerGuard global (10 / 60s)

### RB-8: Email Notifications
- forgot-password: Envía email con link al frontend
- reset-password exitoso: Envía email de confirmación
- change-password: NO envía email (usuario está autenticado, acción voluntaria)

### RB-9: Audit
- Log info al completar reset exitoso (userId, timestamp — NO token ni password)
- Log info al completar change exitoso (userId, timestamp)
- PasswordReset.usedAt como registro de auditoría mínimo

---

## 6. Cambios de Backend — Especificación Detallada

### 6.1 Schema (Prisma)

**Archivo:** `prisma/schema.prisma`

```prisma
model PasswordReset {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash")  // RENOMBRAR de token
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime? @default(now()) @map("created_at")
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("password_resets")
}
```

**Migración:** Renombrar columna `token` → `token_hash`, migrar datos existentes hasheando, eliminar columna `token`.

### 6.2 token-hash.util.ts

**Archivo:** `src/modules/auth/utils/token-hash.util.ts`

```typescript
import { createHash } from 'crypto';

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

### 6.3 AuthRepository Interface

**Archivo:** `src/modules/auth/repositories/auth.repository.ts`

Agregar:
```typescript
revokeUnusedPasswordResets(userId: string): Promise<void>;
```

### 6.4 PrismaAuthRepository

**Archivo:** `src/modules/auth/repositories/prisma-auth.repository.ts`

Cambios:
- `createPasswordReset`: Hash token antes de almacenar
- `findPasswordResetByToken`: Buscar por hash
- `revokeUnusedPasswordResets`: Nuevo método

```typescript
import { hashPasswordResetToken } from '../utils/token-hash.util';

async createPasswordReset(data: { userId: string; token: string; expiresAt: Date }) {
  return this.prisma.passwordReset.create({
    data: {
      userId: data.userId,
      tokenHash: hashPasswordResetToken(data.token),
      expiresAt: data.expiresAt,
    },
  });
}

async findPasswordResetByToken(token: string) {
  return this.prisma.passwordReset.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
  });
}

async revokeUnusedPasswordResets(userId: string) {
  await this.prisma.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
```

### 6.5 RequestPasswordResetHandler

**Archivo:** `src/modules/auth/commands/request-password-reset/request-password-reset.handler.ts`

Cambios:
1. Agregar logger (PinoLogger)
2. Revocar tokens anteriores antes de crear nuevo
3. Usar `randomBytes(32)` en vez de `uuid()`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { PasswordResetRequestedEvent } from '../../events/password-reset-requested.event';
import { RequestPasswordResetCommand } from './request-password-reset.command';
import { createModuleLoggerToken } from '../../../../common/logger/create-module-logger';

@Injectable()
export class RequestPasswordResetHandler {
  constructor(
    @Inject(createModuleLoggerToken('Auth'))
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RequestPasswordResetCommand) {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    if (!user) return;

    // Revocar tokens anteriores
    await this.authRepository.revokeUnusedPasswordResets(user.id);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.authRepository.createPasswordReset({
      userId: user.id,
      token,
      expiresAt,
    });

    this.logger.info({ message: 'Password reset requested', userId: user.id });

    this.eventEmitter.emit(
      'auth.password_reset.requested',
      new PasswordResetRequestedEvent(user.email, token),
    );
  }
}
```

### 6.6 ResetPasswordHandler

**Archivo:** `src/modules/auth/commands/reset-password/reset-password.handler.ts`

Cambios:
1. Transacción atómica con `prisma.$transaction`
2. Reset `failedAttempts=0` y `lockedUntil=null`
3. Logger
4. Emitir evento post-reset

```typescript
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { ResetPasswordCommand } from './reset-password.command';
import { PasswordResetCompletedEvent } from '../../events/password-reset-completed.event';

@Injectable()
export class ResetPasswordHandler {
  private readonly logger = new Logger(ResetPasswordHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ResetPasswordCommand) {
    const reset = await this.authRepository.findPasswordResetByToken(
      command.token,
    );

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('Enlace inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(command.password, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: reset.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });

      await tx.userSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.logger.log({
      message: 'Password reset completed',
      userId: reset.userId,
    });

    this.eventEmitter.emit(
      'auth.password_reset.completed',
      new PasswordResetCompletedEvent(reset.userId),
    );
  }
}
```

### 6.7 Event: PasswordResetCompletedEvent

**Nuevo archivo:** `src/modules/auth/events/password-reset-completed.event.ts`

```typescript
import { BaseEvent } from '../../../common/events/base-event';

export class PasswordResetCompletedEvent extends BaseEvent {
  constructor(public readonly userId: string) {
    super('auth.password_reset.completed');
  }
}
```

### 6.8 Listener: SendPasswordResetCompletedEmailListener

**Nuevo archivo:** `src/modules/auth/listeners/send-password-reset-completed-email.listener.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { PasswordResetCompletedEvent } from '../events/password-reset-completed.event';

@Injectable()
export class SendPasswordResetCompletedEmailListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('auth.password_reset.completed')
  async handle(event: PasswordResetCompletedEvent) {
    const user = await this.prisma.user.findUnique({
      where: { id: event.userId },
    });
    if (user) {
      await this.mailService.sendPasswordResetCompletedEmail(user.email);
    }
  }
}
```

### 6.9 MailService

**Archivo:** `src/common/mail/mail.service.ts`

Cambios:
1. Fix link de reset password para usar FRONTEND_URL
2. Agregar método `sendPasswordResetCompletedEmail`

```typescript
async sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
  const link = `${frontendUrl}/reset-password?token=${token}`;
  await this.send({
    to,
    subject: 'Restablece tu contraseña - FollowApp',
    html: `
      <h2>Restablecer contraseña</h2>
      <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Este enlace expira en 1 hora.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
    `,
  });
}

async sendPasswordResetCompletedEmail(to: string): Promise<void> {
  await this.send({
    to,
    subject: 'Tu contraseña ha sido cambiada - FollowApp',
    html: `
      <h2>Contraseña cambiada</h2>
      <p>Tu contraseña ha sido restablecida exitosamente.</p>
      <p>Si no realizaste este cambio, contacta al soporte inmediatamente.</p>
    `,
  });
}
```

### 6.10 envs.ts

**Archivo:** `src/config/envs.ts`

Agregar:
```typescript
FRONTEND_URL: string;
```

Schema:
```typescript
FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
```

### 6.11 ResetPasswordDto

**Archivo:** `src/modules/auth/dto/reset-password.dto.ts`

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
```

### 6.12 AuthController

**Archivo:** `src/modules/auth/controllers/auth.controller.ts`

Cambios:
1. Agregar respuestas HTTP con body
2. Rate limiting diferenciado

```typescript
import { Throttle } from '@nestjs/throttler';

@Post('forgot-password')
@Throttle({ default: { limit: 3, ttl: 600000 } }) // 3 / 10 min
@UseGuards(ThrottlerGuard)
async forgotPassword(
  @Body() dto: RequestPasswordResetDto,
): Promise<{ message: string }> {
  await this.requestPasswordResetHandler.execute(
    new RequestPasswordResetCommand(dto.email),
  );
  return { message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña' };
}

@Post('reset-password')
@Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 / 5 min
@UseGuards(ThrottlerGuard)
async resetPassword(
  @Body() dto: ResetPasswordDto,
): Promise<{ message: string }> {
  await this.resetPasswordHandler.execute(
    new ResetPasswordCommand(dto.token, dto.password),
  );
  return { message: 'Contraseña actualizada exitosamente' };
}
```

### 6.13 AuthModule

**Archivo:** `src/modules/auth/auth.module.ts`

Registrar nuevo listener:
```typescript
import { SendPasswordResetCompletedEmailListener } from './listeners/send-password-reset-completed-email.listener';

providers: [
  // ... existentes
  SendPasswordResetCompletedEmailListener,
],
```

---

## 7. Frontend — Especificación Detallada

### 7.1 Setup

**Tecnologías:** Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui
**Directorio:** `frontend/` en la raíz del repositorio

**Dependencias clave:**
- next@latest, react@latest
- @tanstack/react-query
- zustand
- react-hook-form + @hookform/resolvers + zod
- ky
- lucide-react
- class-variance-authority, clsx, tailwind-merge

### 7.2 Estructura de Directorios (Auth)

```
frontend/src/app/
├── (auth)/
│   ├── layout.tsx              # Layout público (sin sidebar)
│   ├── forgot-password/
│   │   └── page.tsx            # ForgotPasswordPage
│   └── reset-password/
│       └── page.tsx            # ResetPasswordPage
│
├── (dashboard)/
│   ├── layout.tsx              # Layout protegido (sidebar + header)
│   └── profile/
│       └── page.tsx            # ProfilePage (incluye change-password)
```

### 7.3 Componentes Compartidos

#### PasswordInput

**Archivo:** `frontend/src/components/ui/password-input.tsx`

```typescript
// Basado en shadcn/ui Input + Eye/EyeOff icons
// Props: name, label, placeholder, error, register (de RHF)
// Estado: show/hide password toggle
// Accesibilidad: aria-label, aria-describedby para errores
```

### 7.4 Páginas

#### /forgot-password

**Componente:** `ForgotPasswordPage` (Client Component)

**Formulario:**
- Campo: email (required, email validation)
- Botón: "Enviar enlace de restablecimiento" (disabled durante submit)

**Validación Zod:**
```typescript
z.object({
  email: z.string().email("Ingresa un email válido"),
})
```

**API:** `POST /api/auth/forgot-password` { email }

**Estados:**
- `idle`: Formulario visible
- `submitting`: Botón deshabilitado, spinner
- `success`: Mensaje "Si el email está registrado, recibirás un enlace para restablecer tu contraseña" + link "Volver al inicio de sesión"
- `error`: 400 → error de campo. 429 → "Demasiados intentos. Intenta más tarde."

**UX:**
- Siempre mostrar estado success (no revelar si email existe)
- Link a `/login`
- Card centrada en pantalla

#### /reset-password

**Componente:** `ResetPasswordPage` (Client Component)

**Lectura de token:**
```typescript
const searchParams = useSearchParams();
const token = searchParams.get("token");
// Remover token de URL después de leer
useEffect(() => {
  if (token) {
    window.history.replaceState({}, '', '/reset-password');
  }
}, [token]);
```

**Formulario:**
- Campo: password (required, min 8, max 100)
- Campo: confirmPassword (required, must match password)
- Botón: "Restablecer contraseña"

**Validación Zod:**
```typescript
z.object({
  password: z.string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});
```

**API:** `POST /api/auth/reset-password` { token, password }

**Estados:**
- `no-token`: Error "Enlace inválido o no encontrado"
- `idle`: Formulario visible
- `submitting`: Botón deshabilitado, spinner
- `success`: Mensaje "Contraseña restablecida exitosamente" + auto-redirect a `/login` en 3 segundos + botón "Ir al inicio de sesión"
- `error`: 400 → error de campo. 401 → "El enlace ha expirado o es inválido". 429 → "Demasiados intentos."

**UX:**
- Si no hay token en URL → mostrar error inmediatamente
- Mostrar contraseñas con toggle show/hide
- Confirmación de coincidencia en tiempo real
- Auto-redirect tras éxito

#### /profile (change-password)

**Componente:** `ProfilePage` (Client Component, autenticado)

**Formulario:**
- Campo: currentPassword (required)
- Campo: newPassword (required, min 8, max 100)
- Campo: confirmNewPassword (required, must match newPassword)
- Botón: "Actualizar contraseña"

**Validación Zod:**
```typescript
z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: z.string()
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres"),
  confirmNewPassword: z.string(),
})
.refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmNewPassword"],
})
.refine(data => data.currentPassword !== data.newPassword, {
  message: "La nueva contraseña debe ser diferente a la actual",
  path: ["newPassword"],
});
```

**API:** `POST /api/auth/change-password` { currentPassword, newPassword }

**Estados:**
- `idle`: Formulario visible
- `submitting`: Botón deshabilitado
- `success`: Toast "Contraseña actualizada exitosamente" + limpiar formulario
- `error`: 400 → error de campo. 401 → "Contraseña actual incorrecta".

**UX:**
- Sección dentro de la página de perfil
- No redirigir (el usuario sigue autenticado)
- Limpiar formulario tras éxito

### 7.5 API Client

**Archivo:** `frontend/src/lib/api.ts`

```typescript
import ky from "ky";

export const api = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  hooks: {
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          // No redirigir en forgot-password y reset-password (públicos)
          const url = _request.url;
          if (!url.includes('forgot-password') && !url.includes('reset-password')) {
            window.location.href = '/login';
          }
        }
      },
    ],
  },
});

export const authApi = {
  forgotPassword: (email: string) =>
    api.post("auth/forgot-password", { json: { email } }).json<{ message: string }>(),

  resetPassword: (token: string, password: string) =>
    api.post("auth/reset-password", { json: { token, password } }).json<{ message: string }>(),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("auth/change-password", { json: { currentPassword, newPassword } }).json<{ message: string }>(),
};
```

### 7.6 Hooks

**Archivo:** `frontend/src/hooks/use-password-reset.ts`

```typescript
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api";

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}
```

---

## 8. Tests — Especificación

### 8.1 request-password-reset.handler.spec.ts

| Caso | Descripción |
|---|---|
| Email no existe | No crea token, no emite evento, retorna void |
| Email existe | Crea token, revoca anteriores, emite evento con token |
| Email existe con tokens anteriores | Tokens anteriores se marcan como used |
| Múltiples requests | Cada uno crea un token nuevo y revoca los anteriores |

### 8.2 reset-password.handler.spec.ts

| Caso | Descripción |
|---|---|
| Token inválido | 401 "Enlace inválido o expirado" |
| Token expirado | 401 |
| Token ya usado | 401 |
| Token válido | Password actualizada, token marcado usado, sesiones revocadas, failedAttempts=0, lockedUntil=null |
| Transacción falla | Ningún cambio se aplica |
| Password muy corto | 400 (validación DTO) |

### 8.3 auth.controller.e2e.ts (extensión)

| Caso | Descripción |
|---|---|
| Flujo completo forgot→reset | Envía forgot, obtiene token, ejecuta reset, puede loguearse con nueva password |
| Rate limit forgot | Más de 3 requests → 429 |
| Rate limit reset | Más de 5 requests → 429 |

---

## 9. Decisiones Pendientes (resueltas)

| # | Decisión | Resolución |
|---|---|---|
| PD-1 | Ruta frontend reset password | `/reset-password?token=xxx` |
| PD-2 | Revocar tokens anteriores | Sí, nuevos requests invalidan anteriores |
| PD-3 | Idioma mensajes | Español (consistente con email) |
| PD-4 | Email confirmación post-reset | Sí, siempre |
| PD-5 | Sesiones post-reset | Revocar todas (implementado) |
| PD-6 | Orden de implementación | Backend primero → Frontend |
| PD-7 | Token format | randomBytes(32).toString('hex') — 64 chars |

---

## 10. Orden de Ejecución

```
Fase 1 — Backend Security Fixes
├── 1A: Schema migration (token → tokenHash)
├── 1B: token-hash.util.ts
├── 1C: Repository (hash + find + revoke)
├── 1D: reset-password.handler (transacción + failedAttempts)
├── 1E: request-password-reset.handler (revocar + logger + randomBytes)
└── 1F: Verificar compilar: npm run build

Fase 2 — Backend Functional Fixes
├── 2A: envs.ts (FRONTEND_URL)
├── 2B: mail.service.ts (fix link + email confirmación)
├── 2C: Event + Listener (PasswordResetCompletedEvent)
├── 2D: ResetPasswordHandler (emitir evento)
├── 2E: DTOs (MaxLength + IsUUID)
├── 2F: Controller (respuestas + rate limiting)
├── 2G: Unificar idioma mensajes
├── 2H: AuthModule (registrar listener)
└── 2I: Verificar compilar: npm run build

Fase 3 — Frontend Setup
├── 3A: create-next-app + dependencias
├── 3B: shadcn/ui init + componentes base
├── 3C: API client (ky)
├── 3D: TanStack Query provider
├── 3E: Estructura de directorios
└── 3F: Verificar: npm run build

Fase 4 — Frontend Auth Pages
├── 4A: PasswordInput component
├── 4B: /forgot-password page
├── 4C: /reset-password page
├── 4D: /profile change-password section
├── 4E: Hooks (useForgotPassword, useResetPassword, useChangePassword)
└── 4F: Verificar: npm run build

Fase 5 — Tests
├── 5A: request-password-reset.handler.spec.ts
├── 5B: reset-password.handler.spec.ts
├── 5C: E2E test (flujo completo)
└── 5D: Verificar: npm test

Fase 6 — Limpieza
├── 6A: Token cleanup (al crear nuevo token o cron)
├── 6B: Seed update (si hay nuevos permissions)
└── 6C: Documentación
```

---

## 11. Criterios de Aceptación

### Backend

- [ ] Token de reset se almacena como hash SHA-256 en BD
- [ ] Token de un solo uso por usuario
- [ ] Transacción atómica en reset-password
- [ ] failedAttempts y lockedUntil se limpian tras reset exitoso
- [ ] Sesiones se revocan tras reset exitoso
- [ ] Email de confirmación se envía tras reset exitoso
- [ ] Link del email apunta a FRONTEND_URL
- [ ] Rate limiting diferenciado por endpoint
- [ ] Mensajes de error en español
- [ ] Controllers retornan body con mensaje
- [ ] DTOs validan Longitud (8-100)
- [ ] Tests unitarios pasan
- [ ] `npm run build` sin errores

### Frontend

- [ ] /forgot-password: Formulario funcional con validación
- [ ] /forgot-password: Siempre muestra mismo mensaje (anti-enumeración)
- [ ] /reset-password: Lee token de URL y lo remueve
- [ ] /reset-password: Formulario con password + confirmación
- [ ] /reset-password: Auto-redirect a /login tras éxito
- [ ] /reset-password: Muestra error si token inválido/expirado
- [ ] /profile: Change password funcional (autenticado)
- [ ] /profile: No revoca sesión (el usuario permanece logueado)
- [ ] PasswordInput con toggle show/hide
- [ ] Loading states en todos los formularios
- [ ] Error messages inline en cada campo
- [ ] `npm run build` sin errores
