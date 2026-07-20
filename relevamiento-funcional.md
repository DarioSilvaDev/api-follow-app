# Relevamiento Funcional — api-follow-app

> Fecha: 2026-07-20
> Stack: NestJS 11 + Prisma 6 + PostgreSQL + CQRS ligero + EventEmitter2

---

## 1. Propósito del Proyecto

Backend tipo **monolito modular** para la gestión de talleres mecánicos. Permite administrar vehículos, órdenes de trabajo, turnos, presupuestos, facturación y usuarios con un sistema de roles y permisos granular.

---

## 2. Stack Tecnológico

| Capa            | Tecnología                                |
| --------------- | ----------------------------------------- |
| Framework       | NestJS 11                                 |
| Lenguaje        | TypeScript (strict)                       |
| ORM             | Prisma 6 + PostgreSQL                     |
| Eventos         | @nestjs/event-emitter (EventEmitter2)     |
| Validación      | class-validator + class-transformer       |
| Auth            | JWT + bcrypt (Passport)                   |
| Logging         | nestjs-pino                               |
| Throttling      | @nestjs/throttler                         |
| Mail            | nodemailer                                |

---

## 3. Arquitectura de Directorios

```
src/
├── app.controller.ts         # GET / → "Hello World!"
├── app.module.ts             # Módulo raíz
├── app.service.ts
├── main.ts                   # Bootstrap con prefijo "api"
├── config/
│   └── envs.ts               # Validación de ENV con Joi
├── common/                   # Infraestructura compartida
│   ├── authorization.module.ts
│   ├── cache/
│   ├── commands/
│   ├── constants/
│   ├── database/
│   ├── decorators/
│   ├── events/
│   ├── exceptions/
│   ├── guards/
│   ├── init/
│   ├── logger/
│   ├── mail/
│   ├── queries/
│   └── types/
└── modules/                  # Bounded contexts
    ├── administration/
    ├── auth/
    ├── maintenance/
    ├── users/
    ├── vehicles/
    └── workshops/
```

---

## 4. Módulos de Negocio

| Módulo         | Token de Repositorio         | Propósito                              |
| -------------- | ---------------------------- | -------------------------------------- |
| **auth**       | `AUTH_REPOSITORY`            | Autenticación y registro de usuarios   |
| **users**      | `USER_REPOSITORY`            | CRUD de usuarios del sistema           |
| **vehicles**   | `VEHICLE_REPOSITORY`         | Registro y gestión de vehículos        |
| **workshops**  | `WORKSHOP_REPOSITORY`        | Gestión de talleres y miembros         |
| **maintenance**| `MAINTENANCE_REPOSITORY`     | Turnos, órdenes, servicios y presupuestos |
| **administration** | `ADMINISTRATION_REPOSITORY` | Asignación de roles del sistema        |

---

## 5. Endpoints por Controlador

### 5.1 AppController

| Método | Ruta | Auth | Descripción         |
| ------ | ---- | ---- | ------------------- |
| GET    | `/`  | No   | Health check básico |

### 5.2 AuthController (`/auth`)

| Método | Ruta                   | Auth          | Descripción                     |
| ------ | ---------------------- | ------------- | ------------------------------- |
| POST   | `/auth/register`       | No            | Registrar nuevo usuario         |
| POST   | `/auth/login`          | No            | Iniciar sesión                  |
| POST   | `/auth/refresh`        | No            | Refrescar token JWT             |
| POST   | `/auth/logout`         | No            | Cerrar sesión                   |
| GET    | `/auth/verify-email`   | No            | Verificar email con token       |
| POST   | `/auth/resend-verification` | No        | Reenviar email de verificación  |
| POST   | `/auth/change-password` | JwtAuthGuard  | Cambiar contraseña              |
| POST   | `/auth/forgot-password` | No            | Solicitar reset de contraseña   |
| POST   | `/auth/reset-password` | No            | Resetear contraseña             |
| GET    | `/auth/me`             | JwtAuthGuard  | Obtener sesión actual           |

### 5.3 UsersController (`/users`)

