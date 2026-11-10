import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { envs } from '../../config/envs';
import { AuthorizationModule } from '../../common/authorization.module';
import { createModuleLoggerProvider } from '../../common/logger/create-module-logger';
import { CommitClaimHandler } from './commands/commit-claim/commit-claim.handler';
import { CreateClaimInviteHandler } from './commands/create-claim-invite/create-claim-invite.handler';
import { ReviewClaimHandler } from './commands/review-claim/review-claim.handler';
import { RevokeClaimHandler } from './commands/revoke-claim/revoke-claim.handler';
import { VerifyClaimHandler } from './commands/verify-claim/verify-claim.handler';
import { VehicleClaimPublicController } from './controllers/vehicle-claim-public.controller';
import { VehicleClaimsController } from './controllers/vehicle-claims.controller';
import { GetClaimChallengeHandler } from './queries/get-claim-challenge/get-claim-challenge.handler';
import { GetClaimHandler } from './queries/get-claim/get-claim.handler';
import { GetPublicClaimHandler } from './queries/get-public-claim/get-public-claim.handler';
import { ListClaimsHandler } from './queries/list-claims/list-claims.handler';
import { CareEpisodeClosedListener } from './listeners/care-episode-closed.listener';
import { VehicleClaimBlockedListener } from './listeners/vehicle-claim-blocked.listener';
import { VehicleClaimClaimedListener } from './listeners/vehicle-claim-claimed.listener';
import { VehicleClaimManualReviewListener } from './listeners/vehicle-claim-manual-review.listener';
import { VehicleClaimRevokedListener } from './listeners/vehicle-claim-revoked.listener';
import { VehicleClaimVerifyFailedListener } from './listeners/vehicle-claim-verify-failed.listener';
import { ClaimChallengeService } from './services/claim-challenge.service';
import { ClaimQrService } from './services/claim-qr.service';
import { ClaimStateService } from './services/claim-state.service';
import { ClaimTokenService } from './services/claim-token.service';

/**
 * VehicleClaimsModule — reclamo del vehículo (MVP "taller primero").
 *
 * C-2 expone la API pública; C-3 la API autenticada del taller. `PrismaModule`,
 * `StorageModule` y `EventEmitterModule` son globales; `JwtModule` se registra
 * con `JWT_SECRET` para resolver la sesión del commit desde el cookie (el
 * ticket usa un secret derivado propio en `ClaimTokenService`, nunca el plano).
 * `AuthorizationModule` provee los guards de taller y el `PermissionCache`.
 */
@Module({
  imports: [
    JwtModule.register({ secret: envs.JWT_SECRET }),
    AuthorizationModule,
  ],
  controllers: [VehicleClaimPublicController, VehicleClaimsController],
  providers: [
    createModuleLoggerProvider('VehicleClaims'),
    ClaimTokenService,
    ClaimChallengeService,
    ClaimStateService,
    ClaimQrService,
    GetPublicClaimHandler,
    GetClaimChallengeHandler,
    VerifyClaimHandler,
    CommitClaimHandler,
    CreateClaimInviteHandler,
    ListClaimsHandler,
    GetClaimHandler,
    ReviewClaimHandler,
    RevokeClaimHandler,
    CareEpisodeClosedListener,
    VehicleClaimVerifyFailedListener,
    VehicleClaimClaimedListener,
    VehicleClaimBlockedListener,
    VehicleClaimManualReviewListener,
    VehicleClaimRevokedListener,
  ],
})
export class VehicleClaimsModule {}
