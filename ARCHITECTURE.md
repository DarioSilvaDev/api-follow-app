# Arquitectura — Follow App

> Monolito Modular con CQRS ligero, Repository Pattern + Prisma, Domain Events via EventEmitter2.

---

## Stack

| Capa       | Tecnología                            |
| ---------- | ------------------------------------- |
| Framework  | NestJS 11                             |
| Lenguaje   | TypeScript (strict)                   |
| ORM        | Prisma 6                              |
| Eventos    | @nestjs/event-emitter (EventEmitter2) |
| Validación | class-validator + class-transformer   |
| Auth       | JWT + bcrypt                          |
| Logging    | pino (nestjs-pino)                    |
| DB         | PostgreSQL                            |

---

## Estructura general

```
src/
├── common/                    # Infraestructura compartida
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── commands/
│   │   └── base.command.ts
│   ├── queries/
│   │   └── base.query.ts
│   ├── events/
│   │   └── base-event.ts
│   ├── exceptions/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   └── constants/
│
├── infrastructure/            # Servicios externos (adapters)
│   ├── mail/
│   ├── storage/
│   ├── cache/
│   └── queue/
│
├── modules/                   # Bounded contexts
│   ├── auth/
│   ├── users/
│   ├── workshops/
│   ├── vehicles/
│   ├── maintenance/
│   ├── scheduling/
│   ├── billing/
│   ├── administration/
│   └── notifications/
│
├── app.module.ts
└── main.ts
```

---

## Mapeo Prisma → Bounded Contexts

| Modelos en schema.prisma                                                                                                                                                                                                                  | Bounded Context    | Módulo            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------- |
| User, UserCredential, UserSession, EmailVerification, PasswordReset, ApiKey, OauthAccount, UserMfa, LoginHistory                                                                                                                          | **Users**          | `users/`          |
| — (lógica de login, refresh, registro, verificación)                                                                                                                                                                                      | **Auth**           | `auth/`           |
| Workshop, WorkshopBranch, WorkshopRole, WorkshopMember, WorkshopInvitation, BusinessHour, BusinessHourException, Specialty, WorkshopSpecialty                                                                                             | **Workshops**      | `workshops/`      |
| Vehicle, VehicleBrand, VehicleModel, VehicleVersion, VehiclePhoto, VehicleDocument, VehicleMileage, VehicleOwnership, VehicleTransfer, VehicleTransferEvent, VehicleAccess, VehicleAccessPermission, VehicleShare, VehicleSharePermission | **Vehicles**       | `vehicles/`       |
| — (ServiceRecord, WorkOrder, Estimate, Inspection, Diagnosis)                                                                                                                                                                             | **Maintenance**    | `maintenance/`    |
| — (Appointment, CalendarEvent)                                                                                                                                                                                                            | **Scheduling**     | `scheduling/`     |
| Plan, Subscription, PlanPermission                                                                                                                                                                                                        | **Billing**        | `billing/`        |
| Permission, SystemRole, SystemRoleAssignment, SystemRolePermission                                                                                                                                                                        | **Administration** | `administration/` |
| — (Email, Push, In-App)                                                                                                                                                                                                                   | **Notifications**  | `notifications/`  |

---

## Módulo de ejemplo — `users/`

```
users/
├── commands/
│   ├── create-user/
│   │   ├── create-user.command.ts
│   │   └── create-user.handler.ts
│   ├── update-user/
│   └── delete-user/
├── queries/
│   ├── get-user/
│   │   └── get-user.handler.ts
│   ├── list-users/
│   └── search-users/
├── controllers/
│   └── users.controller.ts
├── repositories/
│   ├── user.repository.ts
│   └── prisma-user.repository.ts
├── events/
│   ├── user-created.event.ts
│   └── user-updated.event.ts
├── listeners/
│   ├── send-welcome-email.listener.ts
│   └── create-default-settings.listener.ts
├── dto/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   └── user-response.dto.ts
├── tokens.ts
└── users.module.ts
```

### Patrón por archivo

**Command** — clase plana con datos:

```ts
export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly password: string,
  ) {}
}
```

**Handler** — Nest Provider que ejecuta la lógica:

```ts
@Injectable()
export class CreateUserHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = await this.repository.create({ ...command });
    this.eventEmitter.emit('user.created', new UserCreatedEvent(user));
    return user;
  }
}
```

**Repository (interfaz)**:

```ts
export interface UserRepository {
  create(data: CreateUserDto): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}
```

**Repository (Prisma impl)**:

```ts
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserDto): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        credential: {
          create: { passwordHash: await hash(data.password, 10) },
        },
      },
      include: { credential: true },
    });
  }

  // ...
}
```

**Tokens**:

```ts
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
```

**Event**:

```ts
export class UserCreatedEvent extends BaseEvent {
  constructor(public readonly user: User) {
    super('user.created');
  }
}
```

**Listener**:

```ts
@Injectable()
export class SendWelcomeEmailListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent) {
    // send email logic
  }
}
```

---

## Flujo completo — POST /users

