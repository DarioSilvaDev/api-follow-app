# Plan: Sistema de Logger por Módulo

## Contexto

Actualmente la app usa `ConsoleLogger` de NestJS en `main.ts`. Las dependencias `nestjs-pino` y `pino-http` ya están en `package.json` pero sin usar. No hay un logger estructurado por módulo.

---

## Objetivo

Cada módulo (auth, users, workshops, vehicles, maintenance) debe tener su propia instancia de logger con contexto, permitiendo:

- Trazabilidad por módulo en los logs
- Niveles de log configurables por módulo
- Formato estructurado (JSON en prod, legible en dev)
- Correlación de requests (requestId)

---

## Propuesta: LoggerModule compartido + Logger por módulo

### 1. Activar nestjs-pino globalmente

Configurar `LoggerModule` importando `LoggerModule.from()` de nestjs-pino en `AppModule`, reemplazando el `ConsoleLogger` actual. Esto inyecta `PinoLogger` en toda la app.

### 2. Clase base `ModuleLogger`

Crear en `common/logger/module-logger.ts` una clase que extiende `PinoLogger` y asigna automáticamente el contexto del módulo:

```ts
@Injectable()
export class ModuleLogger extends PinoLogger {
  constructor(context: string) {
    super();
    this.setContext(context);
  }
}
```

### 3. Factory `createModuleLogger()`

Crear un provider factory para cada módulo:

```ts
// common/logger/logger.providers.ts
export function createModuleLoggerToken(moduleName: string): string {
  return `${moduleName.toUpperCase()}_LOGGER`;
}

export function createModuleLoggerProvider(moduleName: string): Provider {
  return {
    provide: createModuleLoggerToken(moduleName),
    useFactory: () => {
      const logger = new PinoLogger({});
      logger.setContext(moduleName);
      return logger;
    },
  };
}
```

### 4. Registrar el provider en cada módulo

Cada `XxxModule` declara su propio logger provider:

```ts
// modules/auth/auth.module.ts
@Module({
  providers: [
    createModuleLoggerProvider('Auth'),
    // ... otros providers
  ],
  exports: [createModuleLoggerToken('Auth')],
})
export class AuthModule {}
```

### 5. Usar en handlers, repositorios, listeners

```ts
@Injectable()
export class CreateUserHandler {
  constructor(
    @Inject(createModuleLoggerToken('Users'))
    private readonly logger: PinoLogger,
    // ...
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    this.logger.info({ email: command.email }, 'Creating user');
    // ...
  }
}
```

### 6. Opcional: Provider automático via `@Logger()` decorator

Crear un decorador por módulo:

```ts
export const AuthLogger = () => Inject(createModuleLoggerToken('Auth'));
```

Uso:

```ts
constructor(
  @AuthLogger() private readonly logger: PinoLogger,
) {}
```

---

## Implementación por fases

| Fase | Acción                                                                          | Archivos a crear/modificar                                             |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Configurar `LoggerModule.forRoot()` en AppModule y eliminar ConsoleLogger       | `src/app.module.ts`, `src/main.ts`                                     |
| 2    | Crear `common/logger/` con factory y helper                                     | `src/common/logger/logger.providers.ts`, `src/common/logger/index.ts`  |
| 3    | Registrar logger provider en módulo `auth`                                      | `src/modules/auth/auth.module.ts` + inyectar en handlers               |
| 4    | Registrar logger provider en módulo `users`                                     | `src/modules/users/users.module.ts` + inyectar en handlers             |
| 5    | Registrar logger provider en módulo `workshops`                                 | `src/modules/workshops/workshops.module.ts` + inyectar en handlers     |
| 6    | Registrar logger provider en módulo `vehicles`                                  | `src/modules/vehicles/vehicles.module.ts` + inyectar en handlers       |
| 7    | Registrar logger provider en módulo `maintenance`                               | `src/modules/maintenance/maintenance.module.ts` + inyectar en handlers |
| 8    | Configurar `pino-http` para correlación de requests (requestId)                 | `src/main.ts`                                                          |
| 9    | Agregar tests de integración verificando que cada módulo loggea con su contexto | tests                                                                  |

---

## Ejemplo de output esperado

```json
{"level":30,"time":1712345678000,"pid":1234,"context":"Auth","msg":"User logged in successfully","email":"user@example.com"}
{"level":40,"time":1712345679000,"pid":1234,"context":"Workshops","msg":"Workshop not found","workshopId":"abc-123"}
```

---

## Notas

- `nestjs-pino` ya está en `package.json` → no requiere instalación extra.
- Se puede cambiar el nivel de log por módulo vía `envs` si se desea.
- La correlación con requestId permite rastrear una request completa a través de múltiples módulos.
