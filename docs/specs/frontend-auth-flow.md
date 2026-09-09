# Especificación: Autenticación Real del Frontend (Auth Flow)

> **Autor:** PM — Historia Clínica Digital Vehicular
> **Fecha:** 2026-09-09
> **Estado:** Aprobado para implementación
> **Basado en:** D-001 (HttpOnly Cookies), D-025 (Error envelope), plan-frontend.md Fase 1

---

## 1. Problema

El frontend (`frontend/`) tiene un login stub que **viola D-001**: guarda `access_token` en `localStorage` y espera el token en el body de la respuesta, cuando el backend real setea **cookies HttpOnly** y nunca devuelve tokens en el body para clientes browser.

No existe gestión real de sesión:

- No se carga la sesión del usuario al inicio.
- No hay refresh automático del access token.
- No hay logout funcional.
- No hay protección de rutas (middleware).
- No hay página de registro ni de verificación de email.

## 2. Objetivo

Implementar el flujo de autenticación real del frontend respetando D-001:

1. Login funcional con cookies HttpOnly (sin administrar tokens via JS).
2. Sesión persistente con carga de `/auth/me`.
3. Refresh automático del access token (sin fricción para el usuario).
4. Logout funcional.
5. Protección de rutas (middleware).
6. Página de registro (register + verificación de email).

## 3. Actores

| Actor | Rol |
|---|---|
| **Usuario no autenticado** | Accede a /login, /register, /forgot-password, /reset-password, /verify-email |
| **Usuario autenticado** | Accede a /dashboard, /profile y rutas protegidas |

## 4. Contratos Backend (verificados en código)

### POST /auth/login
```text
Request:  { email: string, password: string }
Response: 201
          Set-Cookie: access_token (HttpOnly, SameSite=lax/strict)
          Set-Cookie: refresh_token (HttpOnly, SameSite=strict)
          Body: { user: { id, email, firstName, lastName, phone, avatarUrl, language, status, emailVerifiedAt, createdAt, updatedAt, roles[] } }
Errores:  401 → code INVALID_CREDENTIALS (mensaje genérico)
```

### GET /auth/me
```text
Auth: cookie access_token
Response: 200
          { id, email, firstName, lastName, avatarUrl, language, status,
            isVehicleOwner, roles[], workshopMemberships[], ... }
Errores:  401 (sin cookie o token inválido)
```

### POST /auth/refresh
```text
Auth: cookie refresh_token
Response: 201
          Set-Cookie: access_token (nuevo)
          Set-Cookie: refresh_token (nuevo, rotación)
          Body: { success: true, impersonated: boolean }
Errores:  401 (refresh inválido/expirado)
```

### POST /auth/logout
```text
Auth: cookie refresh_token
Response: 201
          Set-Cookie: access_token (eliminada)
          Set-Cookie: refresh_token (eliminada)
          Body: { message: string }
```

> **Nota de contrato actualizado (D-031, D-032):** los POST responden **201** (default NestJS, verificado E2E — el frontend maneja cualquier 2xx). En `roles[]`, el backend expone `{ id, type, name, permissions[] }` (D-031: `type`, no `code`). `POST /auth/register` con email duplicado responde **409 CONFLICT** con mensaje "Ya existe una cuenta con este email" (D-032).

### POST /auth/register
```text
Request:  { firstName: string, lastName: string, email: string, password: string }
Response: 201 (crea usuario + envía email de verificación)
Errores:  409 → code CONFLICT "Ya existe una cuenta con este email" (D-032)
```

### GET /auth/verify-email
```text
Query: token
Response: 200 (texto/confirmación; la página frontend /verify-email consume este endpoint)
```

### Contrato CORS confirmado
Backend ya soporta `cors: { origin: CORS_ORIGIN, credentials: true }`. El frontend usa `credentials: "include"`. En producción, frontend y backend deben estar bajo el **mismo registrable domain** (ej. `app.hcdv.com` y `api.hcdv.com`) para que SameSite=strict funcione con el refresh token.

---

## 5. User Journeys

### 5.1 Login

```
Actor: Usuario no autenticado
  ↓
Contexto: Visita /login (o es redirigido desde una ruta protegida)
  ↓
Acción: Ingresa email + contraseña, presiona "Iniciar sesión"
  ↓
Sistema:
  1. Valida formato (email válido, password requerida)
  2. POST /auth/login (credentials: include)
  3. Backend setea cookies HttpOnly
  4. Frontend carga GET /auth/me para obtener la sesión
  5. Redirige a la página originalmente solicitada (query ?next=) o /dashboard
  ↓
Resultado: Sesión activa, cookies HttpOnly, usuario redirigido
```

