import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CheckInDto, MAX_CHECK_IN_FILES } from '../dto/check-in.dto';
import { CloseCareEpisodeDto } from '../dto/close-care-episode.dto';
import { CreateCareEpisodeDto } from '../dto/create-care-episode.dto';
import {
  CreateOwnerCareEpisodeDto,
  MAX_OWNER_CREATION_FILES,
} from '../dto/create-owner-care-episode.dto';
import { AttachEvidenceDto } from '../dto/attach-evidence.dto';
import { RemoveAttachmentDto } from '../dto/remove-attachment.dto';
import { CreateCareEpisodeCommand } from '../commands/create-care-episode/create-care-episode.command';
import { CreateCareEpisodeHandler } from '../commands/create-care-episode/create-care-episode.handler';
import { CheckInCommand } from '../commands/check-in/check-in.command';
import { CheckInHandler } from '../commands/check-in/check-in.handler';
import { CloseCareEpisodeCommand } from '../commands/close-care-episode/close-care-episode.command';
import { CloseCareEpisodeHandler } from '../commands/close-care-episode/close-care-episode.handler';
import { CreateOwnerCareEpisodeCommand } from '../commands/create-owner-care-episode/create-owner-care-episode.command';
import { CreateOwnerCareEpisodeHandler } from '../commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeCommand } from '../commands/verify-care-episode/verify-care-episode.command';
import { VerifyCareEpisodeHandler } from '../commands/verify-care-episode/verify-care-episode.handler';
import { RejectCareEpisodeDto } from '../dto/reject-care-episode.dto';
import { RejectCareEpisodeCommand } from '../commands/reject-care-episode/reject-care-episode.command';
import { RejectCareEpisodeHandler } from '../commands/reject-care-episode/reject-care-episode.handler';
import { AttachCareEpisodeAttachmentsCommand } from '../commands/attach-care-episode-attachments/attach-care-episode-attachments.command';
import { AttachCareEpisodeAttachmentsHandler } from '../commands/attach-care-episode-attachments/attach-care-episode-attachments.handler';
import { RemoveCareEpisodeAttachmentCommand } from '../commands/remove-care-episode-attachment/remove-care-episode-attachment.command';
import { RemoveCareEpisodeAttachmentHandler } from '../commands/remove-care-episode-attachment/remove-care-episode-attachment.handler';
import { LookupVehicleHandler } from '../queries/lookup-vehicle/lookup-vehicle.handler';
import { ListServiceTypesHandler } from '../queries/list-service-types/list-service-types.handler';
import { ListCareEpisodesHandler } from '../queries/list-care-episodes/list-care-episodes.handler';
import { ListVerificationsHandler } from '../queries/list-verifications/list-verifications.handler';
import { GetCareEpisodeHandler } from '../queries/get-care-episode/get-care-episode.handler';
import { evidenceFileFilter } from './attachment-upload.utils';

/**
 * CareEpisodesController — Check-in de vehículos en taller (F-020).
 *
 * Guard chain:
 *   POST  — JwtAuthGuard + ContextGuard (clase), WorkshopOnlyGuard + PermissionsGuard (método)
 *           WorkshopOnly va ANTES de Permissions (evita bypass de super_admin — D-024 A2).
 *   GET lookup — JwtAuthGuard + ContextGuard (clase), WorkshopOnlyGuard + ThrottlerGuard (método)
 *   GET list (F-023) — JwtAuthGuard + ContextGuard (clase), WorkshopOnlyGuard +
 *           PermissionsGuard + @Permissions('care-episode.list') (método)
 *
 * Decisión TL: el lookup vive en este módulo (NO en vehicles) para evitar el
 * foot-gun de @Get(':id') de vehicles.controller (F-012).
 */
@Controller('care-episodes')
@UseGuards(JwtAuthGuard, ContextGuard)
export class CareEpisodesController {
  constructor(
    private readonly createCareEpisodeHandler: CreateCareEpisodeHandler,
    private readonly checkInHandler: CheckInHandler,
    private readonly closeCareEpisodeHandler: CloseCareEpisodeHandler,
    private readonly createOwnerCareEpisodeHandler: CreateOwnerCareEpisodeHandler,
    private readonly lookupVehicleHandler: LookupVehicleHandler,
    private readonly listServiceTypesHandler: ListServiceTypesHandler,
    private readonly listCareEpisodesHandler: ListCareEpisodesHandler,
    private readonly listVerificationsHandler: ListVerificationsHandler,
    private readonly verifyCareEpisodeHandler: VerifyCareEpisodeHandler,
    private readonly rejectCareEpisodeHandler: RejectCareEpisodeHandler,
    private readonly getCareEpisodeHandler: GetCareEpisodeHandler,
    private readonly attachCareEpisodeAttachmentsHandler: AttachCareEpisodeAttachmentsHandler,
    private readonly removeCareEpisodeAttachmentHandler: RemoveCareEpisodeAttachmentHandler,
  ) {}

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes — Crear CareEpisode (check-in)
  // ──────────────────────────────────────────────────────────

