import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module';
import { CareEpisodesController } from './controllers/care-episodes.controller';
import { CreateCareEpisodeHandler } from './commands/create-care-episode/create-care-episode.handler';
import { CreateOwnerCareEpisodeHandler } from './commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeHandler } from './commands/verify-care-episode/verify-care-episode.handler';
import { AttachCareEpisodeAttachmentsHandler } from './commands/attach-care-episode-attachments/attach-care-episode-attachments.handler';
import { RemoveCareEpisodeAttachmentHandler } from './commands/remove-care-episode-attachment/remove-care-episode-attachment.handler';
import { LookupVehicleHandler } from './queries/lookup-vehicle/lookup-vehicle.handler';
import { ListVerificationsHandler } from './queries/list-verifications/list-verifications.handler';
import { GetCareEpisodeHandler } from './queries/get-care-episode/get-care-episode.handler';

@Module({
  imports: [AuthorizationModule],
  controllers: [CareEpisodesController],
  providers: [
    CreateCareEpisodeHandler,
    CreateOwnerCareEpisodeHandler,
    VerifyCareEpisodeHandler,
    AttachCareEpisodeAttachmentsHandler,
    RemoveCareEpisodeAttachmentHandler,
    LookupVehicleHandler,
    ListVerificationsHandler,
    GetCareEpisodeHandler,
  ],
})
export class CareEpisodesModule {}