**Errores:**
| Código | Mensaje UI |
|---|---|
| 401 INVALID_CREDENTIALS | "Email o contraseña incorrectos" |
| 429 | "Demasiados intentos. Intenta más tarde." |
| 500 | "Error interno del servidor. Intenta más tarde." |
| Usuario no verificado | Ver D-024 nota: login uniforme — mostrar error genérico |

### 5.2 Carga de sesión / Bootstrapping

```
Actor: Usuario con cookies válidas
  ↓
Contexto: Abre la app (cualquier ruta)
  ↓
Sistema:
  1. AuthProvider (client) se monta con status "loading"
  2. Llama GET /auth/me con credentials: include
  3. 200 → status "authenticated", guarda user en estado global
  4. 401 → status "unauthenticated" (sin sesión)
  ↓
Resultado: UI sabe si hay sesión y muestra el usuario
```

### 5.3 Refresh automático

```
Actor: Usuario autenticado con access token expirado
  ↓
Contexto: Realiza una llamada API protegida
  ↓
Sistema:
  1. API client recibe 401 (access token expirado)
  2. Interceptor llama POST /auth/refresh (usa refresh_token cookie)
  3. Éxito → reintenta la request original con las nuevas cookies
  4. Falla (401) → marca sesión como unauthenticated, redirige a /login
  5. Evita loops: el refresh mismo nunca intenta refresh recursivo; 401 de refresh → logout
  ↓
Resultado: El usuario no percibe la expiración del access token
```

### 5.4 Logout

```
Actor: Usuario autenticado
  ↓
Contexto: Presiona "Cerrar sesión" en el header del dashboard
  ↓
Sistema:
  1. POST /auth/logout (credentials: include)
  2. Backend revoca refresh token + elimina cookies
  3. Frontend limpia estado de sesión
  4. Redirige a /login
  ↓
Resultado: Sesión terminada en servidor y cliente
```

### 5.5 Protección de rutas

```
Actor: Usuario no autenticado
  ↓
Contexto: Intenta acceder a /profile (o cualquier ruta protegida)
  ↓
Sistema:
  1. Middleware (Next.js) verifica existencia de cookie access_token
  2. No hay cookie → redirige a /login?next=/profile
  3. Hay cookie → permite el acceso
  4. La verificación de UI es navegación; la SEGURIDAD real es backend (401/403)
  ↓
Resultado: Ruta protegida redirige al login preservando destino
```

---

## 6. Reglas de Negocio / Requisitos Funcionales

### RF-1: Cookies HttpOnly (D-001)
- El frontend **nunca** administra tokens desde JavaScript.
- `localStorage`/`sessionStorage` NO se usan para access/refresh tokens.
- Los tokens viven exclusivamente en cookies HttpOnly seteadas por el backend.
- Todo request autenticado usa `credentials: "include"`.

### RF-2: Sesión global
- Un AuthProvider (client-side) expone:
  ```text
  status:   'loading' | 'authenticated' | 'unauthenticated'
  user:     SessionUser | null
  ```
- La carga de sesión ocurre al montar el provider (una sola vez por montaje).
- `GET /auth/me` es la fuente de la sesión user.

### RF-3: Refresh automático (sin fricción)
- Ante 401 en una request autenticada: un único intento de `POST /auth/refresh` y reintento de la request (máximo 1 vez).
- `POST /auth/refresh` que devuelve 401 → sesión unauthenticated → redirect `/login?next=<ruta>`.
- Filtros: las llamadas a `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/register`, `/auth/verify-email` **no** disparan el interceptor de refresh (nunca refrescar para endpoints públicos).

### RF-4: Redirección post-login
- El login preserva la ruta solicitada: `/login?next=/profile` → login exitoso → redirect `/profile`.
- Si no hay `next`, redirige a `/dashboard`.

### RF-5: Middleware de rutas
- Rutas protegidas: `(dashboard)/*` (es decir `/dashboard`, `/profile`, y futuras del grupo).
- Sin cookie `access_token` → redirect `/login?next=<path>`.
- Rutas públicas con sesión activa: `/login` y `/register` redirigen a `/dashboard` si ya hay cookie (UX).
- El middleware **no** valida el JWT (edge, sin secret compartido); es navegación. El enforcement es backend.

### RF-6: Logout
- Botón "Cerrar sesión" en el header del dashboard (`UserNav`).
- Llama `POST /auth/logout`, limpia estado, redirige a `/login`.

### RF-7: Registro
- Form: firstName, lastName, email, password, confirmPassword.
- Validación Zod (mínimos: 2/2/email/8/coinciden).
- Éxito → pantalla "Revisa tu email para verificar la cuenta" (no auto-login).

### RF-8: Verificación de email
- Página `/verify-email` lee `?token=...` y llama `GET /auth/verify-email?token=...`.
- Éxito → mensaje confirmación + link a login.
- Error → mensaje de enlace inválido/expirado + opción reenviar si aplica.

