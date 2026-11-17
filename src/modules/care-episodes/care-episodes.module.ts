import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module';
import { CareEpisodesController } from './controllers/care-episodes.controller';
import { CreateCareEpisodeHandler } from './commands/create-care-episode/create-care-episode.handler';
import { CheckInHandler } from './commands/check-in/check-in.handler';
import { CloseCareEpisodeHandler } from './commands/close-care-episode/close-care-episode.handler';
import { CreateOwnerCareEpisodeHandler } from './commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeHandler } from './commands/verify-care-episode/verify-care-episode.handler';
import { RejectCareEpisodeHandler } from './commands/reject-care-episode/reject-care-episode.handler';
import { CareEpisodeRejectedEmailListener } from './listeners/care-episode-rejected-email.listener';
import { AttachCareEpisodeAttachmentsHandler } from './commands/attach-care-episode-attachments/attach-care-episode-attachments.handler';
import { RemoveCareEpisodeAttachmentHandler } from './commands/remove-care-episode-attachment/remove-care-episode-attachment.handler';
import { LookupVehicleHandler } from './queries/lookup-vehicle/lookup-vehicle.handler';
import { ListServiceTypesHandler } from './queries/list-service-types/list-service-types.handler';
import { ListCareEpisodesHandler } from './queries/list-care-episodes/list-care-episodes.handler';
import { ListVerificationsHandler } from './queries/list-verifications/list-verifications.handler';
import { GetCareEpisodeHandler } from './queries/get-care-episode/get-care-episode.handler';
import { createModuleLoggerProvider } from '../../common/logger/create-module-logger';

@Module({
  imports: [AuthorizationModule],
  controllers: [CareEpisodesController],
  providers: [
    createModuleLoggerProvider('Auth'),
    CreateCareEpisodeHandler,
    CheckInHandler,
    CloseCareEpisodeHandler,
    CreateOwnerCareEpisodeHandler,
    VerifyCareEpisodeHandler,
    RejectCareEpisodeHandler,
    CareEpisodeRejectedEmailListener,
    AttachCareEpisodeAttachmentsHandler,
    RemoveCareEpisodeAttachmentHandler,
    LookupVehicleHandler,
    ListServiceTypesHandler,
    ListCareEpisodesHandler,
    ListVerificationsHandler,
    GetCareEpisodeHandler,
  ],
})
export class CareEpisodesModule {}
