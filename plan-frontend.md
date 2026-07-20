# Plan de Implementación — Frontend

> Basado en `api-follow-app` (NestJS + Prisma + PostgreSQL)
> Fecha: 2026-07-20

---

## 1. Stack Tecnológico Recomendado

| Capa              | Tecnología                                                                          | Justificación                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | **Next.js 15+** (App Router)                                                        | React server components, streaming, layouts anidados, soporte nativo de TypeScript. Rendimiento superior a React SPA puro                    |
| Lenguaje          | **TypeScript 5** (strict)                                                           | Tipado fuerte, detección temprana de errores, mejor DX                                                                                       |
| Estilado          | **Tailwind CSS 4**                                                                  | CSS utility-first, zero runtime, purga automática de estilos no usados, bundle pequeño                                                       |
| UI Components     | **shadcn/ui** (Radix UI primitives)                                                 | Componentes accesibles, sin dependencias pesadas, copia local (personalizable), tree-shakeable                                               |
| Estado global     | **Zustand** + **TanStack Query**                                                    | Zustand para estado global UI (menos boilerplate que Redux), TanStack Query para cache de server state (fetch, caching, refetch, paginación) |
| Formularios       | **React Hook Form** + **Zod**                                                       | Renders mínimos, validación schema-based en cliente y servidor, tipado automático                                                            |
| HTTP Client       | **fetch nativo** + **ky** (wrapper ligero)                                          | Sin axios (más pesado). Ky: 2.5KB, timeout/retry nativos, mejor manejo de errores                                                            |
| Autenticación     | **next-auth** v5 (Auth.js)                                                          | JWT + session server-side, middleware automático, soporte refresh tokens                                                                     |
| Tablas            | **TanStack Table**                                                                  | Headless, virtualización, ordenamiento, filtros, selección. Sin UI pesada                                                                   |
| Fechas            | **dayjs**                                                                           | 2KB vs moment.js 70KB. Inmutable, plugins modulares                                                                                          |
| Iconos            | **Lucide React**                                                                    | Tree-shakeable, consistente con shadcn/ui                                                                                                    |
| Tooltips/Popovers | **Radix UI Tooltip + Popover**                                                      | Ya incluidos en shadcn/ui                                                                                                                   |
| Testing           | **Vitest** + **Testing Library**                                                    | Rápido (esbuild), API compatible con Jest, mejor DX                                                                                         |
| Bundle Analyzer   | **@next/bundle-analyzer**                                                           | Control de tamaño de bundle en cada build                                                                                                    |
| Linter/Formatter  | **Biome**                                                                           | Unifica prettier + eslint, 10x más rápido en Rust, configuración mínima                                                                      |

**Justificación de performance:**
- No se elige Vite/SPA porque una SPA pura requiere JS para renderizar la primera pantalla (worse FCP/LCP). Next.js con server components envía HTML estático sin JS.
- No se elige Redux porque para server state (API) TanStack Query es superior en caching/dedup/refetch. Redux solo agrega boilerplate innecesario.
- No se elige Chakra/MUI/Ant Design porque agregan 100KB+ de CSS/JS no utilizado. shadcn/ui copia solo el código que usas.
- No se elige moment.js porque dayjs ocupa ~3% de su tamaño con API idéntica.

---

## 2. Estructura de Directorios Propuesta