| Método | Ruta               | Auth         | Descripción                |
| ------ | ------------------ | ------------ | -------------------------- |
| POST   | `/users`           | JwtAuthGuard | Crear usuario              |
| GET    | `/users`           | JwtAuthGuard | Listar usuarios            |
| GET    | `/users/search`    | JwtAuthGuard | Buscar usuarios            |
| GET    | `/users/:id`       | JwtAuthGuard | Obtener usuario por ID     |
| PATCH  | `/users/:id`       | JwtAuthGuard | Actualizar usuario         |
| DELETE | `/users/:id`       | JwtAuthGuard | Eliminar usuario           |

### 5.4 VehiclesController (`/vehicles`)

| Método | Ruta                       | Auth         | Descripción                  |
| ------ | -------------------------- | ------------ | ---------------------------- |
| POST   | `/vehicles`                | JwtAuthGuard | Registrar vehículo           |
| GET    | `/vehicles`                | JwtAuthGuard | Listar vehículos             |
| GET    | `/vehicles/:id`            | JwtAuthGuard | Obtener vehículo por ID      |
| PATCH  | `/vehicles/:id`            | JwtAuthGuard | Actualizar vehículo          |
| DELETE | `/vehicles/:id`            | JwtAuthGuard | Eliminar vehículo            |
| POST   | `/vehicles/:id/transfer`   | JwtAuthGuard | Transferir propiedad         |
| POST   | `/vehicles/:id/mileage`    | JwtAuthGuard | Registrar kilometraje        |
| POST   | `/vehicles/:id/access`     | JwtAuthGuard | Conceder acceso a vehículo   |
| GET    | `/vehicles/:id/history`    | JwtAuthGuard | Historial del vehículo       |

### 5.5 WorkshopsController (`/workshops`)

| Método | Ruta                                            | Auth                                              | Descripción                     |
| ------ | ----------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| POST   | `/workshops`                                    | JwtAuthGuard                                      | Crear taller                    |
| GET    | `/workshops`                                    | JwtAuthGuard                                      | Listar talleres                 |
| GET    | `/workshops/:id`                                | JwtAuthGuard + WorkshopGuard                      | Obtener taller por ID           |
| PATCH  | `/workshops/:id`                                | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Actualizar taller               |
| POST   | `/workshops/:id/branches`                       | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Crear sucursal                  |
| POST   | `/workshops/:id/invitations`                    | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Invitar miembro                 |
| GET    | `/workshops/:id/members`                        | JwtAuthGuard + WorkshopGuard                      | Listar miembros                 |
| GET    | `/workshops/:id/invitations`                    | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Listar invitaciones             |
| PATCH  | `/workshops/:id/members/:memberId/role`         | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Actualizar rol de miembro       |
| DELETE | `/workshops/:id/members/:memberId`              | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Eliminar miembro                |
| POST   | `/workshops/:id/branches/:branchId/hours`       | JwtAuthGuard + WorkshopGuard + PermissionsGuard   | Configurar horarios             |
| POST   | `/workshops/invitations/accept`                 | JwtAuthGuard                                      | Aceptar invitación              |

### 5.6 MaintenanceController (`/maintenance`)

| Método | Ruta                                          | Auth         | Descripción                      |
| ------ | --------------------------------------------- | ------------ | -------------------------------- |
| POST   | `/maintenance/appointments`                   | JwtAuthGuard | Crear turno                      |
| GET    | `/maintenance/appointments`                   | JwtAuthGuard | Listar turnos                    |
| GET    | `/maintenance/appointments/:id`               | JwtAuthGuard | Obtener turno por ID             |
| PATCH  | `/maintenance/appointments/:id`               | JwtAuthGuard | Actualizar turno                 |
| POST   | `/maintenance/appointments/:id/cancel`        | JwtAuthGuard | Cancelar turno                   |
| POST   | `/maintenance/work-orders`                    | JwtAuthGuard | Crear orden de trabajo           |
| GET    | `/maintenance/work-orders`                    | JwtAuthGuard | Listar órdenes de trabajo        |
| GET    | `/maintenance/work-orders/:id`                | JwtAuthGuard | Obtener orden por ID             |
| PATCH  | `/maintenance/work-orders/:id/status`         | JwtAuthGuard | Actualizar estado de orden       |
| POST   | `/maintenance/work-orders/:id/items`          | JwtAuthGuard | Agregar item a orden             |
| POST   | `/maintenance/service-records`                | JwtAuthGuard | Crear registro de servicio       |
| GET    | `/maintenance/vehicles/:vehicleId/history`    | JwtAuthGuard | Historial de servicio vehículo   |
| POST   | `/maintenance/estimates`                      | JwtAuthGuard | Crear presupuesto                |

