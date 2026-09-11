import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module';
import { CareEpisodesController } from './controllers/care-episodes.controller';
import { CreateCareEpisodeHandler } from './commands/create-care-episode/create-care-episode.handler';
import { LookupVehicleHandler } from './queries/lookup-vehicle/lookup-vehicle.handler';

@Module({
  imports: [AuthorizationModule],
  controllers: [CareEpisodesController],
  providers: [CreateCareEpisodeHandler, LookupVehicleHandler],
})
export class CareEpisodesModule {}