```
frontend/
├── .env.local                        # Variables de entorno
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── biome.json
├── package.json
│
├── public/
│   ├── images/
│   └── icons/
│
├── src/
│   ├── app/                          # App Router (Next.js 15)
│   │   ├── layout.tsx                # Layout raíz (providers, font)
│   │   ├── page.tsx                  # Landing / Home
│   │   ├── loading.tsx               # Suspense global
│   │   ├── error.tsx                 # Error boundary global
│   │   ├── not-found.tsx
│   │   │
│   │   ├── (auth)/                   # Grupo de rutas públicas (sin sidebar)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   └── verify-email/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (dashboard)/              # Grupo de rutas protegidas (con sidebar)
│   │   │   ├── layout.tsx            # Sidebar + header + providers
│   │   │   ├── page.tsx              # Dashboard / Home
│   │   │   │
│   │   │   ├── vehicles/
│   │   │   │   ├── page.tsx          # Lista de vehículos
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Registrar vehículo
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Detalle vehículo
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx  # Editar vehículo
│   │   │   │
│   │   │   ├── workshops/
│   │   │   │   ├── page.tsx          # Lista de talleres
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Crear taller
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Detalle taller
│   │   │   │       ├── members/
│   │   │   │       │   └── page.tsx  # Miembros
│   │   │   │       └── settings/
│   │   │   │           └── page.tsx  # Configuración
│   │   │   │
│   │   │   ├── maintenance/
│   │   │   │   ├── appointments/
│   │   │   │   │   ├── page.tsx      # Lista de turnos
│   │   │   │   │   └── new/
│   │   │   │   │       └── page.tsx  # Nuevo turno
│   │   │   │   ├── work-orders/
│   │   │   │   │   ├── page.tsx      # Lista de OT
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx  # Detalle OT
│   │   │   │   ├── service-records/
│   │   │   │   │   └── page.tsx      # Historial servicios
│   │   │   │   └── estimates/
│   │   │   │       ├── page.tsx      # Presupuestos
│   │   │   │       └── new/
│   │   │   │           └── page.tsx  # Nuevo presupuesto
│   │   │   │
│   │   │   ├── admin/                # Solo super_admin / admin
│   │   │   │   ├── users/
│   │   │   │   │   └── page.tsx      # Gestión de usuarios
│   │   │   │   └── roles/
│   │   │   │       └── page.tsx      # Roles del sistema
│   │   │   │
│   │   │   └── profile/
│   │   │       └── page.tsx          # Perfil / cambio contraseña
│   │   │
│   │   └── api/                      # API routes (solo para server-side)
│   │       └── auth/
│   │           └── [...nextauth]/
│   │               └── route.ts      # next-auth handler
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── table.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── ...
│   │   │
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── sidebar-nav.tsx
│   │   │   └── user-nav.tsx
│   │   │
│   │   ├── vehicles/
│   │   │   ├── vehicle-table.tsx
│   │   │   ├── vehicle-form.tsx
│   │   │   ├── vehicle-card.tsx
│   │   │   ├── mileage-form.tsx
│   │   │   └── transfer-form.tsx
│   │   │
│   │   ├── workshops/
│   │   │   ├── workshop-table.tsx
│   │   │   ├── workshop-form.tsx
│   │   │   ├── member-list.tsx
│   │   │   ├── invite-form.tsx
│   │   │   ├── branch-form.tsx
│   │   │   └── business-hours-form.tsx
│   │   │
│   │   ├── maintenance/
│   │   │   ├── appointment-table.tsx
│   │   │   ├── appointment-form.tsx
│   │   │   ├── work-order-table.tsx
│   │   │   ├── work-order-detail.tsx
│   │   │   ├── service-record-form.tsx
│   │   │   ├── estimate-table.tsx
│   │   │   └── estimate-form.tsx
│   │   │
│   │   ├── admin/
│   │   │   ├── user-table.tsx
│   │   │   ├── role-table.tsx
│   │   │   └── assign-role-dialog.tsx
│   │   │
│   │   └── shared/
│   │       ├── pagination.tsx
│   │       ├── empty-state.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── search-input.tsx
│   │       ├── status-badge.tsx
│   │       └── loading-skeleton.tsx
│   │
│   ├── hooks/
│   │   ├── use-vehicles.ts           # TanStack Query hooks
│   │   ├── use-workshops.ts
│   │   ├── use-maintenance.ts
│   │   ├── use-users.ts
│   │   ├── use-auth.ts
│   │   ├── use-debounce.ts
│   │   └── use-media-query.ts
│   │
│   ├── lib/
│   │   ├── api.ts                    # Cliente HTTP (ky) configurado
│   │   ├── auth.ts                   # next-auth config
│   │   ├── validations.ts            # Schemas Zod reutilizables
│   │   ├── utils.ts                  # Utilidades (cn, formatDate, etc)
│   │   └── constants.ts              # URLs, páginado, etc
│   │
│   ├── providers/
│   │   ├── session-provider.tsx       # next-auth SessionProvider
│   │   ├── query-provider.tsx         # TanStack QueryClientProvider
│   │   └── theme-provider.tsx         # next-themes (dark mode)
│   │
│   └── types/
│       ├── api.ts                    # Tipos de respuesta de la API
│       ├── vehicle.ts
│       ├── workshop.ts
│       ├── maintenance.ts
│       ├── user.ts
│       └── auth.ts
```

---

## 3. Plan de Implementación por Fases

### Fase 0 — Setup del Proyecto (1 día)

**Objetivo:** Proyecto funcionando con todas las herramientas configuradas.

```
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir
```