### 5.7 AdministrationController (`/admin`)

| Método | Ruta                  | Auth                                            | Descripción                     |
| ------ | --------------------- | ----------------------------------------------- | ------------------------------- |
| POST   | `/admin/roles/assign` | JwtAuthGuard + PermissionsGuard                 | Asignar rol de sistema          |
| DELETE | `/admin/roles/revoke` | JwtAuthGuard + PermissionsGuard                 | Revocar rol de sistema          |
| GET    | `/admin/users`        | JwtAuthGuard + PermissionsGuard                 | Listar usuarios (admin)         |
| GET    | `/admin/roles`        | JwtAuthGuard + PermissionsGuard                 | Listar roles del sistema        |

---

## 6. Commands y Handlers

### 6.1 Auth (9 handlers)

| Command                        | Handler                       | ¿Tiene clase Command? |
| ------------------------------ | ----------------------------- | --------------------- |
| `RegisterCommand`              | `RegisterHandler`             | Sí                    |
| `LoginCommand`                 | `LoginHandler`                | Sí                    |
| `RefreshTokenCommand`          | `RefreshTokenHandler`         | Sí                    |
| `LogoutCommand`                | `LogoutHandler`               | Sí                    |
| —                              | `VerifyEmailHandler`          | No (usa DTO directo)  |
| —                              | `ResendVerificationHandler`   | No (usa DTO directo)  |
| —                              | `ChangePasswordHandler`       | No (usa parámetros)   |
| `RequestPasswordResetCommand`  | `RequestPasswordResetHandler` | Sí                    |
| `ResetPasswordCommand`         | `ResetPasswordHandler`        | Sí                    |

### 6.2 Users (3 handlers)

| Command              | Handler            | ¿Tiene clase Command? |
| -------------------- | ------------------ | --------------------- |
| `CreateUserCommand`  | `CreateUserHandler`| Sí                    |
| `UpdateUserCommand`  | `UpdateUserHandler`| Sí                    |
| `DeleteUserCommand`  | `DeleteUserHandler`| Sí                    |

### 6.3 Vehicles (6 handlers)

| Command                    | Handler                  | ¿Tiene clase Command? |
| -------------------------- | ------------------------ | --------------------- |
| `RegisterVehicleCommand`   | `RegisterVehicleHandler` | Sí                    |
| `UpdateVehicleCommand`     | `UpdateVehicleHandler`   | Sí                    |
| `DeleteVehicleCommand`     | `DeleteVehicleHandler`   | Sí                    |
| `TransferVehicleCommand`   | `TransferVehicleHandler` | Sí                    |
| `RecordMileageCommand`     | `RecordMileageHandler`   | Sí                    |
| `GrantAccessCommand`       | `GrantAccessHandler`     | Sí                    |

### 6.4 Workshops (8 handlers)

| Command                    | Handler                  | ¿Tiene clase Command? |
| -------------------------- | ------------------------ | --------------------- |
| `CreateWorkshopCommand`    | `CreateWorkshopHandler`  | Sí                    |
| `UpdateWorkshopCommand`    | `UpdateWorkshopHandler`  | Sí                    |
| `CreateBranchCommand`      | `CreateBranchHandler`    | Sí                    |
| `InviteMemberCommand`      | `InviteMemberHandler`    | Sí                    |
| `AcceptInvitationCommand`  | `AcceptInvitationHandler`| Sí                    |
| `UpdateMemberRoleCommand`  | `UpdateMemberRoleHandler`| Sí                    |
| `RemoveMemberCommand`      | `RemoveMemberHandler`    | Sí                    |
| `SetBusinessHoursCommand`  | `SetBusinessHoursHandler`| Sí                    |