### RF-9: Estados de carga
- Todos los botones submit con spinner + disabled.
- AuthProvider con splash/loading mientras carga sesión (evitar flash de login).

### RF-10: Seguridad
- No loggear credenciales.
- No exponer tokens en la UI ni en el estado.
- Cuando el backend devuelva el error envelope D-025 (`{ code }`), la UI debe mapear por código.

---

## 7. Alcance (Dentro / Fuera)

### Dentro (esta iteración)
- AuthProvider (sesión global) + hooks `useAuth`.
- API client auth real: `login`, `logout`, `me`, `register`, `verifyEmail` + interceptor refresh.
- Login page (reemplaza stub).
- Register page.
- Verify-email page.
- Middleware de rutas (protección + redirect preserving next).
- Dashboard layout mejorado: header con UserNav (nombre, avatar inicial, logout).
- `/dashboard` home mínima (bienvenida con datos de sesión).
- `.env.example` — documentar `NEXT_PUBLIC_API_URL`.

### Fuera (próximas iteraciones / NO romper)
- Sidebar completo y navegación completa del dashboard (Fase 2 del plan).
- Register backend changes (no requeridos — backend ya expone).
- Active Context switcher (D-004/D-021) — NO implementar.
- Roles UI / admin nav condicional — solo lo mínimo para mostrar sesión.
- Impersonation UX (D-016) — fuera; no romper existente.

---

## 8. Criterios de Aceptación

### Login
- [ ] `POST /auth/login` con `credentials: "include"` — sin tokens en localStorage.
- [ ] Al iniciar sesión, `GET /auth/me` carga y muestra el usuario.
- [ ] Redirect respeta `?next=`; default `/dashboard`.
- [ ] 401 → mensaje "Email o contraseña incorrectos".
- [ ] 429 → mensaje de rate limit.

### Sesión / Refresh
- [ ] Al abrir la app, AuthProvider carga sesión desde `/auth/me`.
- [ ] Access token expirado → refresh automático + reintento (sin acción del usuario).
- [ ] Refresh falla → redirect `/login?next=...`.
- [ ] Endpoints públicos no disparan refresh.

### Logout
- [ ] "Cerrar sesión" llama `POST /auth/logout`, limpia estado, redirige `/login`.
- [ ] Tras logout, `/auth/me` devuelve 401 y la UI muestra unauthenticated.

### Rutas
- [ ] `/profile` sin cookie → `/login?next=/profile`.
- [ ] `/login` con cookie → `/dashboard`.
- [ ] `/register` con cookie → `/dashboard`.

### Register / Verify
- [ ] Registro exitoso muestra pantalla de verificación de email.
- [ ] `/verify-email?token=...` muestra confirmación o error según respuesta.

### Build / Calidad
- [ ] `npm run build` sin errores (frontend).
- [ ] Sin TypeScript errors.
- [ ] Sin referencias a localStorage/sessionStorage para tokens.

---

## 9. Cambios Técnicos Sugeridos (para análisis del Tech Lead)

> El PM define QUÉ y POR QUÉ. El Tech Lead define CÓMO. Estas son sugerencias de producto, no imposición técnica.

| Área | Sugerencia | Nota |
|---|---|---|
| AuthProvider | Context/estado global con `status/user` | Alternativa: zustand (ya en plan). Decisión Tech Lead. |
| Refresh interceptor | Hook en ky (`beforeRetry` o wrapper) que evite recursión y no aplique a públicos | Evaluar comportamiento correcto de ky. |
| Middleware | `middleware.ts` edge: leer `request.cookies.get('access_token')` | HttpOnly cookies son accesibles server-side. Matcher en rutas (dashboard). |
| next-auth | **No necesario** para este flujo con cookies HttpOnly backend (D-001). Autenticación es del backend. | El plan-frontend.md proponía next-auth; dado D-001, evaluar si agrega valor o duplica complejidad. |
| Ruta dashboard | Crear `/dashboard` mínima | No existe aún; login redirige ahí. |

---

## 10. Dependencias

- D-001 (cookies HttpOnly) — base del diseño.
- D-025 (error envelope) — los códigos deben mapearse en la UI.
- Backend auth ya implementado: login/refresh/logout/me/register/verify-email.
- CORS ya habilitado en backend (`credentials: true`).

---

## 11. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Cookies SameSite=strict cross-domain en producción | Alta | Frontend/backend bajo mismo registrable domain; verificar en staging. |
| Loop de refresh en 401 masivos | Media | Máximo 1 intento; nunca refresh para públicos; disabled mientras refreshing. |
| Flash de login al cargar sesión | Media | AuthProvider retorna splash/loading hasta status resuelto. |
| Login stub previo con localStorage | Media | Eliminar completamente; limpiar cualquier token residual en el código. |