**Tareas concretas:**
1. Inicializar Next.js + TypeScript + Tailwind
2. Configurar Biome (`npm init @biomejs/biome`)
3. Instalar dependencias base:
   - `next-auth@beta` `@auth/prisma-adapter`
   - `@tanstack/react-query` `@tanstack/react-table`
   - `zustand`
   - `react-hook-form` `@hookform/resolvers` `zod`
   - `ky`
   - `dayjs`
   - `lucide-react`
   - `class-variance-authority` `clsx` `tailwind-merge` (utilidades shadcn)
4. Inicializar shadcn/ui (`npx shadcn@latest init`)
   - Agregar componentes base: Button, Input, Label, Card, Badge, Dialog, Table, DropdownMenu, Avatar, Toast, Skeleton
5. Configurar variables de entorno:
   - `NEXT_PUBLIC_API_URL=http://localhost:3001/api`
   - `NEXTAUTH_URL=http://localhost:3000`
   - `NEXTAUTH_SECRET=...`
6. Crear la estructura de directorios completa (archivos placeholder)
7. Configurar next-auth en `src/lib/auth.ts` y `src/app/api/auth/[...nextauth]/route.ts`
8. Configurar TanStack Query provider en `src/providers/query-provider.tsx`
9. Crear cliente HTTP en `src/lib/api.ts` con:
   - Base URL desde ENV
   - Header `Authorization: Bearer <token>` automático
   - Timeout 10s
   - Retry en 401 → refresh token → retry request
   - Manejo centralizado de errores (toast en errores 4xx/5xx)
10. Verificar build exitoso: `npm run build`

**Prompt de implementación para asistente de código:**

> Crear un proyecto Next.js 15 con App Router, TypeScript strict, Tailwind CSS y shadcn/ui. Configurar next-auth v5 con JWT strategy que consuma el backend NestJS en `http://localhost:3001/api/auth/login` para login y `http://localhost:3001/api/auth/me` para session. Crear un cliente HTTP con `ky` que incluya automáticamente el token JWT en cada request, maneje refresh de tokens y muestre toasts en errores. Configurar TanStack Query con QueryClientProvider en el layout raíz. Implementar la estructura de carpetas completa con layouts separados para auth (login/register) y dashboard (sidebar + header). Verificar que `npm run build` compile sin errores.

---

### Fase 1 — Auth (2 días)

**Objetivo:** Login, registro, recuperación de contraseña, sesión persistente.

**Tareas:**
1. Página de Login con formulario (React Hook Form + Zod)
   - Email + contraseña
   - Validación client-side
   - Error handling (credenciales inválidas, usuario inactivo)
   - Botón deshabilitado durante submit
   - Link a "Olvidé mi contraseña" y "Registrarse"
2. Página de Register
   - Campos: firstName, lastName, email, password, confirmPassword
   - Validación: email válido, password >= 8 chars, passwords coinciden
   - Mensaje de éxito: "Revisa tu email para verificar la cuenta"
3. Páginas de Forgot Password / Reset Password
   - Forgot: solo email, llama a `POST /auth/forgot-password`
   - Reset: token desde query param, nuevo password
4. Página de Verify Email
   - Lee token de query param, llama a `GET /auth/verify-email`
   - Muestra mensaje de éxito/error
5. Middleware de protección de rutas (`src/middleware.ts`)
   - Redirige a `/login` si no hay sesión
   - Redirige a `/dashboard` si ya hay sesión en páginas de auth
6. Componente `UserNav` en header con logout y acceso a perfil
7. Manejo de expiración de sesión: cuando el backend responde 401, redirigir a login

**Consideraciones de UX:**
- Los formularios deben mostrar errores inline debajo de cada campo
- Submit button con estado "Cargando..." (spinner + disabled)
- Proteger contra múltiples envíos (disable button con `isSubmitting` de RHF)
- Los inputs de password deben tener toggle mostrar/ocultar
- Redirect a la página que intentaba acceder después de login exitoso

**Prompt de implementación:**

> Implementar flujo completo de autenticación:
> 1. Login: formulario con email + password, validación Zod, submit a `POST /api/auth/login` del backend, redirigir a `/dashboard` en éxito, mostrar error en caso contrario.
> 2. Registro: formulario con firstName, lastName, email, password, confirmPassword. Validación Zod. Submit a `POST /api/auth/register`. Mostrar pantalla de éxito con mensaje de verificación de email.
> 3. Forgot/Reset Password: `POST /api/auth/forgot-password` y `POST /api/auth/reset-password`. Validación de token.
> 4. Verify Email: `GET /api/auth/verify-email?token=...`. Mostrar resultado.
> 5. Configurar next-auth v5 con JWT strategy, credentials provider que llama al login del backend, session callback que devuelve id + email + nombre. Configurar middleware de Next.js para proteger rutas de dashboard y redirigir a login si no hay sesión válida.
> 6. Implementar cliente HTTP `ky` en `src/lib/api.ts` que lea el token de next-auth, lo mande como Bearer, y maneje automáticamente refrescos y errores 401.
> 7. El header del dashboard debe mostrar nombre del usuario y botón de logout que llama a `POST /api/auth/logout` del backend y destruye la sesión de next-auth.