### 6.5 Maintenance (8 handlers)

| Command                        | Handler                       | ¿Tiene clase Command? |
| ------------------------------ | ----------------------------- | --------------------- |
| `CreateAppointmentCommand`     | `CreateAppointmentHandler`    | Sí                    |
| `UpdateAppointmentCommand`     | `UpdateAppointmentHandler`    | Sí                    |
| `CancelAppointmentCommand`     | `CancelAppointmentHandler`    | Sí                    |
| `CreateWorkOrderCommand`       | `CreateWorkOrderHandler`      | Sí                    |
| `UpdateWorkOrderStatusCommand` | `UpdateWorkOrderStatusHandler`| Sí                    |
| `AddWorkOrderItemCommand`      | `AddWorkOrderItemHandler`     | Sí                    |
| `CreateServiceRecordCommand`   | `CreateServiceRecordHandler`  | Sí                    |
| `CreateEstimateCommand`        | `CreateEstimateHandler`       | Sí                    |

### 6.6 Administration (2 handlers)

| Command                  | Handler                  | ¿Tiene clase Command? |
| ------------------------ | ------------------------ | --------------------- |
| `AssignSystemRoleCommand`| `AssignSystemRoleHandler`| Sí                    |
| `RevokeSystemRoleCommand`| `RevokeSystemRoleHandler`| Sí                    |

**Total: 36 handlers (33 con clase Command + 3 sin Command)**

---

## 7. Queries y Handlers

| Módulo        | Handler                           | ¿Tiene clase Query? |
| ------------- | --------------------------------- | ------------------- |
| Auth          | `GetSessionHandler`               | No                  |
| Users         | `GetUserHandler`                  | No                  |
| Users         | `ListUsersHandler`                | No                  |
| Users         | `SearchUsersHandler`              | No                  |
| Vehicles      | `GetVehicleHandler`               | No                  |
| Vehicles      | `ListVehiclesHandler`             | No                  |
| Vehicles      | `GetVehicleHistoryHandler`        | No                  |
| Workshops     | `GetWorkshopHandler`              | No                  |
| Workshops     | `ListWorkshopsHandler`            | No                  |
| Workshops     | `GetMembersHandler`               | No                  |
| Workshops     | `GetInvitationsHandler`           | No                  |
| Maintenance   | `GetAppointmentHandler`           | No                  |
| Maintenance   | `ListAppointmentsHandler`         | No                  |
| Maintenance   | `GetWorkOrderHandler`             | No                  |
| Maintenance   | `ListWorkOrdersHandler`           | No                  |
| Maintenance   | `GetVehicleServiceHistoryHandler` | No                  |
| Administration| `ListUsersHandler`                | No                  |
| Administration| `ListSystemRolesHandler`          | No                  |

**Total: 18 handlers de query (ninguno con clase Query dedicada)**

---

## 8. Eventos de Dominio

### 8.1 Auth (5 eventos)

| Evento                          | eventName                       | Listeners                          |
| ------------------------------- | ------------------------------- | ---------------------------------- |
| `UserRegisteredEvent`           | `auth.user.registered`          | —                                  |
| `UserLoggedInEvent`             | `auth.user.logged_in`           | —                                  |
| `UserVerifiedEvent`             | `auth.user.verified`            | —                                  |
| `EmailVerificationSentEvent`    | `auth.email.verification.sent`  | `SendVerificationEmailListener`    |
| `PasswordResetRequestedEvent`   | `auth.password_reset.requested` | `SendPasswordResetEmailListener`   |

### 8.2 Users (2 eventos)

| Evento             | eventName      | Listeners                                           |
| ------------------ | -------------- | --------------------------------------------------- |
| `UserCreatedEvent` | `user.created` | `SendWelcomeEmailListener`, `CreateDefaultSettingsListener` |
| `UserUpdatedEvent` | `user.updated` | —                                                   |