```
POST /users { email, firstName, lastName, password }

→ UsersController.create(@Body() dto: CreateUserDto)
  → const command = new CreateUserCommand(dto.email, dto.firstName, ...)
  → const user = await this.handler.execute(command)

    → CreateUserHandler.execute()
      → this.repository.create(data)
        → PrismaUserRepository
          → prisma.user.create({ data: { ..., credential: { create: ... } } })
      → this.eventEmitter.emit('user.created', new UserCreatedEvent(user))

    → SendWelcomeEmailListener.handle(event)
    → CreateDefaultSettingsListener.handle(event)

  → return UserResponseDto.from(user)
```

---

## Reglas arquitectónicas

1. **Un repositorio por agregado**, no por tabla.
   - `VehicleRepository` maneja `Vehicle` + `VehicleOwnership` + `VehicleMileage` si son parte de la misma operación de negocio.

2. **Consultas de solo lectura** pueden usar Prisma directamente desde el Handler de Query, sin pasar por el repositorio.
   - Esto evita interfaces enormes y mantiene el repositorio enfocado en mutaciones de estado.

3. **Eventos = hechos de negocio**, no operaciones CRUD.
   - ✅ `vehicle.transfer.completed`, `workshop.member.invited`, `user.registered`
   - ❌ `vehicle.updated`, `user.created` (genérico)

4. **Handlers publican eventos** después de la operación del repositorio. Nunca desde Prisma.

5. **Inyección por token** siempre:

   ```ts
   @Inject(VEHICLE_REPOSITORY)
   private readonly repository: VehicleRepository;
   ```

6. **Commands reciben DTOs validados** directamente. El controller valida con class-validator, pasa al Command.

7. **Sin @nest/cqrs**. Cada Command/Query es una clase simple; su Handler es un `@Injectable()` de Nest con un método `execute()`.

---

## Plan de migración por fases

### Fase 1 — Fundación (common/ + infrastructure/)

```
src/
├── common/
│   ├── database/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts        # @Global()
│   ├── commands/
│   │   └── base.command.ts
│   ├── queries/
│   │   └── base.query.ts
│   ├── events/
│   │   └── base-event.ts
│   ├── exceptions/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   └── constants/
│
├── infrastructure/
│   ├── mail/
│   └── storage/
```

### Fase 2 — Módulo piloto: `users/`

- Implementar el módulo completo con todos los patrones
- Servir como referencia para los demás módulos
- Registrar en `AppModule`

### Fase 3 — Migración y creación de módulos

| Orden | Módulo            | Acción                                                   | Depende de          |
| ----- | ----------------- | -------------------------------------------------------- | ------------------- |
| 1     | `users/`          | Reestructurar desde `user/`                              | —                   |
| 2     | `auth/`           | Reestructurar: login, register, refresh                  | users               |
| 3     | `vehicles/`       | Merge `vehicle/` + `ownerships/`                         | users               |
| 4     | `workshops/`      | Merge `workshops/` + `employees/`                        | users               |
| 5     | `notifications/`  | Reestructurar desde `notifications/`                     | —                   |
| 6     | `maintenance/`    | Merge `service-records/` + `estimates/` + `work-orders/` | vehicles, workshops |
| 7     | `scheduling/`     | Merge `appointments/`                                    | vehicles, workshops |
| 8     | `billing/`        | Crear desde 0                                            | workshops           |
| 9     | `administration/` | Crear desde 0                                            | —                   |

### Módulos legacy a eliminar (después de migrar)

```
src/modules/
  appointments/    → scheduling/
  employees/       → workshops/
  estimates/       → maintenance/
  ownerships/      → vehicles/
  service-records/ → maintenance/
  user/            → users/
  vehicle/         → vehicles/
  work-orders/     → maintenance/
```

### AppModule final

```ts
@Module({
  imports: [
    PrismaModule,
    EventEmitterModule.forRoot(),
    UsersModule,
    AuthModule,
    WorkshopsModule,
    VehiclesModule,
    MaintenanceModule,
    SchedulingModule,
    BillingModule,
    AdministrationModule,
    NotificationsModule,
  ],
})
export class AppModule {}
```

---

## CQS — estructura de commands y queries

### Command

```
commands/
├── create-user/
│   ├── create-user.command.ts    # clase con datos planos
│   └── create-user.handler.ts    # @Injectable() { execute(cmd): Promise<R> }
```

### Query

```
queries/
├── get-user/
│   ├── get-user.query.ts         # clase con filtros/params
│   └── get-user.handler.ts      # @Injectable() { execute(query): Promise<R> }
```

Los handlers de **Query** pueden inyectar `PrismaService` directamente (sin repositorio) para consultas de solo lectura.

---

## Convenciones

| Elemento              | Convención                                                 |
| --------------------- | ---------------------------------------------------------- |
| Nombres de archivo    | `kebab-case`                                               |
| Nombres de clase      | `PascalCase`                                               |
| Nombres de tokens     | `UPPER_SNAKE_CASE`                                         |
| Nombre de evento      | `dominio.accion` (ej: `user.created`)                      |
| Método de handler     | `.execute()`                                               |
| Método de repositorio | `.create()`, `.update()`, `.delete()`, `.findById()`, etc. |
| DTO de entrada        | `CreateUserDto` (con decoradores class-validator)          |
| DTO de salida         | `UserResponseDto` (con decoradores class-transformer)      |
| Inyección             | `@Inject(TOKEN)` en handler, `@Injectable()` en listeners  |