---

### Fase 2 — Dashboard y Layout Base (1 día)

**Objetivo:** Layout funcional con sidebar, header, navegación, responsive.

**Tareas:**
1. Layout del dashboard con sidebar colapsable
   - Logo + nombre de la app arriba
   - Navegación principal: Dashboard, Vehículos, Talleres, Mantenimiento, Admin
   - Los items de Admin solo visibles para usuarios con rol `super_admin` o `admin`
   - Indicador de ruta activa (highlight)
   - Colapsable a íconos (solo en desktop) o drawer (mobile)
2. Header con breadcrumbs y UserNav
3. Sidebar responsivo
   - Desktop: sidebar fijo a la izquierda (~256px expandido, ~64px colapsado)
   - Mobile: drawer overlay con backdrop
   - Persistir estado colapsado en localStorage
4. Página de Dashboard principal
   - Cards con métricas: vehículos registrados, próximos turnos, órdenes activas
   - Tabla de próximos appointments (próximos 7 días)
   - Últimos vehículos registrados
5. Componente `StatusBadge` reutilizable para todos los estados del sistema
   - Mapear colores según estado (pendiente=amarillo, activo=verde, cancelado=rojo, etc.)

**Consideraciones de UX:**
- Sidebar con animaciones suaves (CSS transitions, no librerías de animación)
- En mobile, el sidebar debe ocupar toda la altura y abrirse/cerrarse con transición
- Los breadcrumbs deben reflejar la ruta actual y ser clickeables
- Las métricas del dashboard deben mostrar skeletons mientras cargan

**Prompt de implementación:**

> Crear layout de dashboard con:
> - Sidebar izquierdo colapsable con navegación: Dashboard, Vehículos, Talleres, Mantenimiento, Admin (Admin condicional según rol).
> - Header superior con breadcrumbs dinámicos y UserNav (nombre + avatar + logout).
> - Responsive: sidebar como drawer en mobile, colapsable a íconos en desktop.
> - Página de Dashboard con cards de métricas (vehículos, turnos, OT activas) usando TanStack Query para fetch, y tabla de próximos appointments.
> - Implementar StatusBadge component que mapee estados del backend a colores (ej: pending → yellow, active → green, cancelled → red, etc.).
> - Usar `next-themes` para dark mode toggle en el header.
> - Todos los datos del dashboard deben cargar con skeleton loading states.

---

### Fase 3 — Módulo Vehículos (3 días)

**Objetivo:** CRUD completo + transferencia + kilometraje + acceso compartido.

**Tareas:**
1. Lista de vehículos (`GET /vehicles`)
   - Tabla con columnas: Patente, Marca/Modelo, Año, Color, Propietario, Acciones
   - Paginación (20 por página)
   - Búsqueda por patente (debounced 300ms)
   - Ordenamiento por columna
   - Action buttons: Ver, Editar, Eliminar (con confirmación)
2. Registrar vehículo (`POST /vehicles`)
   - Formulario con: Patente (obligatorio), VIN, Número Motor, Versión (select), Año Fabricación, Año Modelo, Color, Notas
   - Validaciones específicas: patente formato argentino (ABC-123), VIN 17 caracteres
   - Select de versión con búsqueda (marca → modelo → versión)
3. Detalle de vehículo (`GET /vehicles/:id`)
   - Información general + historial completo (transferencias, kilometraje, accesos)
   - Timeline visual de eventos
4. Editar vehículo (`PATCH /vehicles/:id`)
   - Mismos campos que registro, pre-poblados
5. Transferir vehículo (`POST /vehicles/:id/transfer`)
   - Formulario con email del nuevo propietario
   - Confirmación antes de transferir
6. Registrar kilometraje (`POST /vehicles/:id/mileage`)
   - Input numérico + selector de fecha + fuente (manual/importado/api)
   - Validación: nuevo KM debe ser mayor o igual al último registrado
7. Conceder acceso (`POST /vehicles/:id/access`)
   - Email del usuario + permisos (ver, editar, transferir)
   - Tags de permisos (checkboxes)