### 8.3 Vehicles (3 eventos)

| Evento                    | eventName                   | Listeners |
| ------------------------- | --------------------------- | --------- |
| `VehicleRegisteredEvent`  | `vehicle.registered`        | —         |
| `VehicleTransferredEvent` | `vehicle.transferred`       | —         |
| `MileageRecordedEvent`    | `vehicle.mileage.recorded`  | —         |

### 8.4 Workshops (3 eventos)

| Evento               | eventName                 | Listeners |
| -------------------- | ------------------------- | --------- |
| `WorkshopCreatedEvent`| `workshop.created`        | —         |
| `MemberInvitedEvent` | `workshop.member.invited` | —         |
| `MemberJoinedEvent`  | `workshop.member.joined`  | —         |

### 8.5 Maintenance (3 eventos)

| Evento                     | eventName              | Listeners |
| -------------------------- | ---------------------- | --------- |
| `AppointmentCreatedEvent`  | `appointment.created`  | —         |
| `WorkOrderCreatedEvent`    | `work-order.created`   | —         |
| `ServiceRecordedEvent`     | `service.recorded`     | —         |

### 8.6 Administration (2 eventos)

| Evento                    | eventName                    | Listeners |
| ------------------------- | ---------------------------- | --------- |
| `SystemRoleAssignedEvent` | `admin.system_role.assigned` | —         |
| `SystemRoleRevokedEvent`  | `admin.system_role.revoked`  | —         |

**Total: 18 eventos, 4 listeners**

---

## 9. Modelos de Datos (Prisma)

### 9.1 Enums (18)

`UserStatus`, `OauthProvider`, `MemberStatus`, `InvitationStatus`, `SubscriptionStatus`, `FuelType`, `TransmissionType`, `BodyType`, `MileageSource`, `VehicleTransferEventType`, `OwnershipType`, `TransferStatus`, `SystemRoleType`, `AppointmentStatus`, `WorkOrderStatus`, `WorkOrderPriority`, `EstimateStatus`, `ServiceItemType`

### 9.2 Modelos (39 tablas)

**Users Context (11)**
`User`, `UserCredential`, `UserSession`, `UserMfa`, `EmailVerification`, `PasswordReset`, `ApiKey`, `OauthAccount`, `LoginHistory`, `SystemRole`, `SystemRoleAssignment`

**Workshops Context (10)**
`Workshop`, `WorkshopBranch`, `WorkshopRole`, `WorkshopMember`, `WorkshopInvitation`, `BusinessHour`, `BusinessHourException`, `Specialty`, `WorkshopSpecialty`, `WorkshopRolePermission`

**Vehicles Context (12)**
`VehicleBrand`, `VehicleModel`, `VehicleVersion`, `Vehicle`, `VehicleOwnership`, `VehicleTransfer`, `VehicleTransferEvent`, `VehicleAccess`, `VehicleAccessPermission`, `VehicleShare`, `VehicleSharePermission`, `VehiclePhoto`, `VehicleDocument`, `VehicleMileage`

**Maintenance Context (5)**
`Appointment`, `WorkOrder`, `WorkOrderItem`, `ServiceRecord`, `Estimate`, `EstimateItem`

**Billing Context (3)**
`Plan`, `Subscription`, `PlanPermission`

**Permissions Context (2)**
`Permission`, `SystemRolePermission`

---

## 10. DTOs por Módulo

