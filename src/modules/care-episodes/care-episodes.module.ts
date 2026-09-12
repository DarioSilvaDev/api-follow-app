import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module';
import { CareEpisodesController } from './controllers/care-episodes.controller';
import { CreateCareEpisodeHandler } from './commands/create-care-episode/create-care-episode.handler';
import { CreateOwnerCareEpisodeHandler } from './commands/create-owner-care-episode/create-owner-care-episode.handler';
import { VerifyCareEpisodeHandler } from './commands/verify-care-episode/verify-care-episode.handler';
import { LookupVehicleHandler } from './queries/lookup-vehicle/lookup-vehicle.handler';
import { ListVerificationsHandler } from './queries/list-verifications/list-verifications.handler';

@Module({
  imports: [AuthorizationModule],
  controllers: [CareEpisodesController],
  providers: [
    CreateCareEpisodeHandler,
    CreateOwnerCareEpisodeHandler,
    VerifyCareEpisodeHandler,
    LookupVehicleHandler,
    ListVerificationsHandler,
  ],
})
export class CareEpisodesModule {}