**Consideraciones de UX:**
- Tabla con loading skeleton (no spinner)
- Búsqueda debounced para no saturar la API
- Confirm dialog antes de eliminar ("¿Estás seguro? Esta acción no se puede deshacer")
- Toast de éxito/error después de cada operación
- Optimistic updates en TanStack Query para operaciones comunes
- Formularios con validación inline en cada campo
- El select de Marca/Modelo/Versión debe ser en cascada: seleccionar marca → cargar modelos → seleccionar modelo → cargar versiones

**Prompt de implementación:**

> Implementar módulo de vehículos con:
> - Lista paginada (`GET /vehicles`) con TanStack Table, búsqueda debounced por patente, ordenamiento por columnas, actions dropdown (ver, editar, eliminar).
> - Formulario de registro/edición con React Hook Form + Zod. Validaciones: patente formato `ABC-123`, VIN 17 caracteres, año 1900-2100.
> - Select en cascada marca → modelo → versión (fetch secuencial).
> - Detalle del vehículo con timeline de eventos (transferencias, kilometraje, accesos).
> - Modal de transferencia: email del nuevo dueño + confirmación.
> - Modal de kilometraje: input numérico + fecha. Validar que KM >= último registrado.
> - Modal de acceso compartido: email + checkboxes de permisos.
> - Optimistic updates en TanStack Query para crear y eliminar.
> - Confirm dialog con "Eliminar" antes de delete.
> - Skeleton loading en tabla y detalle.

---

### Fase 4 — Módulo Talleres (3 días)

**Objetivo:** CRUD de talleres, sucursales, miembros, invitaciones, horarios.

**Tareas:**
1. Lista de talleres (`GET /workshops`)
   - Cards o tabla con: Nombre, Sucursales, Miembros, Estado
   - Paginación
2. Crear taller (`POST /workshops`)
   - Formulario: Nombre, Descripción, Especialidades (multiselect)
   - Al crear, el usuario creador se convierte automáticamente en miembro con rol admin
3. Detalle de taller (`GET /workshops/:id`)
   - Pestañas: Información, Sucursales, Miembros, Invitaciones, Horarios
4. Editar taller
5. Sucursales: crear/editar sucursal con dirección, teléfono
6. Miembros: listar + actualizar rol + eliminar
7. Invitaciones: enviar por email + listar pendientes
8. Aceptar invitación: página pública con token
9. Horarios: configurar horarios por sucursal y día de semana

**Consideraciones de UX:**
- Detalle con tabs (shadcn/ui Tabs) para no recargar página
- Las especialidades deben ser multiselect con búsqueda
- Los horarios deben ser un grid día × hora con inputs de hora
- Las invitaciones deben mostrar estado (pendiente/aceptada/expirada)
- Solo taller-admin puede invitar, cambiar roles y eliminar miembros

**Prompt de implementación:**

> Implementar módulo de talleres con:
> - Lista de talleres (`GET /workshops`) paginada.
> - Formulario crear taller con nombre, descripción, especialidades (multiselect).
> - Detalle con Tabs: Info, Sucursales, Miembros, Invitaciones, Horarios.
> - CRUD de sucursales (dirección, teléfono, email).
> - Lista de miembros con rol, posibilidad de cambiar rol (solo taller-admin) y eliminar.
> - Enviar invitación por email con token. Listar invitaciones con estado.
> - Página pública para aceptar invitación (`POST /workshops/invitations/accept`).
> - Grid de horarios: 7 columnas (días) × filas de franjas horarias, con inputs de hora apertura/cierre.
> - WorkshopGuard: verificar que el usuario sea miembro del taller antes de mostrar datos.

---

### Fase 5 — Módulo Mantenimiento (4 días)

**Objetivo:** Turnos, órdenes de trabajo, registros de servicio, presupuestos.

**Tareas:**
1. Turnos (Appointments)
   - Lista con filtros: taller, vehículo, estado, fecha desde/hasta
   - Crear turno: seleccionar taller, vehículo, fecha, hora, descripción
   - Cancelar turno con motivo
2. Órdenes de Trabajo (Work Orders)
   - Lista con filtros
   - Crear OT desde un turno o directamente
   - Detalle de OT con items (servicios + repuestos)
   - Agregar/quitar items a la OT
   - Actualizar estado (pendiente → en_progreso → completado → facturado)
3. Registros de Servicio (Service Records)
   - Crear registro asociado a vehículo + taller + OT
   - Detalle con items realizados
4. Presupuestos (Estimates)
   - Crear presupuesto con items
   - Lista de presupuestos
   - Conversión de presupuesto a OT