| Módulo         | DTOs                                                |
| -------------- | --------------------------------------------------- |
| Auth (10)      | `RegisterDto`, `LoginDto`, `RefreshTokenDto`, `VerifyEmailDto`, `ResendVerificationDto`, `ChangePasswordDto`, `RequestPasswordResetDto`, `ResetPasswordDto`, `AuthResponseDto`, `CreateAuthDto` |
| Users (3)      | `CreateUserDto`, `UpdateUserDto`, `UserResponseDto` |
| Vehicles (6)   | `RegisterVehicleDto`, `UpdateVehicleDto`, `TransferVehicleDto`, `RecordMileageDto`, `GrantAccessDto`, `VehicleResponseDto` |
| Workshops (10) | `CreateWorkshopDto`, `UpdateWorkshopDto`, `CreateBranchDto`, `InviteMemberDto`, `AcceptInvitationDto`, `UpdateMemberRoleDto`, `SetBusinessHoursDto`, `WorkshopResponseDto`, `MemberResponseDto`, `InvitationResponseDto` |
| Maintenance (12)| `CreateAppointmentDto`, `UpdateAppointmentDto`, `CreateWorkOrderDto`, `AddWorkOrderItemDto`, `CreateServiceRecordDto`, `CreateEstimateDto`, `AppointmentResponseDto`, `WorkOrderResponseDto`, `ServiceRecordResponseDto`, `EstimateResponseDto`, `UpdateWorkOrderDto`, barrel `index.ts` |
| Administration (4)| `AssignSystemRoleDto`, `RevokeSystemRoleDto`, `SystemRoleResponseDto`, `UserAdminResponseDto` |

---

## 11. Guards Personalizados

| Guard              | Propósito                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| `JwtAuthGuard`     | Autenticación JWT obligatoria (extiende `AuthGuard('jwt')` de Passport)|
| `WorkshopGuard`    | Verifica que el usuario sea miembro activo del taller (`req.params.id`)|
| `PermissionsGuard` | Verifica permisos según `@Permissions()`. Bypass para `super_admin`    |
| `ThrottlerGuard`   | Rate limiting global (APP_GUARD, de `@nestjs/throttler`)               |

---

## 12. Decorators Personalizados

| Decorator        | Propósito                                                    |
| ---------------- | ------------------------------------------------------------ |
| `@CurrentUser()` | Extrae `req.user` como `AuthenticatedUser` (`{ id, email }`) |
| `@Permissions()` | Setea metadata con permisos requeridos para `PermissionsGuard`|

---

## 13. Repositorios

| Interfaz                | Implementación Prisma            | Métodos principales                                      |
| ----------------------- | -------------------------------- | -------------------------------------------------------- |
| `UserRepository`        | `PrismaUserRepository`           | `create`, `update`, `delete`, `findById`, `findByEmail`  |
| `AuthRepository`        | `PrismaAuthRepository`           | `createSession`, `findSessionByRefreshToken`, `revokeSession`, `revokeUserSessions`, `createPasswordReset`, `findPasswordResetByToken`, `markPasswordResetUsed` |
| `VehicleRepository`     | `PrismaVehicleRepository`        | `create`, `update`, `delete`, `findById`, `findByLicensePlate` |
| `WorkshopRepository`    | `PrismaWorkshopRepository`       | `create`, `update`, `findById`                           |
| `MaintenanceRepository` | `PrismaMaintenanceRepository`    | `createAppointment`, `updateAppointment`, `cancelAppointment`, `findAppointmentById`, `createWorkOrder`, `updateWorkOrderStatus`, `addWorkOrderItem`, `findWorkOrderById`, `createServiceRecord`, `createEstimate`, `findEstimateById` |

---

## 14. Servicios Compartidos

| Servicio           | Ámbito   | Propósito                                         |
| ------------------ | -------- | ------------------------------------------------- |
| `PrismaService`    | Global   | Cliente Prisma con conexión/desconexión automática|
| `MailService`      | Global   | Envío de emails SMTP                              |
| `PermissionCache`  | —        | Cache en memoria de permisos (TTL 5 min)          |

---

## 15. Resumen Numérico

| Categoría                | Cantidad |
| ------------------------ | -------- |
| Módulos de negocio       | 6        |
| Controladores            | 7        |
| Endpoints totales        | ~50      |
| Handlers de command      | 36       |
| Handlers de query        | 18       |
| Eventos de dominio       | 18       |
| Listeners                | 4        |
| Modelos Prisma           | 39       |
| Enums Prisma             | 18       |
| DTOs                     | ~45      |
| Guards personalizados    | 3        |
| Decorators personalizados| 2        |
| Interfaces repositorio   | 5        |
| Implementaciones Prisma  | 5        |
| Tokens de inyección      | 6        |
