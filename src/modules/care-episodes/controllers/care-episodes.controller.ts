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
import { CreateCareEpisodeDto } from '../dto/create-care-episode.dto';
import {
  CreateOwnerCareEpisodeDto,
  MAX_OWNER_CREATION_FILES,
} from '../dto/create-owner-care-episode.dto';
import { AttachEvidenceDto } from '../dto/attach-evidence.dto';
import { RemoveAttachmentDto } from '../dto/remove-attachment.dto';
import { CreateCareEpisodeCommand } from '../commands/create-care-episode/create-care-episode.command';
import { CreateCareEpisodeHandler } from '../commands/create-care-episode/create-care-episode.handler';
import { CreateOwnerCareEpisodeCommand } from '../commands/create-owner-care-episode/create-owner-care-episode.command';
import { CreateOwnerCareEpisodeHandler } from '../commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeCommand } from '../commands/verify-care-episode/verify-care-episode.command';
import { VerifyCareEpisodeHandler } from '../commands/verify-care-episode/verify-care-episode.handler';
import { AttachCareEpisodeAttachmentsCommand } from '../commands/attach-care-episode-attachments/attach-care-episode-attachments.command';
import { AttachCareEpisodeAttachmentsHandler } from '../commands/attach-care-episode-attachments/attach-care-episode-attachments.handler';
import { RemoveCareEpisodeAttachmentCommand } from '../commands/remove-care-episode-attachment/remove-care-episode-attachment.command';
import { RemoveCareEpisodeAttachmentHandler } from '../commands/remove-care-episode-attachment/remove-care-episode-attachment.handler';
import { LookupVehicleHandler } from '../queries/lookup-vehicle/lookup-vehicle.handler';
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
 *
 * Decisión TL: el lookup vive en este módulo (NO en vehicles) para evitar el
 * foot-gun de @Get(':id') de vehicles.controller (F-012).
 */
@Controller('care-episodes')
@UseGuards(JwtAuthGuard, ContextGuard)
export class CareEpisodesController {
  constructor(
    private readonly createCareEpisodeHandler: CreateCareEpisodeHandler,
    private readonly createOwnerCareEpisodeHandler: CreateOwnerCareEpisodeHandler,
    private readonly lookupVehicleHandler: LookupVehicleHandler,
    private readonly listVerificationsHandler: ListVerificationsHandler,
    private readonly verifyCareEpisodeHandler: VerifyCareEpisodeHandler,
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
  // GET /api/care-episodes/lookup?plate= — Buscar vehículo por placa
  // ──────────────────────────────────────────────────────────

  @Get('lookup')
  @UseGuards(WorkshopOnlyGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async lookup(@Query('plate') plate: string) {
    return this.lookupVehicleHandler.execute(plate);
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
  // POST /api/care-episodes/:id/verify — Confirmar verificación
  // ──────────────────────────────────────────────────────────
  // Foot-gun (F-012): la ruta estática `GET verifications` se declara ANTES de
  // que F-021/F-022 agregue `GET :id` (Express matchea por orden de registro:
  // si `:id` llegara antes, capturaría `verifications` como id). Hoy el único
  // `:id` es POST :id/verify (2 segmentos → no colisiona).

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
  // GET /api/care-episodes/:id — Detalle con proyección por actor (S1)
  // ──────────────────────────────────────────────────────────
  // F-012: se declara DESPUÉS de todas las rutas GET estáticas
  // (lookup, verifications); si llegara antes, `:id` capturaría esas rutas.
  // ?signed=true firma SOLO adjuntos activos.

  @Get(':id')
  async getDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    return this.getCareEpisodeHandler.execute(
      id,
      user,
      ctx,
      signed === 'true',
    );
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