**Consideraciones de UX:**
- Los selectores de vehículo y taller deben ser searchable dropdowns
- Los items en OT y presupuesto deben tener precio calculado automáticamente
- Los estados deben tener colores consistentes con StatusBadge
- Los filtros en listas deben preservarse en la URL (query params)
- Fecha con date picker (shadcn/ui popover + calendar)

**Prompt de implementación:**

> Implementar módulo de mantenimiento:
> - Turnos: lista filtrable (taller, vehículo, estado, rango fecha), formulario creación con date picker y searchable selects, cancelación con motivo.
> - Órdenes de trabajo: lista filtrable, creación desde turno o directa, detalle con items (servicio + repuesto con precio), agregar/remover items dinámicamente, cambio de estado con botones.
> - Registros de servicio: formulario con vehículo + taller + OT + descripción.
> - Presupuestos: creación con items (descripción + cantidad + precio unitario → total calculado), lista, acción "Convertir en OT".
> - Todos los totales deben calcularse automáticamente al cambiar cantidades o precios.
> - Filtros preservados en URL query params para compartir/enlaces directos.
> - Searchable dropdowns para vehículos y talleres.

---

### Fase 6 — Módulo Administración (1 día)

**Objetivo:** Gestión de roles del sistema y usuarios (solo super_admin/admin).

**Tareas:**
1. Lista de usuarios (`GET /admin/users`)
   - Tabla con: nombre, email, estado, roles, fecha registro
2. Asignar/revocar roles de sistema (`POST /admin/roles/assign`, `DELETE /admin/roles/revoke`)
   - Dialog con selector de usuario + selector de rol
3. Lista de roles del sistema (`GET /admin/roles`)
   - Tabla informativa: rol, permisos asociados

**Consideraciones de UX:**
- Solo accesible para usuarios con rol `super_admin` o `admin`
- El sidebar debe ocultar "Admin" si el usuario no tiene permisos
- Los roles de sistema no se deben poder asignar a uno mismo (protección)

**Prompt de implementación:**

> Implementar módulo de administración:
> - Lista de usuarios con tabla, solo visible para super_admin/admin.
> - Dialog para asignar rol de sistema: selector de usuario + selector de rol.
> - Botón para revocar rol en cada asignación existente.
> - Lista informativa de roles del sistema con sus permisos.
> - Ocultar sidebar "Admin" si el usuario no tiene rol super_admin o admin.
> - Prevenir que un usuario se asigne/revoque roles a sí mismo.

---

### Fase 7 — Optimizaciones de Performance (1 día)

**Objetivo:** Garantizar que la app cumpla con estándares de performance.

**Tareas específicas:**
1. **Bundle analysis:**
   - Ejecutar `ANALYZE=true npm run build` y revisar bundles grandes
   - Dynamic imports para componentes pesados (ej: editor de texto, chart libraries)
   - Lazy loading de rutas con `next/dynamic`
2. **Server Components:**
   - Máximo uso de Server Components (componentes `async`)
   - Solo migrar a Client Components cuando sea indispensable (eventos, estado, hooks)
   - Layouts como Server Components
3. **Image Optimization:**
   - Usar `next/image` en lugar de `<img>` para lazy loading nativo
   - Configurar remotePatterns en next.config.ts
4. **TanStack Query:**
   - Configurar `staleTime` global de 30s (evita refetch innecesario)
   - `gcTime` (antes cacheTime) de 5 minutos
   - Prefetching de queries en hover de links
5. **Paginación y Virtualización:**
   - `@tanstack/react-virtual` para tablas con +500 filas
   - Infinite scroll en listas largas si aplica
6. **Debouncing en búsquedas:**
   - Hook `useDebounce` con 300ms para inputs de búsqueda
7. **Manejo de errores global:**
   - Error boundaries por sección (no uno global que tire toda la página)
   - Componente `error.tsx` en cada grupo de rutas

**Prompt de implementación:**

> Optimizar performance del frontend:
> 1. Configurar `@next/bundle-analyzer` y reducir bundles grandes con dynamic imports.
> 2. Migrar todos los componentes posibles a Server Components (async components que fetchen datos directamente). Solo usar `'use client'` cuando sea estrictamente necesario.
> 3. Configurar TanStack Query con `staleTime: 30_000`, `gcTime: 300_000`.
> 4. Implementar prefetching de queries con `queryClient.prefetchQuery` en hover de links del sidebar.
> 5. Agregar `next/image` con lazy loading para todas las imágenes.
> 6. Implementar `useDebounce` hook para inputs de búsqueda.
> 7. Agregar Error Boundaries por sección (vehículos, talleres, mantenimiento, admin) con su propio `error.tsx`.
> 8. Verificar con Lighthouse que FCP < 1.5s y LCP < 2.5s.

