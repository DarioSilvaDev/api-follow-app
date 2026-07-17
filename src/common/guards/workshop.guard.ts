import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';

@Injectable()
export class WorkshopGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const workshopId = request.params.id;
    if (!workshopId) {
      throw new ForbiddenException('Workshop ID is required');
    }

    const member = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: { workshopId, userId: user.id },
      },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException('You are not an active member of this workshop');
    }

    return true;
  }
}