  @Post()
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.create')
  async create(
    @Body() dto: CreateCareEpisodeDto,
    @ActiveContext() ctx: CurrentContext,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }

    const careEpisode = await this.createCareEpisodeHandler.execute(
      new CreateCareEpisodeCommand(dto, ctx.workshopId, ctx.memberId),
    );

    return careEpisode;
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/check-in — Check-in unificado (B-2)
  // ──────────────────────────────────────────────────────────
  // Recibe la PLACA (no vehicleId) y resuelve vehículo + atención + contacto
  // en una transacción. Mismo permiso que el alta existente (no se crea uno
  // nuevo para el ingreso). Ruta estática declarada antes de los POST
  // dinámicos (:id/verify, :id/attachments) por la regla F-012.
  //
  // Ruta DUAL (D-163, mismo patrón que POST /owner):
  //   - application/json → flujo histórico intacto.
  //   - multipart/form-data → mismos campos DTO como texto + campo `files`
  //     (máx. 1 foto del tablero, obligatoria en la excepción "no legible").
  // FilesInterceptor ignora requests no-multipart (multer solo parsea
  // multipart), por lo que los clientes JSON existentes no cambian.

  @Post('check-in')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.create')
  @UseInterceptors(
    FilesInterceptor('files', MAX_CHECK_IN_FILES, {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: MAX_CHECK_IN_FILES,
      },
      fileFilter: evidenceFileFilter,
    }),
  )
  async checkIn(
    @Body() dto: CheckInDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }

    return this.checkInHandler.execute(
      new CheckInCommand(dto, ctx.workshopId, ctx.memberId, user.id, files),
    );
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/lookup?plate= — Buscar vehículo por placa
  // ──────────────────────────────────────────────────────────

  @Get('lookup')
  @UseGuards(WorkshopOnlyGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async lookup(@Query('plate') plate: string) {
    return this.lookupVehicleHandler.execute(plate);
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/service-types — Catálogo del check-in (B-2)
  // ──────────────────────────────────────────────────────────
  // Ruta estática antes de `@Get(':id')` (F-012). Sin permiso extra: es
  // lectura de catálogo para el formulario de check-in.

  @Get('service-types')
  @UseGuards(WorkshopOnlyGuard)
  async listServiceTypes(@ActiveContext() ctx: CurrentContext) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    return this.listServiceTypesHandler.execute(ctx.workshopId);
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/owner — Registrar servicio del propietario
  // ──────────────────────────────────────────────────────────
  // Ruta DUAL (S6):
  //   - Content-Type application/json → flujo histórico intacto.
  //   - Content-Type multipart/form-data → mismos campos DTO como texto + campo
  //     `files` (máx. 5 imágenes) + `captions` repetido (index-matched).
  // FilesInterceptor ignora requests no-multipart (multer solo parsea
  // multipart), por lo que los clientes JSON existentes no cambian.
  // Errores multer: >5MB → 413, MIME → 400, >5 archivos → 400 (mapeados por
  // AllExceptionsFilter / evidenceFileFilter — mismo mecanismo que S4).
  // Orden F-012: `@Post('owner')` estático se declara ANTES de los POST
  // dinámicos (:id/verify, :id/attachments).

  @Post('owner')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_OWNER_CREATION_FILES, {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: MAX_OWNER_CREATION_FILES,
      },
      fileFilter: evidenceFileFilter,
    }),
  )
  async createOwner(
    @Body() dto: CreateOwnerCareEpisodeDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createOwnerCareEpisodeHandler.execute(
      new CreateOwnerCareEpisodeCommand(dto, user, files),
      ctx,
    );
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/verifications — Cola de verificaciones del taller
  // ──────────────────────────────────────────────────────────

  @Get('verifications')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.verify')
  async listVerifications(
    @ActiveContext() ctx: CurrentContext,
    @Query('limit') limit?: string,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return this.listVerificationsHandler.execute(ctx.workshopId, parsedLimit);
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes — Listado paginado de atenciones del taller (F-023)
  // ──────────────────────────────────────────────────────────
  // Workshop-scoped: el workshopId viene del contexto WORKSHOP activo (RF-1),
  // no de la URL. Orden F-012: la ruta raíz se declara ANTES de @Get(':id')
  // (y después de las rutas GET estáticas lookup/verifications). La raíz no
  // tiene segmento extra, por lo que :id jamás la capturaría — el orden se
  // mantiene por higiene y consistencia documental con el módulo.
  // WorkshopOnlyGuard ANTES de PermissionsGuard (anti-bypass D-024 A2,
  // patrón verbatim de POST /, POST :id/verify y POST :id/attachments).
  // Query params: page (default 1) / limit (default 20, clamp 1..100) /
  // q (patente, D-F023-1a — único filtro) — el saneo y los clamps viven en
  // el handler (D-TL-F023-4). `q` ausente, <2 caracteres tras trim o no-string
  // (?q=a&q=b) → se comporta como sin `q` (NO 400).

  @Get()
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.list')
  async list(
    @ActiveContext() ctx: CurrentContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }
    return this.listCareEpisodesHandler.execute({
      workshopId: ctx.workshopId,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      q,
    });
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/:id/verify — Confirmar verificación
  // ──────────────────────────────────────────────────────────
  // Foot-gun (F-012): la ruta estática `GET verifications` se declara ANTES de
  // que F-021/F-022 agregue `GET :id` (Express matchea por orden de registro:
  // si `:id` llegara antes, capturaría `verifications` como id). Hoy los
  // `:id` son POST :id/verify, POST :id/reject, POST :id/close y
  // POST :id/attachments (2 segmentos → no colisionan con las estáticas).

  @Post(':id/verify')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.verify')
  async verify(@Param('id') id: string, @ActiveContext() ctx: CurrentContext) {
    if (ctx.type !== 'WORKSHOP') {
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    return this.verifyCareEpisodeHandler.execute(
      new VerifyCareEpisodeCommand(id, ctx.workshopId, ctx.memberId),
    );
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/:id/reject — Rechazo del registro (RF-9)
  // ──────────────────────────────────────────────────────────
  // Mismos guards/permiso que :id/verify (D-203): WorkshopOnlyGuard ANTES de
  // PermissionsGuard (anti-bypass D-024 A2) y permiso REUTILIZADO
  // `care-episode.verify` (D-067) — cero cambios de seed. `@HttpCode(200)`
  // explícito: el default de POST es 201 y el rechazo responde 200 (estado
  // actual, idempotente). Sin throttle nuevo (one-shot, patrón de verify).

  @Post(':id/reject')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.verify')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCareEpisodeDto,
    @ActiveContext() ctx: CurrentContext,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException('Requires a WORKSHOP context');
    }
    return this.rejectCareEpisodeHandler.execute(
      new RejectCareEpisodeCommand(
        id,
        dto.reason ?? null,
        ctx.workshopId,
        ctx.memberId,
      ),
    );
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/:id/close — Cierre de atención (B-3)
  // ──────────────────────────────────────────────────────────
  // Única transición open → delivered. WorkshopOnlyGuard ANTES de
  // PermissionsGuard (anti-bypass D-024 A2). El evento `care-episode.closed`
  // se emite sólo después del commit (dentro del handler).

  @Post(':id/close')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.close')
  async close(
    @Param('id') id: string,
    @Body() dto: CloseCareEpisodeDto,
    @ActiveContext() ctx: CurrentContext,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard already rejects non-WORKSHOP contexts.
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }

    return this.closeCareEpisodeHandler.execute(
      new CloseCareEpisodeCommand(id, dto, ctx.workshopId, ctx.memberId),
    );
  }

  // ──────────────────────────────────────────────────────────
  // GET /api/care-episodes/:id — Detalle con proyección por actor (S1)
  // ──────────────────────────────────────────────────────────
  // F-012: se declara DESPUÉS de todas las rutas GET estáticas
  // (lookup, list, verifications); si llegara antes, `:id` capturaría esas rutas.
  // ?signed=true firma SOLO adjuntos activos.

  @Get(':id')
  async getDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    return this.getCareEpisodeHandler.execute(id, user, ctx, signed === 'true');
  }

  // ──────────────────────────────────────────────────────────
  // POST /api/care-episodes/:id/attachments — Evidencia del taller (S4)
  // ──────────────────────────────────────────────────────────
  // WorkshopOnlyGuard ANTES de PermissionsGuard (patrón anti-bypass de
  // super_admin — D-024 A2), igual que POST :id/verify.
  // Un archivo por request (FileInterceptor('files')); límite 5MB; MIME
  // restringido a imágenes. Errores multer: >5MB → 413, MIME → 400
  // (mapeados en AllExceptionsFilter / evidenceFileFilter).

  @Post(':id/attachments')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('care-episode.attach')
  @UseInterceptors(
    FileInterceptor('files', {
      limits: { fileSize: 5 * 1024 * 1024, files: 5 },
      fileFilter: evidenceFileFilter,
    }),
  )
  async attach(
    @Param('id') id: string,
    @Body() dto: AttachEvidenceDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @ActiveContext() ctx: CurrentContext,
  ) {
    if (ctx.type !== 'WORKSHOP') {
      // Unreachable: WorkshopOnlyGuard ya rechazó contextos no-WORKSHOP.
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }
    if (!file) {
      throw new BadRequestException('Se requiere un archivo de evidencia');
    }
    return this.attachCareEpisodeAttachmentsHandler.execute(
      new AttachCareEpisodeAttachmentsCommand(
        id,
        ctx.workshopId,
        ctx.memberId,
        dto.phase,
        dto.caption ?? null,
        file,
      ),
    );
  }

  // ──────────────────────────────────────────────────────────
  // DELETE /api/care-episodes/:id/attachments/:attachmentId — Void auditado (S5)
  // ──────────────────────────────────────────────────────────
  // Sin permission: la autorización vive en el handler (GATES 0-2).

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Body() dto: RemoveAttachmentDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.removeCareEpisodeAttachmentHandler.execute(
      new RemoveCareEpisodeAttachmentCommand(
        id,
        attachmentId,
        dto.removedReason ?? null,
        ctx,
        user,
      ),
    );
  }
}