---

## 4. Decisiones Técnicas Detalladas

### 4.1 Manejo de Estado

```
┌─────────────────────────────────────────────────────────┐
│                      Aplicación                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Server State (API)            Client State (UI)         │
│  ┌───────────────────┐        ┌──────────────────┐      │
│  │  TanStack Query   │        │    Zustand       │      │
│  │                   │        │                  │      │
│  │ • Cache automático│        │ • Sidebar colaps │      │
│  │ • Refetch silen-  │        │ • Tema dark/light│      │
│  │   cioso           │        │ • Filtros tempo- │      │
│  │ • Optimistic      │        │   rales          │      │
│  │   updates         │        │ • Modales estado │      │
│  │ • Paginación      │        │ • Preferencias   │      │
│  │ • Prefetching     │        │   del usuario    │      │
│  └───────────────────┘        └──────────────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Regla:** Si el dato viene del backend → TanStack Query. Si es UI efímera → Zustand. Nunca ambas.

### 4.2 Estrategia de Queries (TanStack Query)

| Query Key Pattern                     | Descripción                              | staleTime |
| ------------------------------------- | ---------------------------------------- | --------- |
| `['vehicles']`                        | Lista de vehículos (paginada)            | 30s       |
| `['vehicles', id]`                    | Detalle de vehículo                      | 30s       |
| `['vehicles', id, 'history']`         | Historial del vehículo                   | 60s       |
| `['workshops']`                       | Lista de talleres                        | 30s       |
| `['workshops', id]`                   | Detalle de taller                        | 30s       |
| `['workshops', id, 'members']`        | Miembros del taller                      | 30s       |
| `['workshops', id, 'invitations']`    | Invitaciones del taller                  | 30s       |
| `['appointments']`                    | Lista de turnos                          | 30s       |
| `['appointments', id]`                | Detalle de turno                         | 30s       |
| `['work-orders']`                     | Lista de OT                              | 30s       |
| `['work-orders', id]`                 | Detalle de OT                            | 30s       |
| `['service-records']`                 | Lista de servicios                       | 60s       |
| `['estimates']`                       | Lista de presupuestos                    | 30s       |
| `['admin', 'users']`                  | Lista de usuarios (admin)                | 60s       |
| `['admin', 'roles']`                  | Lista de roles                           | 120s      |

**Invalidación:** Tras un mutation exitoso, invalidar las queries relacionadas:
- Crear vehículo → invalidar `['vehicles']`
- Transferir vehículo → invalidar `['vehicles', id]`, `['vehicles', id, 'history']`
- Invitar miembro → invalidar `['workshops', id, 'members']`, `['workshops', id, 'invitations']`

### 4.3 Componentes Server vs Client

| Componente                    | Tipo     | Razón                                              |
| ----------------------------- | -------- | -------------------------------------------------- |
| Layout (raíz + dashboard)     | Server   | No necesita interactividad                         |
| Sidebar                       | Client   | Estado colapsado, eventos click                    |
| UserNav                       | Client   | useSession de next-auth                            |
| Tablas (vehículos, talleres)  | Client   | TanStack Table requiere estado                     |
| Formularios                   | Client   | React Hook Form, eventos, validación inline        |
| Página de detalle (vehículo)  | Server   | Fetch data y render, sin interactividad            |
| Cards de dashboard con datos  | Server   | async component, fetch directo                     |
| StatusBadge                   | Server   | Solo recibe props y render                        |
| Dialog/Modal                  | Client   | Estado de abierto/cerrado, eventos                 |

### 4.4 Estrategia de Estilos

- **Tailwind CSS** para 95% de los estilos
- **shadcn/ui** para componentes base (botones, inputs, cards, etc.)
- **`cn()` utility** (`clsx` + `tailwind-merge`) para combinar clases condicionales
- **CSS Modules** solo para casos muy específicos (animaciones complejas)
- **No CSS-in-JS** (styled-components, emotion) — evita runtime overhead

### 4.5 Manejo de Errores

```
fetch API → ky interceptor → ¿error?
  ├── 200-299 → retorna data
  ├── 400 → mensaje de validación del backend
  ├── 401 → intenta refresh → si falla, redirect a /login
  ├── 403 → toast "No tienes permisos"
  ├── 404 → toast "Recurso no encontrado" o redirect a 404
  └── 500 → toast "Error interno del servidor. Intenta nuevamente."
```

### 4.6 Seguridad

- **CSRF:** Next.js lo maneja nativamente con cookies de sesión server-side
- **XSS:** React escapea automáticamente. Adicionalmente, sanitizar con `DOMPurify` si se renderiza HTML del backend
- **SQL Injection:** No aplica (ORM en backend)
- **Rate Limiting:** Backend ya tiene ThrottlerGuard. Frontend no necesita duplicar
- **Sensitive Data:** No almacenar tokens en localStorage. Usar httpOnly cookies con next-auth
- **Content Security Policy:** Configurar headers CSP en `next.config.ts`

---

## 5. Cronograma Estimado

| Fase                | Días | Depende de              |
| ------------------- | ---- | ----------------------- |
| Fase 0 — Setup      | 1    | —                       |
| Fase 1 — Auth       | 2    | Fase 0                  |
| Fase 2 — Layout     | 1    | Fase 1                  |
| Fase 3 — Vehículos  | 3    | Fase 2                  |
| Fase 4 — Talleres   | 3    | Fase 2                  |
| Fase 5 — Mantenimiento | 4 | Fase 2                  |
| Fase 6 — Admin      | 1    | Fase 2                  |
| Fase 7 — Performance | 1   | Fase 3-6                |
| **Total**           | **16** | —                       |

> **Nota:** Fase 3, 4 y 5 pueden ejecutarse en paralelo con 3 developers distintos, reduciendo el tiempo total a ~9 días.

---

## 6. Prompts de IA por Feature

### Feature: Login
> Crear página de login con React Hook Form + Zod. Los campos son email (validación email) y password (mínimo 8 caracteres). Usar shadcn/ui Input y Button. El formulario debe enviar a `POST /api/auth/login` del backend. Mostrar error del backend debajo del formulario si las credenciales son inválidas. Deshabilitar el botón mientras se envía. Usar next-auth signIn con credentials provider configurado para llamar al backend.

### Feature: Tabla de vehículos con búsqueda
> Crear tabla de vehículos usando TanStack Table con las columnas: patente, marca/modelo, año, color, propietario, acciones (ver, editar, eliminar). Agregar input de búsqueda con debounce de 300ms que filtra por patente. Paginación de 20 items. Cargar datos con TanStack Query. Mostrar skeleton loader mientras carga. Los datos vienen de `GET /vehicles?page=1&limit=20&search=abc`.

### Feature: Select en cascada (Marca → Modelo → Versión)
> Crear 3 selects encadenados: al seleccionar una marca, se cargan los modelos. Al seleccionar un modelo, se cargan las versiones. Usar searchable select (Command + Popover de shadcn/ui). Los datos vienen de endpoints del backend (GET /vehicle-brands, GET /vehicle-models?brandId=X, GET /vehicle-versions?modelId=X). Manejar estados de carga y error en cada nivel.

### Feature: Timeline de eventos del vehículo
> Crear un componente timeline vertical que muestre la historia del vehículo: registro, transferencias, cambios de kilometraje. Cada evento tiene un ícono (lucide-react), fecha, descripción y metadata. Los eventos más recientes arriba. Formato de fecha con dayjs.

### Feature: Grid de horarios del taller
> Crear un grid de 7 columnas (lunes a domingo) donde cada celda tiene dos inputs de hora: apertura y cierre. Permitir agregar múltiples franjas horarias por día (ej: 9-12 y 14-18). Usar React Hook Form FieldArray. Validar que apertura < cierre y que las franjas no se superpongan.

---

## 7. Checklist de Calidad

- [ ] Lighthouse Performance ≥ 90 (mobile + desktop)
- [ ] Lighthouse Accessibility ≥ 95
- [ ] Lighthouse Best Practices ≥ 90
- [ ] Lighthouse SEO ≥ 95
- [ ] FCP < 1.5s
- [ ] LCP < 2.5s
- [ ] CLS < 0.1
- [ ] TTI < 3.5s
- [ ] Bundle JS inicial < 150KB
- [ ] 100% derutas protegidas con middleware
- [ ] Todos los formularios con validación client-side
- [ ] Todos los errores de API mostrados al usuario
- [ ] Estados de carga (skeleton) en todas las vistas
- [ ] Estados vacíos ("No hay resultados") en todas las listas
- [ ] Confirmación antes de acciones destructivas
- [ ] Responsive: mobile-first, funciona en 320px+
- [ ] Dark mode funcional
- [ ] Sin dependencias deprecadas o sin mantenimiento
- [ ] Sin console.logs en producción
- [ ] TypeScript strict, sin `any` ni `@ts-ignore`
